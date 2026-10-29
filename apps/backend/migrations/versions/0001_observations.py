"""Create observation metadata table."""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "observations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_url", sa.String(2048), nullable=False),
        sa.Column("page_title", sa.String(4096), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("artifact_path", sa.String(40), nullable=False),
        sa.Column("analysis_status", sa.String(20), nullable=False),
        sa.Column("analysis", sa.JSON(), nullable=True),
    )
    op.create_index("ix_observations_timestamp", "observations", ["timestamp"])


def downgrade() -> None:
    op.drop_table("observations")
