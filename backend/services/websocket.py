import json

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self._sockets: list[WebSocket] = []
        self._snapshot_provider = None

    def set_snapshot_provider(self, provider):
        self._snapshot_provider = provider

    async def connect(self, ws: WebSocket, subprotocol: str | None = None):
        # Brauzer `new WebSocket(url, [token])` yuborsa, handshake muvaffaqiyatli
        # bo'lishi uchun subprotocol qaytarilishi shart
        await ws.accept(subprotocol=subprotocol)
        self._sockets.append(ws)
        if self._snapshot_provider:
            try:
                snapshot = await self._snapshot_provider()
                await ws.send_text(json.dumps({"type": "snapshot", "data": snapshot}))
            except Exception:
                pass

    def disconnect(self, ws: WebSocket):
        if ws in self._sockets:
            self._sockets.remove(ws)

    async def broadcast(self, data: dict):
        if not self._sockets:
            return
        msg = json.dumps(data, ensure_ascii=False)
        dead = []
        # Nusxa ustida iteratsiya — send paytida connect/disconnect ro'yxatni o'zgartirishi mumkin
        for ws in list(self._sockets):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    @property
    def count(self) -> int:
        return len(self._sockets)


ws_manager = ConnectionManager()
