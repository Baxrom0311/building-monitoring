"""Backend API Client — firmware ro'yxati va yuklab olish.

ss.boos.uz backend bilan HTTP orqali ishlash.
"""
import json
import os
import ssl
import urllib.request
import urllib.error


class ApiClient:
    """Backend API bilan ishlash uchun HTTP klient."""

    def __init__(self, server_url: str = "https://ss.boos.uz",
                 token: str = "T30gwzZJ6YTvQeLRMCZyTi-GBAYogsQV"):
        self.server_url = server_url.rstrip("/")
        self.token = token
        self._ctx = ssl.create_default_context()
        self._ctx.check_hostname = False
        self._ctx.verify_mode = ssl.CERT_NONE

    def _headers(self) -> dict:
        h = {"Content-Type": "application/json"}
        if self.token:
            h["X-Device-Token"] = self.token
        return h

    def list_firmware(self) -> list[dict]:
        """Serverdan barcha firmware ro'yxatini olish."""
        url = f"{self.server_url}/api/ota/list"
        req = urllib.request.Request(url, headers=self._headers())
        try:
            with urllib.request.urlopen(req, timeout=15, context=self._ctx) as resp:
                data = json.loads(resp.read())
                return data.get("firmware", [])
        except Exception as e:
            raise ConnectionError(f"Server bilan bog'lanib bo'lmadi: {e}")

    def download_firmware(self, filename: str, dest_path: str,
                          progress_cb=None) -> str:
        """Firmware binary faylini serverdan yuklab olish.

        progress_cb(percent: int) — 0..100 progress callback.
        """
        url = f"{self.server_url}/api/ota/firmware/{filename}"
        req = urllib.request.Request(url, headers=self._headers())
        try:
            with urllib.request.urlopen(req, timeout=120, context=self._ctx) as resp:
                total = int(resp.headers.get("Content-Length", 0))
                downloaded = 0
                with open(dest_path, "wb") as f:
                    while True:
                        chunk = resp.read(8192)
                        if not chunk:
                            break
                        f.write(chunk)
                        downloaded += len(chunk)
                        if progress_cb and total > 0:
                            progress_cb(int(downloaded * 100 / total))
            return dest_path
        except Exception as e:
            if os.path.exists(dest_path):
                os.remove(dest_path)
            raise ConnectionError(f"Firmware yuklab bo'lmadi: {e}")
