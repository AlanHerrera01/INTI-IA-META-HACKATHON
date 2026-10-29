"""Add authorized executions and private observation metadata."""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "observations",
        sa.Column("restricted", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_table(
        "execution_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("plan_id", sa.String(36), sa.ForeignKey("action_plans.id"), nullable=False),
        sa.Column("task_id", sa.String(36), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    for column in ("plan_id", "task_id", "status", "updated_at"):
        op.create_index(f"ix_execution_sessions_{column}", "execution_sessions", [column])
    op.create_table(
        "browser_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "execution_id", sa.String(36), sa.ForeignKey("execution_sessions.id"), nullable=False
        ),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    op.create_index("ix_browser_sessions_execution_id", "browser_sessions", ["execution_id"])
    op.create_table(
        "action_execution_results",
        sa.Column(
            "execution_id", sa.String(36), sa.ForeignKey("execution_sessions.id"), primary_key=True
        ),
        sa.Column("action_id", sa.String(36), primary_key=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column(
            "before_observation_id", sa.String(36), sa.ForeignKey("observations.id"), nullable=True
        ),
        sa.Column(
            "after_observation_id", sa.String(36), sa.ForeignKey("observations.id"), nullable=True
        ),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    op.create_table(
        "execution_events",
        sa.Column("sequence", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("id", sa.String(36), unique=True, nullable=False),
        sa.Column(
            "execution_id", sa.String(36), sa.ForeignKey("execution_sessions.id"), nullable=False
        ),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    op.create_index("ix_execution_events_execution_id", "execution_events", ["execution_id"])
    op.create_table(
        "authorization_decisions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "execution_id", sa.String(36), sa.ForeignKey("execution_sessions.id"), nullable=False
        ),
        sa.Column("action_id", sa.String(36), nullable=False),
        sa.Column("approved", sa.Boolean(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    op.create_index(
        "ix_authorization_decisions_execution_id", "authorization_decisions", ["execution_id"]
    )


def downgrade() -> None:
    for table in (
        "authorization_decisions",
        "execution_events",
        "action_execution_results",
        "browser_sessions",
        "execution_sessions",
    ):
        op.drop_table(table)
    op.drop_column("observations", "restricted")
