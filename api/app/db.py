"""Підключення до БД і сесії."""

from __future__ import annotations

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from . import config

engine = create_engine(config.DATABASE_URL, pool_pre_ping=True, pool_size=5)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_session() -> Session:
    return SessionLocal()


def ensure_extensions() -> None:
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS unaccent"))
