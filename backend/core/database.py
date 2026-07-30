from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from core.config import settings
from models.entities import Base


engine = create_async_engine(
    settings.database_url,
    future=True,
    pool_pre_ping=True,
    # 210 qurilma uchun yetarli pool
    pool_size=20,
    max_overflow=30,
    pool_timeout=30,
)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
