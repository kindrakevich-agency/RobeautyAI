"""Початкова схема: всі таблиці + розширення + пошукові індекси.

Revision ID: 0001
"""

import sqlalchemy as sa
from alembic import op

from app.models import Base

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("CREATE EXTENSION IF NOT EXISTS vector"))
    bind.execute(sa.text("CREATE EXTENSION IF NOT EXISTS unaccent"))
    Base.metadata.create_all(bind=bind)
    # Пошукові індекси: HNSW для векторів, GIN для повнотексту обома мовами.
    bind.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks "
        "USING hnsw (embedding vector_cosine_ops)"))
    bind.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS idx_chunks_tsv_uk ON chunks USING gin (tsv_uk)"))
    bind.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS idx_chunks_tsv_pl ON chunks USING gin (tsv_pl)"))


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
