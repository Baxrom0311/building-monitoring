"""FlashController — ESP32 firmware yuklash, yuklab olish va serial monitor boshqaruvchisi.

QThread workerlar yordamida barcha I/O operatsiyalar fonda bajariladi.
"""
import os
import re
import time
import tempfile
import subprocess
import serial
from PyQt6.QtCore import QObject, QThread, pyqtSignal

from services.flash_service import FlashService
from services.esptool_service import EsptoolService
from services.api_client import ApiClient


# ═══════════════════════════════════════════════════════════════════════════════
# QThread Worker — Login
# ═══════════════════════════════════════════════════════════════════════════════

class LoginWorker(QThread):
    """Serverga login qiluvchi background thread."""
    success = pyqtSignal(dict)    # {"access_token": ..., "user": {...}}
    error = pyqtSignal(str)       # error message

    def __init__(self, api: ApiClient, username: str, password: str):
        super().__init__()
        self.api = api
        self.username = username
        self.password = password

    def run(self):
        try:
            result = self.api.login(self.username, self.password)
            self.success.emit(result)
        except Exception as e:
            self.error.emit(str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# QThread Worker — Firmware yuklab olish
# ═══════════════════════════════════════════════════════════════════════════════

class FirmwareListWorker(QThread):
    """Serverdan firmware ro'yxatini oluvchi background thread."""
    result = pyqtSignal(list)       # firmware list
    error = pyqtSignal(str)         # error message

    def __init__(self, api: ApiClient):
        super().__init__()
        self.api = api

    def run(self):
        try:
            items = self.api.list_firmware()
            self.result.emit(items)
        except Exception as e:
            self.error.emit(str(e))


class DownloadFirmwareWorker(QThread):
    """Serverdan firmware faylini yuklab oluvchi background thread."""
    log_line = pyqtSignal(str, str)   # (text, color)
    progress = pyqtSignal(int)        # 0-100
    done = pyqtSignal(bool, str)      # (success, dest_path_or_error)

    def __init__(self, api: ApiClient, filename: str, dest_path: str):
        super().__init__()
        self.api = api
        self.filename = filename
        self.dest_path = dest_path

    def run(self):
        try:
            self.log_line.emit(f"Yuklab olinmoqda: {self.filename}...", "#38bdf8")
            self.api.download_firmware(
                self.filename,
                self.dest_path,
                progress_cb=lambda p: self.progress.emit(p)
            )
            size_kb = os.path.getsize(self.dest_path) / 1024
            self.log_line.emit(f"Yuklandi: {size_kb:.0f} KB", "#4ade80")
            self.done.emit(True, self.dest_path)
        except Exception as e:
            self.done.emit(False, str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# QThread Worker — esptool flash
# ═══════════════════════════════════════════════════════════════════════════════

class DirectFlashWorker(QThread):
    """esptool.py orqali .bin faylni ESP32 ga uruvchi background thread."""
    log_line = pyqtSignal(str, str)   # (text, color)
    progress = pyqtSignal(int)        # 0-100
    done = pyqtSignal(bool, str)      # (success, message)

    def __init__(self, port: str, bin_path: str, offset: str = "0x10000",
                 baud: int = 460800, chip: str = "auto", erase_first: bool = False):
        super().__init__()
        self.port = port
        self.bin_path = bin_path
        self.offset = offset
        self.baud = baud
        self.chip = chip
        self.erase_first = erase_first
        self._cancelled = False
        self._proc = None

    def cancel(self):
        self._cancelled = True
        if self._proc:
            try:
                self._proc.terminate()
            except Exception:
                pass

    def run(self):
        self._cancelled = False
        if not os.path.exists(self.bin_path):
            self.done.emit(False, f"Firmware topilmadi: {self.bin_path}")
            return

        size_kb = os.path.getsize(self.bin_path) / 1024
        self.log_line.emit(f"ESP32 ga firmware yuklanmoqda...", "#38bdf8")
        self.log_line.emit(f"Port: {self.port}  |  Tezlik: {self.baud}", "#94a3b8")
        self.log_line.emit(f"Fayl: {os.path.basename(self.bin_path)} ({size_kb:.0f} KB)", "#94a3b8")
        self.progress.emit(5)

        try:
            # Erase so'ralgan bo'lsa — faqat NVS bo'limini tozalaymiz.
            # To'liq --erase-all bootloader/partition table ni ham o'chirib,
            # app-only flash rejimida platani ishlamay qoldiradi.
            if self.erase_first:
                self.log_line.emit("Sozlamalar (NVS) tozalanmoqda...", "#fbbf24")
                self._proc = EsptoolService.erase_nvs(
                    port=self.port, baud=self.baud, chip=self.chip
                )
                for line in iter(self._proc.stdout.readline, ''):
                    if self._cancelled:
                        break
                    line_str = line.strip()
                    if line_str:
                        self.log_line.emit(line_str, "#94a3b8")
                self._proc.stdout.close()
                erase_rc = self._proc.wait()
                if self._cancelled:
                    self.done.emit(False, "Bekor qilindi.")
                    return
                if erase_rc != 0:
                    self.done.emit(False, f"NVS tozalash xatosi (exit code {erase_rc}).")
                    return
                self.log_line.emit("NVS tozalandi.", "#4ade80")

            self._proc = EsptoolService.flash_binary(
                port=self.port, bin_path=self.bin_path, offset=self.offset,
                baud=self.baud, chip=self.chip
            )

            prog_re = re.compile(r"(\d+(?:\.\d+)?)\s*%")
            for line in iter(self._proc.stdout.readline, ''):
                if self._cancelled:
                    break
                line_str = line.strip()
                if not line_str:
                    continue

                color = "#cbd5e1"
                if "error" in line_str.lower() or "fatal" in line_str.lower():
                    color = "#f87171"
                elif "writing at" in line_str.lower():
                    color = "#38bdf8"
                    match = prog_re.search(line_str)
                    if match:
                        self.progress.emit(int(float(match.group(1))))
                elif "hash of data verified" in line_str.lower() or "leaving..." in line_str.lower():
                    color = "#4ade80"
                    self.progress.emit(100)

                self.log_line.emit(line_str, color)

            self._proc.stdout.close()
            rc = self._proc.wait()

            if rc == 0 and not self._cancelled:
                self.progress.emit(100)
                self.done.emit(True, "Firmware muvaffaqiyatli yuklandi!")
            else:
                self.done.emit(False, f"Xatolik (exit code {rc}). Port va boot mode ni tekshiring.")

        except Exception as e:
            self.done.emit(False, f"Xatolik: {str(e)}")


# ═══════════════════════════════════════════════════════════════════════════════
# QThread Worker — NVS tozalash
# ═══════════════════════════════════════════════════════════════════════════════

class EraseNvsWorker(QThread):
    """NVS bo'limini (0x9000, 0x5000) tozalovchi background thread."""
    log_line = pyqtSignal(str, str)   # (text, color)
    done = pyqtSignal(bool, str)      # (success, message)

    def __init__(self, port: str, baud: int = 115200, chip: str = "auto"):
        super().__init__()
        self.port = port
        self.baud = baud
        self.chip = chip
        self._cancelled = False
        self._proc = None

    def cancel(self):
        self._cancelled = True
        if self._proc:
            try:
                self._proc.terminate()
            except Exception:
                pass

    def run(self):
        self._cancelled = False
        self.log_line.emit(f"Sozlamalar (NVS) tozalanmoqda: {self.port}...", "#fbbf24")
        try:
            self._proc = EsptoolService.erase_nvs(self.port, self.baud, self.chip)
            for line in iter(self._proc.stdout.readline, ''):
                if self._cancelled:
                    break
                line_str = line.strip()
                if line_str:
                    self.log_line.emit(line_str, "#94a3b8")
            self._proc.stdout.close()
            rc = self._proc.wait()

            if rc == 0 and not self._cancelled:
                self.done.emit(True, "Sozlamalar (NVS) tozalandi.")
            else:
                self.done.emit(False, f"NVS tozalash xatosi (exit code {rc}).")
        except Exception as e:
            self.done.emit(False, f"Xatolik: {str(e)}")


# ═══════════════════════════════════════════════════════════════════════════════
# QThread Worker — Chip Info
# ═══════════════════════════════════════════════════════════════════════════════

class ChipInfoWorker(QThread):
    """ESP32 chip ma'lumotlarini oluvchi background thread."""
    info_signal = pyqtSignal(dict)

    def __init__(self, port: str, baud: int = 115200):
        super().__init__()
        self.port = port
        self.baud = baud

    def run(self):
        info = EsptoolService.get_chip_info(self.port, self.baud)
        self.info_signal.emit(info)


# ═══════════════════════════════════════════════════════════════════════════════
# QThread Worker — Serial Monitor
# ═══════════════════════════════════════════════════════════════════════════════

class SerialMonitorWorker(QThread):
    """Serial portdan ma'lumot o'quvchi va yuboruvchi background thread."""
    data_received = pyqtSignal(str, str)    # (port, line_text)
    status_changed = pyqtSignal(str, bool, str)  # (port, connected, msg)

    def __init__(self, port: str, baud: int = 115200):
        super().__init__()
        self.port = port
        self.baud = baud
        self._running = False
        self._ser = None

    def stop(self):
        # Faqat flag qo'yamiz — portni run() o'zi (o'z thread ida) yopadi.
        self._running = False

    def send_command(self, cmd: str):
        if self._ser and self._ser.is_open:
            try:
                self._ser.write((cmd + "\r\n").encode("utf-8"))
            except Exception as e:
                self.data_received.emit(self.port, f"[ERR] {str(e)}")

    def run(self):
        self._running = True
        try:
            self._ser = serial.Serial(self.port, self.baud, timeout=0.1)
            self.status_changed.emit(self.port, True, f"Ulandi: {self.port} @ {self.baud}")

            buf = ""
            while self._running:
                if self._ser.in_waiting > 0:
                    raw = self._ser.read(self._ser.in_waiting).decode("utf-8", errors="replace")
                    buf += raw
                    while "\n" in buf:
                        line, buf = buf.split("\n", 1)
                        line_clean = line.strip("\r")
                        if line_clean:
                            self.data_received.emit(self.port, line_clean)
                else:
                    time.sleep(0.05)

        except Exception as e:
            self.status_changed.emit(self.port, False, f"Port xatosi: {str(e)}")
        finally:
            if self._ser and self._ser.is_open:
                try:
                    self._ser.close()
                except Exception:
                    pass
            self.status_changed.emit(self.port, False, f"Uzildi: {self.port}")


# ═══════════════════════════════════════════════════════════════════════════════
# Asosiy Controller
# ═══════════════════════════════════════════════════════════════════════════════

class FlashController(QObject):
    """Barcha flashing, download va serial workerlarni koordinatsiya qiladi."""

    def __init__(self):
        super().__init__()
        self.pio_path = FlashService.find_pio()
        self.project_root = FlashService.find_project_root()
        self._active_flash_worker = None
        self._active_chip_worker = None
        self._active_download_worker = None
        self._active_list_worker = None
        self._active_login_worker = None
        self._active_erase_worker = None
        self._serial_workers = {}

    # ── Login ─────────────────────────────────────────────────────────────

    def login(self, api: ApiClient, username: str, password: str,
              success_cb=None, error_cb=None):
        """Serverga login (background)."""
        if self._active_login_worker and self._active_login_worker.isRunning():
            return
        worker = LoginWorker(api, username, password)
        if success_cb:
            worker.success.connect(success_cb)
        if error_cb:
            worker.error.connect(error_cb)
        self._active_login_worker = worker
        worker.start()

    # ── Firmware ro'yxati ──────────────────────────────────────────────────

    def fetch_firmware_list(self, api: ApiClient, result_cb, error_cb):
        """Serverdan firmware ro'yxatini oladi (background)."""
        if self._active_list_worker and self._active_list_worker.isRunning():
            return
        worker = FirmwareListWorker(api)
        worker.result.connect(result_cb)
        worker.error.connect(error_cb)
        self._active_list_worker = worker
        worker.start()

    # ── Firmware yuklab olish ──────────────────────────────────────────────

    def download_firmware(self, api: ApiClient, filename: str, dest_path: str,
                          log_cb=None, prog_cb=None, finish_cb=None):
        """Serverdan firmware yuklab olish (background)."""
        if self._active_download_worker and self._active_download_worker.isRunning():
            return
        worker = DownloadFirmwareWorker(api, filename, dest_path)
        if log_cb:
            worker.log_line.connect(log_cb)
        if prog_cb:
            worker.progress.connect(prog_cb)
        if finish_cb:
            worker.done.connect(finish_cb)
        self._active_download_worker = worker
        worker.start()

    # ── Flashing ──────────────────────────────────────────────────────────

    def start_direct_flash(self, port: str, bin_path: str,
                           offset: str = "0x10000", baud: int = 460800,
                           chip: str = "auto", erase_first: bool = False,
                           log_cb=None, prog_cb=None, finish_cb=None):
        """To'g'ridan-to'g'ri .bin flashing jarayonini boshlaydi."""
        if self._active_flash_worker and self._active_flash_worker.isRunning():
            return False, "Flashing allaqachon ishlayapti!"

        self.stop_serial_monitor(port)

        worker = DirectFlashWorker(port=port, bin_path=bin_path, offset=offset,
                                   baud=baud, chip=chip, erase_first=erase_first)
        if log_cb:
            worker.log_line.connect(log_cb)
        if prog_cb:
            worker.progress.connect(prog_cb)
        if finish_cb:
            worker.done.connect(finish_cb)

        self._active_flash_worker = worker
        worker.start()
        return True, "Flashing boshlandi"

    def cancel_flash(self):
        if self._active_flash_worker and self._active_flash_worker.isRunning():
            self._active_flash_worker.cancel()

    # ── NVS tozalash ──────────────────────────────────────────────────────

    def start_erase_nvs(self, port: str, baud: int = 115200,
                        log_cb=None, finish_cb=None):
        """NVS bo'limini tozalash jarayonini boshlaydi (background)."""
        if self._active_erase_worker and self._active_erase_worker.isRunning():
            return False, "Tozalash allaqachon ishlayapti!"
        if self._active_flash_worker and self._active_flash_worker.isRunning():
            return False, "Flashing ishlayapti — kutib turing!"

        self.stop_serial_monitor(port)

        worker = EraseNvsWorker(port, baud)
        if log_cb:
            worker.log_line.connect(log_cb)
        if finish_cb:
            worker.done.connect(finish_cb)

        self._active_erase_worker = worker
        worker.start()
        return True, "Tozalash boshlandi"

    # ── Chip Info ─────────────────────────────────────────────────────────

    def fetch_chip_info(self, port: str, baud: int, callback):
        if self._active_chip_worker and self._active_chip_worker.isRunning():
            return
        worker = ChipInfoWorker(port, baud)
        worker.info_signal.connect(callback)
        self._active_chip_worker = worker
        worker.start()

    # ── Serial Monitor ────────────────────────────────────────────────────

    def start_serial_monitor(self, port: str, baud: int,
                             data_cb, status_cb) -> SerialMonitorWorker:
        self.stop_serial_monitor(port)
        worker = SerialMonitorWorker(port, baud)
        worker.data_received.connect(data_cb)
        worker.status_changed.connect(status_cb)
        self._serial_workers[port] = worker
        worker.start()
        return worker

    def stop_serial_monitor(self, port: str):
        if port in self._serial_workers:
            w = self._serial_workers.pop(port)
            w.stop()
            w.wait(2000)

    # ── Yopilish ──────────────────────────────────────────────────────────

    def wait_all(self, timeout_ms: int = 3000):
        """Barcha aktiv workerlarning tugashini kutadi (dastur yopilishida)."""
        workers = [
            self._active_flash_worker, self._active_erase_worker,
            self._active_chip_worker, self._active_download_worker,
            self._active_list_worker, self._active_login_worker,
        ]
        workers += list(self._serial_workers.values())
        self._serial_workers.clear()
        for w in workers:
            if w and w.isRunning():
                if hasattr(w, "stop"):
                    w.stop()
                elif hasattr(w, "cancel"):
                    w.cancel()
                w.wait(timeout_ms)
