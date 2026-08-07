"""ТТН-чернетки: таблиця dispatches.

Revision ID: 0002
"""

import sqlalchemy as sa
from alembic import op

from app.models import Base

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # create_all створює лише відсутні таблиці — та сама механіка, що в 0001.
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    op.get_bind().execute(sa.text("DROP TABLE IF EXISTS dispatches"))
