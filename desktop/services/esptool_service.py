"""esptool service — ESP32 to'g'ridan-to'g'ri esptool orqali proshivka urish va chip diagnostikasi.

Cross-platform (macOS, Windows, Linux) dinamic va avtomatik o'rnatiladigan muhit.
"""
import sys
import os
import subprocess
import serial.tools.list_ports
from services.tool_installer import ToolInstallerService


class EsptoolService:
    """esptool yordamida ESP32 mikrokontrollerlari bilan ishlash xizmati."""

    @staticmethod
    def list_serial_ports() -> list[dict]:
        """Tizimdagi barcha ulangan USB-Serial portlarni qaytaradi."""
        ports = []
        for p in serial.tools.list_ports.comports():
            dev = p.device
            desc = p.description or "USB Serial Port"
            hwid = p.hwid or ""

            is_esp = False
            if any(vid in hwid for vid in ["1A86:7523", "10C4:EA60", "303A:", "0403:6001"]):
                is_esp = True

            ports.append({
                "device": dev,
                "description": desc,
                "hwid": hwid,
                "is_esp": is_esp,
                "display_name": f"{dev} — {desc}" if desc != "n/a" else dev
            })
        return ports

    @classmethod
    def get_esptool_cmd(cls, log_cb=None) -> list[str]:
        """esptool buyrug'ini dinamik topadi yoki avtomatik o'rnatadi."""
        return ToolInstallerService.ensure_esptool(log_cb=log_cb)

    @classmethod
    def get_chip_info(cls, port: str, baud: int = 115200) -> dict:
        """ESP32 chip ma'lumotlarini (MAC, Flash hajmi, Chip turi) oladi."""
        esp_cmd = cls.get_esptool_cmd()
        cmd = esp_cmd + ["--port", port, "--baud", str(baud), "chip_id"]

        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            output = res.stdout + "\n" + res.stderr
            info = {
                "raw": output,
                "chip_type": "ESP32",
                "mac": "N/A",
                "features": "N/A",
                "success": res.returncode == 0
            }

            for line in output.splitlines():
                line_lower = line.lower()
                if "detecting chip type" in line_lower:
                    tail = line.split("...")[-1].strip()
                    if tail:
                        info["chip_type"] = tail
                elif "chip is" in line_lower:
                    info["chip_type"] = line[line_lower.index("chip is") + len("chip is"):].strip()
                elif "chip type:" in line_lower:
                    info["chip_type"] = line.split(":", 1)[-1].strip()
                elif "mac:" in line_lower:
                    info["mac"] = line.split("MAC:")[-1].strip()
                elif "features:" in line_lower:
                    info["features"] = line.split("Features:")[-1].strip()

            cmd_flash = esp_cmd + ["--port", port, "--baud", str(baud), "flash_id"]
            res_flash = subprocess.run(cmd_flash, capture_output=True, text=True, timeout=10)
            if res_flash.returncode == 0:
                for line in res_flash.stdout.splitlines():
                    if "Detected flash size:" in line:
                        info["flash_size"] = line.split(":")[-1].strip()

            return info
        except Exception as e:
            return {"success": False, "error": str(e), "raw": str(e)}

    @classmethod
    def erase_flash(cls, port: str, baud: int = 115200, chip: str = "auto", log_cb=None) -> subprocess.Popen:
        """ESP32 xotirasini to'liq tozalaydi (erase_flash)."""
        esp_cmd = cls.get_esptool_cmd(log_cb=log_cb)
        cmd = esp_cmd + ["--chip", chip, "--port", port, "--baud", str(baud), "erase_flash"]
        return subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )

    @classmethod
    def erase_nvs(cls, port: str, baud: int = 115200, chip: str = "auto", log_cb=None) -> subprocess.Popen:
        """Faqat NVS bo'limini tozalaydi (0x9000, 0x5000 bayt)."""
        esp_cmd = cls.get_esptool_cmd(log_cb=log_cb)
        cmd = esp_cmd + ["--chip", chip, "--port", port, "--baud", str(baud),
                         "erase_region", "0x9000", "0x5000"]
        return subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )

    @classmethod
    def flash_binary(
        cls,
        port: str,
        bin_path: str,
        offset: str = "0x10000",
        baud: int = 460800,
        chip: str = "auto",
        extra_files: list[tuple[str, str]] | None = None,
        log_cb=None,
    ) -> subprocess.Popen:
        """Firmware binary faylini ESP32 ga yuklaydi."""
        esp_cmd = cls.get_esptool_cmd(log_cb=log_cb)
        cmd = esp_cmd + [
            "--chip", chip,
            "--port", port,
            "--baud", str(baud),
            "--before", "default_reset",
            "--after", "hard_reset",
            "write_flash", "-z",
        ]

        if extra_files:
            for off, path in extra_files:
                cmd.extend([off, path])

        cmd.extend([offset, bin_path])

        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"

        return subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=env
        )
