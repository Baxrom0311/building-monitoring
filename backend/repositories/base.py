from typing import Any, Generic, TypeVar

from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import AsyncSession

ModelT = TypeVar("ModelT")


def model_to_dict(obj: Any) -> dict:
    return {attr.key: getattr(obj, attr.key) for attr in inspect(obj).mapper.column_attrs}


class BaseRepository(Generic[ModelT]):
    model: type[ModelT]

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self, object_id: Any) -> ModelT | None:
        return await self.session.get(self.model, object_id)

    def add(self, obj: ModelT) -> ModelT:
        self.session.add(obj)
        return obj

    async def delete(self, obj: ModelT) -> None:
        await self.session.delete(obj)

    async def flush(self) -> None:
        await self.session.flush()

    async def commit(self) -> None:
        await self.session.commit()
