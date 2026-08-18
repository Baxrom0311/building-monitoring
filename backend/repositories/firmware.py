from sqlalchemy import desc, select
from sqlalchemy.orm import selectinload

from models.entities import Firmware
from repositories.base import BaseRepository


class FirmwareRepository(BaseRepository[Firmware]):
    model = Firmware

    async def list_latest_with_compatibilities(self) -> list[Firmware]:
        return list(
            (
                await self.session.scalars(
                    select(Firmware)
                    .options(selectinload(Firmware.compatibilities))
                    .order_by(desc(Firmware.uploaded))
                )
            ).all()
        )

    async def list_active_with_compatibilities(self) -> list[Firmware]:
        return list(
            (
                await self.session.scalars(
                    select(Firmware)
                    .options(selectinload(Firmware.compatibilities))
                    .where(Firmware.active.is_(True))
                    .order_by(desc(Firmware.uploaded))
                )
            ).all()
        )

    async def by_filename(self, filename: str) -> Firmware | None:
        return await self.session.scalar(select(Firmware).where(Firmware.filename == filename).limit(1))
