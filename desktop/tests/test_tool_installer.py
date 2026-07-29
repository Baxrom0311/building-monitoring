"""test_tool_installer.py — ToolInstallerService unit testlari."""
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.tool_installer import ToolInstallerService
from services.esptool_service import EsptoolService
from services.flash_service import FlashService


def test_get_app_dir():
    app_dir = ToolInstallerService.get_app_dir()
    assert os.path.exists(app_dir)
    assert os.path.exists(os.path.join(app_dir, "firmware_cache"))
    assert os.path.exists(os.path.join(app_dir, "logs"))


def test_find_esptool():
    cmd = ToolInstallerService.find_esptool()
    assert isinstance(cmd, list)
    assert len(cmd) >= 1


def test_esptool_service_cmd():
    cmd = EsptoolService.get_esptool_cmd()
    assert isinstance(cmd, list)
    assert len(cmd) >= 1


def test_flash_service_find_project_root():
    root = FlashService.find_project_root()
    assert root is not None
    assert os.path.exists(os.path.join(root, "platformio.ini"))
