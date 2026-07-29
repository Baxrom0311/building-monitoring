# -*- mode: python ; coding: utf-8 -*-
import os
import sys

block_cipher = None

desktop_dir = os.path.dirname(os.path.dirname(os.path.abspath(SPEC)))

# Select appropriate icon depending on OS
if sys.platform == "win32":
    icon_path = os.path.join(desktop_dir, "app_icon.ico")
elif sys.platform == "darwin":
    icon_path = os.path.join(desktop_dir, "app_icon.icns")
else:
    icon_path = os.path.join(desktop_dir, "app_icon.png")

datas = [
    (os.path.join(desktop_dir, "app_icon.png"), "."),
    (os.path.join(desktop_dir, "app_icon.ico"), "."),
    (os.path.join(desktop_dir, "app_icon.icns"), "."),
]

a = Analysis(
    [os.path.join(desktop_dir, "main.py")],
    pathex=[desktop_dir],
    binaries=[],
    datas=datas,
    hiddenimports=[
        "PyQt6.QtCore",
        "PyQt6.QtGui",
        "PyQt6.QtWidgets",
        "serial",
        "serial.tools",
        "serial.tools.list_ports",
        "esptool",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="ESP32Studio",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=icon_path,
)
