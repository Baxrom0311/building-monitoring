"""Backend API Client — login, firmware ro'yxati va yuklab olish.

ss.boos.uz backend bilan HTTP orqali ishlash.
"""
import json
import os
import ssl
import urllib.request
import urllib.error


class ApiClient:
    """Backend API bilan ishlash uchun HTTP klient."""

    def __init__(self, server_url: str = "https://ss.boos.uz"):
        self.server_url = server_url.rstrip("/")
        self.access_token: str = ""
        self.username: str = ""
        self._ctx = ssl.create_default_context()
        if os.environ.get("METER_TLS_INSECURE") == "1":
            # Lokal dev serverlar uchun (o'z-o'zidan imzolangan sertifikat)
            self._ctx.check_hostname = False
            self._ctx.verify_mode = ssl.CERT_NONE

    @property
    def is_authenticated(self) -> bool:
        return bool(self.access_token)

    def _headers(self) -> dict:
        h = {"Content-Type": "application/json"}
        if self.access_token:
            h["Authorization"] = f"Bearer {self.access_token}"
        return h

    def login(self, username: str, password: str) -> dict:
        """Backend ga login qilish. JWT token oladi.

        Returns: {"access_token": ..., "user": {"username": ..., "role": ...}}
        Raises: ConnectionError on failure.
        """
        url = f"{self.server_url}/api/auth/login"
        body = json.dumps({"username": username, "password": password}).encode()
        req = urllib.request.Request(url, data=body, method="POST")
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=10, context=self._ctx) as resp:
                data = json.loads(resp.read())
                self.access_token = data.get("access_token", "")
                user = data.get("user", {})
                self.username = user.get("username", username)
                return data
        except urllib.error.HTTPError as e:
            if e.code == 401:
                raise ConnectionError("Login yoki parol xato!")
            raise ConnectionError(f"Login xatosi: {e.code}")
        except Exception as e:
            raise ConnectionError(f"Server bilan bog'lanib bo'lmadi: {e}")

    def list_firmware(self) -> list[dict]:
        """Serverdan barcha firmware ro'yxatini olish."""
        url = f"{self.server_url}/api/ota/list"
        req = urllib.request.Request(url, headers=self._headers())
        try:
            with urllib.request.urlopen(req, timeout=15, context=self._ctx) as resp:
                data = json.loads(resp.read())
                return data.get("firmware", [])
        except urllib.error.HTTPError as e:
            if e.code == 401:
                self.access_token = ""
                raise ConnectionError("Token eskirgan — qayta login qiling")
            raise ConnectionError(f"Server xatosi: {e.code}")
        except Exception as e:
            raise ConnectionError(f"Server bilan bog'lanib bo'lmadi: {e}")

    def download_firmware(self, filename: str, dest_path: str,
                          progress_cb=None) -> str:
        """Firmware binary faylini serverdan yuklab olish."""
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
