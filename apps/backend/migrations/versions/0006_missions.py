"""Product missions with stable task identity; Phase 6 evaluation is not implied."""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "missions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "execution_id", sa.String(36), sa.ForeignKey("execution_sessions.id"), unique=True
        ),
        sa.Column("plan_id", sa.String(36), sa.ForeignKey("action_plans.id")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    op.create_index("ix_missions_updated_at", "missions", ["updated_at"])


def downgrade() -> None:
    op.drop_table("missions")
