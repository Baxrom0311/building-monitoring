"""ToolInstallerService — Auto-detection va auto-installation (esptool, platformio).

Cross-platform (macOS, Windows, Linux) muhitda esptool va platformio CLI
dasturlarini dinamik topish, bo'lmasa avtomatik pip orqali o'rnatish.
"""
import os
import sys
import shutil
import subprocess
from pathlib import Path


class ToolInstallerService:
    """esptool va platformio asboblarini dinamik boshqarish xizmati."""

    @staticmethod
    def get_app_dir() -> str:
        """Dastur uchun umumiy ma'lumotlar papkasini qaytaradi (~/.esp32studio)."""
        home = Path.home()
        app_dir = home / ".esp32studio"
        app_dir.mkdir(parents=True, exist_ok=True)
        (app_dir / "firmware_cache").mkdir(exist_ok=True)
        (app_dir / "logs").mkdir(exist_ok=True)
        return str(app_dir)

    @classmethod
    def find_esptool(cls) -> list[str] | None:
        """esptool buyrug'ini dinamik topadi.
        
        Qaytardi: ['python', '-m', 'esptool'] yoki ['/path/to/esptool']
        """
        py_bin = sys.executable

        # 1. Joriy Python atrofida esptool moduli bormi?
        try:
            res = subprocess.run(
                [py_bin, "-m", "esptool", "version"],
                capture_output=True, text=True, timeout=4
            )
            if res.returncode == 0:
                return [py_bin, "-m", "esptool"]
        except Exception:
            pass

        # 2. PATH tizimida esptool mavjudmi?
        which_esp = shutil.which("esptool.py") or shutil.which("esptool")
        if which_esp:
            try:
                res = subprocess.run([which_esp, "version"], capture_output=True, text=True, timeout=4)
                if res.returncode == 0:
                    return [which_esp]
            except Exception:
                pass

        # 3. Standard user bin papkalarini tekshirish
        home = Path.home()
        candidates = []
        if sys.platform == "win32":
            candidates = [
                home / "AppData" / "Roaming" / "Python" / f"Python{sys.version_info.major}{sys.version_info.minor}" / "Scripts" / "esptool.exe",
                home / ".local" / "bin" / "esptool.exe",
            ]
        else:
            candidates = [
                home / ".local" / "bin" / "esptool",
                Path("/usr/local/bin/esptool"),
                Path("/opt/homebrew/bin/esptool"),
            ]

        for cand in candidates:
            if cand.exists() and os.access(str(cand), os.X_OK):
                return [str(cand)]

        return None

    @classmethod
    def ensure_esptool(cls, log_cb=None) -> list[str]:
        """esptool borligini tekshiradi, yo'q bo'lsa avtomatik pip install esptool qiladi."""
        found = cls.find_esptool()
        if found:
            return found

        if log_cb:
            log_cb("esptool topilmadi. Avtomatik o'rnatilmoqda (pip install esptool)...", "#fbbf24")

        py_bin = sys.executable
        cmd = [py_bin, "-m", "pip", "install", "--upgrade", "esptool"]
        res = subprocess.run(cmd, capture_output=True, text=True)

        if res.returncode == 0:
            if log_cb:
                log_cb("esptool muvaffaqiyatli o'rnatildi!", "#4ade80")
            found_after = cls.find_esptool()
            if found_after:
                return found_after

        # Fallback python -m esptool
        return [py_bin, "-m", "esptool"]

    @classmethod
    def find_platformio(cls) -> str | None:
        """PlatformIO CLI (pio) buyrug'ini dinamik topadi."""
        # 1. PATH tizimida pio yoki platformio mavjudmi?
        which_pio = shutil.which("pio") or shutil.which("platformio")
        if which_pio:
            try:
                res = subprocess.run([which_pio, "--version"], capture_output=True, text=True, timeout=4)
                if res.returncode == 0:
                    return which_pio
            except Exception:
                pass

        # 2. Standart PlatformIO virtualenv va foydalanuvchi yo'llari
        home = Path.home()
        candidates = []
        if sys.platform == "win32":
            candidates = [
                home / ".platformio" / "penv" / "Scripts" / "pio.exe",
                home / ".platformio" / "penv" / "Scripts" / "platformio.exe",
                home / "AppData" / "Roaming" / "Python" / f"Python{sys.version_info.major}{sys.version_info.minor}" / "Scripts" / "pio.exe",
            ]
        else:
            candidates = [
                home / ".platformio" / "penv" / "bin" / "pio",
                home / ".platformio" / "penv" / "bin" / "platformio",
                home / ".local" / "bin" / "pio",
                Path("/usr/local/bin/pio"),
                Path("/opt/homebrew/bin/pio"),
            ]

        for cand in candidates:
            if cand.exists() and os.access(str(cand), os.X_OK):
                try:
                    res = subprocess.run([str(cand), "--version"], capture_output=True, text=True, timeout=4)
                    if res.returncode == 0:
                        return str(cand)
                except Exception:
                    continue

        return None

    @classmethod
    def ensure_platformio(cls, log_cb=None) -> str | None:
        """PlatformIO borligini tekshiradi, yo'q bo'lsa pip install platformio qiladi."""
        found = cls.find_platformio()
        if found:
            return found

        if log_cb:
            log_cb("PlatformIO CLI topilmadi. Avtomatik o'rnatilmoqda (pip install platformio)...", "#fbbf24")

        py_bin = sys.executable
        cmd = [py_bin, "-m", "pip", "install", "--upgrade", "platformio"]
        res = subprocess.run(cmd, capture_output=True, text=True)

        if res.returncode == 0:
            if log_cb:
                log_cb("PlatformIO muvaffaqiyatli o'rnatildi!", "#4ade80")
            return cls.find_platformio()

        return None
