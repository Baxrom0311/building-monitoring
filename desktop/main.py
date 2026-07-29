"""ESP32 Studio — Desktop Application Entrypoint.

Cross-platform (macOS, Windows, Linux) ESP32 Firmware Flasher and Dual Serial Monitor IDE.
"""
import sys
import os
import traceback
from datetime import datetime
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PyQt6.QtWidgets import QApplication, QMessageBox
from PyQt6.QtGui import QFont, QIcon

from services.tool_installer import ToolInstallerService
from ui.styles import DARK_THEME
from ui.main_window import ESP32StudioWindow


def setup_exception_handler():
    """Unhandled exception handler for production stability."""
    logs_dir = Path(ToolInstallerService.get_app_dir()) / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    crash_log = logs_dir / "crash.log"

    def handle_exception(exc_type, exc_value, exc_traceback):
        if issubclass(exc_type, KeyboardInterrupt):
            sys.__excepthook__(exc_type, exc_value, exc_traceback)
            return

        err_msg = "".join(traceback.format_exception(exc_type, exc_value, exc_traceback))
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        try:
            with open(crash_log, "a", encoding="utf-8") as f:
                f.write(f"\n--- CRASH LOG [{timestamp}] ---\n{err_msg}\n")
        except Exception:
            pass

        app = QApplication.instance()
        if app:
            msg_box = QMessageBox()
            msg_box.setIcon(QMessageBox.Icon.Critical)
            msg_box.setWindowTitle("ESP32 Studio — Xatolik")
            msg_box.setText("Kutilmagan xatolik yuz berdi:")
            msg_box.setInformativeText(str(exc_value))
            msg_box.setDetailedText(err_msg)
            msg_box.exec()

    sys.excepthook = handle_exception


def main():
    setup_exception_handler()

    # Fix taskbar icon on Windows
    if sys.platform == "win32":
        import ctypes
        try:
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("toshelectroapparat.esp32studio.1.0")
        except Exception:
            pass

    app = QApplication(sys.argv)
    app.setApplicationName("ESP32 Studio")
    app.setStyle("Fusion")
    app.setStyleSheet(DARK_THEME)
    app.setFont(QFont("Inter", 10))

    base_dir = os.path.dirname(os.path.abspath(__file__))
    icon_path = os.path.join(base_dir, "app_icon.png")
    if os.path.exists(icon_path):
        app.setWindowIcon(QIcon(icon_path))

    window = ESP32StudioWindow()
    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
