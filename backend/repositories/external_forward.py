from sqlalchemy import select

from models.entities import ExternalSensorForward
from repositories.base import BaseRepository


class ExternalForwardRepository(BaseRepository[ExternalSensorForward]):
    model = ExternalSensorForward

    async def list_active(self) -> list[ExternalSensorForward]:
        stmt = select(ExternalSensorForward).where(ExternalSensorForward.is_active.is_(True))
        return list((await self.session.scalars(stmt)).all())

    async def list_all(self) -> list[ExternalSensorForward]:
        stmt = select(ExternalSensorForward).order_by(ExternalSensorForward.building_id, ExternalSensorForward.utility_type)
        return list((await self.session.scalars(stmt)).all())
