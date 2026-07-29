"""Master Packaging Script for ESP32 Studio.

Windows: PyInstaller -> Inno Setup (ESP32Studio_Setup_v1.0.0.exe)
Ubuntu/Linux: PyInstaller / dpkg-deb (esp32-studio_1.0.0_amd64.deb)
macOS: PyInstaller -> .app bundle / DMG
"""
import os
import sys
import shutil
import subprocess
from pathlib import Path


def main():
    pkg_dir = Path(__file__).parent.resolve()
    desktop_dir = pkg_dir.parent.resolve()

    print(f"=== ESP32 Studio Master Packaging ===")
    print(f"Platform: {sys.platform}")
    print(f"Workspace: {desktop_dir}\n")

    # 1. Ensure PyInstaller is installed
    try:
        import PyInstaller
    except ImportError:
        print("PyInstaller o'rnatilmoqda...")
        subprocess.run([sys.executable, "-m", "pip", "install", "pyinstaller"], check=True)

    # 2. Run PyInstaller
    spec_path = pkg_dir / "esp32studio.spec"
    print(f"1. PyInstaller yordamida EXE/Binary yig'ilmoqda: {spec_path}...")
    subprocess.run(
        [sys.executable, "-m", "PyInstaller", str(spec_path), "--noconfirm", "--clean"],
        cwd=str(desktop_dir),
        check=True
    )

    print("PyInstaller yig'ish muvaffaqiyatli tugadi!")

    # 3. Platform specific installers
    if sys.platform == "win32":
        # Inno Setup ISCC compiler search
        iscc_paths = [
            r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
            r"C:\Program Files\Inno Setup 6\ISCC.exe",
            shutil.which("ISCC.exe") or shutil.which("iscc"),
        ]
        iscc = next((p for p in iscc_paths if p and os.path.exists(p)), None)
        if iscc:
            print("2. Inno Setup orqali Windows Installer (.exe) yaratilmoqda...")
            iss_path = pkg_dir / "inno_setup.iss"
            subprocess.run([iscc, str(iss_path)], cwd=str(pkg_dir), check=True)
            print("Windows setup.exe yaratildi!")
        else:
            print("[DIQQAT] Inno Setup 6 topilmadi (ISCC.exe). Faqat PyInstaller dist/ katalogi tayyorlandi.")

    elif sys.platform.startswith("linux"):
        # Build Debian package if dpkg-deb is available
        if shutil.which("dpkg-deb"):
            print("2. Ubuntu / Debian paket (.deb) yaratilmoqda...")
            sh_path = pkg_dir / "build_deb.sh"
            subprocess.run(["bash", str(sh_path)], cwd=str(pkg_dir), check=True)
        else:
            print("[BILDIRISH] dpkg-deb topilmadi, faqat tar.gz / binary yig'ildi.")

    print("\n=== Barcha packaging amallari tugadi! ===")


if __name__ == "__main__":
    main()
