"""Flash service — PlatformIO build va firmware fayllari bilan ishlash.

Cross-platform (macOS, Windows, Linux) dinamic va avtomatik qo'llab-quvvatlash.
"""
import os
import sys
import subprocess
from pathlib import Path
from services.tool_installer import ToolInstallerService


class FlashService:
    """PlatformIO build va flash xizmati logikasi."""

    @staticmethod
    def find_pio(log_cb=None) -> str | None:
        """PlatformIO CLI yo'lini dinamik topadi yoki avtomatik o'rnatadi."""
        return ToolInstallerService.ensure_platformio(log_cb=log_cb)

    @staticmethod
    def find_project_root() -> str | None:
        """platformio.ini faylini har qanday muhitda dinamik topadi."""
        # 1. Environment variable berilgan bo'lsa
        env_root = os.getenv("ESP32STUDIO_IOT_DIR")
        if env_root and os.path.exists(os.path.join(env_root, "platformio.ini")):
            return env_root

        # 2. Joriy fayldan yuqoriga qarab platformio.ini qidirish
        cur = os.path.dirname(os.path.abspath(__file__))
        for _ in range(6):
            if os.path.exists(os.path.join(cur, "platformio.ini")):
                return cur
            parent = os.path.dirname(cur)
            if parent == cur:
                break
            cur = parent

        # 3. Ishchi katalog (CWD) va repo strukturasini tekshirish
        cwd = os.getcwd()
        candidates = [
            os.path.join(cwd, "iot"),
            os.path.join(os.path.dirname(cwd), "iot"),
            os.path.join(Path.home(), ".esp32studio", "iot"),
            os.path.join(Path.home(), "iot"),
        ]

        for cand in candidates:
            if os.path.exists(os.path.join(cand, "platformio.ini")):
                return cand

        return None

    @staticmethod
    def find_compiled_bin(project_root: str, env_name: str) -> str | None:
        """PlatformIO tomonidan yig'ilgan firmware.bin faylini topadi."""
        bin_path = os.path.join(project_root, ".pio", "build", env_name, "firmware.bin")
        if os.path.exists(bin_path):
            return bin_path
        return None

    @staticmethod
    def make_build_flags(
        sensor: str,
        server_url: str,
        device_token: str,
        wifi_ssid: str,
        wifi_pass: str,
        test_mode: bool = False,
        sensor_opts: dict | None = None,
    ) -> str:
        """Barcha build flaglarini PlatformIO ini formatida yig'adi."""
        sensor_flag = f"-DSENSOR_{sensor.upper()}"
        server = server_url.replace("'", "\\'")
        token = device_token.replace("'", "\\'")
        ssid = wifi_ssid.replace("'", "\\'")
        pwd = wifi_pass.replace("'", "\\'")

        lines = [
            "-std=gnu++17",
            "-DCORE_DEBUG_LEVEL=0",
            sensor_flag,
            f"""'-DDEFAULT_SERVER_URL="{server}"'""",
            f"""'-DDEFAULT_DEVICE_TOKEN="{token}"'""",
            f"""'-DDEFAULT_WIFI_SSID="{ssid}"'""",
            f"""'-DDEFAULT_WIFI_PASS="{pwd}"'""",
            f"-DDEFAULT_TEST_MODE={1 if test_mode else 0}",
        ]

        if sensor == "soil" and sensor_opts:
            if sensor_opts.get("lcd"):
                lines.append("-DHAVE_LCD")
            lines.append(f"-DPIN_SOIL_ADC={sensor_opts.get('adc_pin', 32)}")
            lines.append(f"-DSOIL_ADC_DRY={sensor_opts.get('dry', 3300)}")
            lines.append(f"-DSOIL_ADC_WET={sensor_opts.get('wet', 1400)}")

        if sensor == "sound" and sensor_opts:
            if sensor_opts.get("lcd"):
                lines.append("-DHAVE_LCD")
            lines.append(f"-DPIN_SOUND_ADC={sensor_opts.get('adc_pin', 34)}")
            lines.append(f"-DREAD_INTERVAL_MS={sensor_opts.get('interval', 10000)}")

        return "\n".join(lines)
