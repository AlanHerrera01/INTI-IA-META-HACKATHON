"""Add recovery audit tables without changing existing execution rows."""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recovery_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "execution_id", sa.String(36), sa.ForeignKey("execution_sessions.id"), nullable=False
        ),
        sa.Column("failed_action_id", sa.String(36), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.UniqueConstraint("execution_id", "failed_action_id", name="uq_recovery_failure"),
    )
    for column in ("execution_id", "status", "started_at"):
        op.create_index(f"ix_recovery_sessions_{column}", "recovery_sessions", [column])
    op.create_table(
        "failure_contexts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "recovery_id",
            sa.String(36),
            sa.ForeignKey("recovery_sessions.id"),
            unique=True,
            nullable=False,
        ),
        sa.Column("failure_type", sa.String(40), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    op.create_index("ix_failure_contexts_failure_type", "failure_contexts", ["failure_type"])
    op.create_table(
        "recovery_strategies",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "recovery_id", sa.String(36), sa.ForeignKey("recovery_sessions.id"), nullable=False
        ),
        sa.Column("strategy_type", sa.String(40), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    op.create_index("ix_recovery_strategies_recovery_id", "recovery_strategies", ["recovery_id"])
    op.create_table(
        "recovery_attempts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "recovery_id", sa.String(36), sa.ForeignKey("recovery_sessions.id"), nullable=False
        ),
        sa.Column("attempt_number", sa.Integer(), nullable=False),
        sa.Column("outcome", sa.String(32), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.UniqueConstraint("recovery_id", "attempt_number", name="uq_recovery_attempt"),
    )
    op.create_index("ix_recovery_attempts_recovery_id", "recovery_attempts", ["recovery_id"])
    op.create_table(
        "recovery_events",
        sa.Column("sequence", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("id", sa.String(36), unique=True, nullable=False),
        sa.Column(
            "recovery_id", sa.String(36), sa.ForeignKey("recovery_sessions.id"), nullable=False
        ),
        sa.Column(
            "execution_id", sa.String(36), sa.ForeignKey("execution_sessions.id"), nullable=False
        ),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    for column in ("recovery_id", "execution_id"):
        op.create_index(f"ix_recovery_events_{column}", "recovery_events", [column])
    op.create_table(
        "recovery_evidence",
        sa.Column(
            "recovery_id", sa.String(36), sa.ForeignKey("recovery_sessions.id"), primary_key=True
        ),
        sa.Column(
            "observation_id", sa.String(36), sa.ForeignKey("observations.id"), primary_key=True
        ),
    )


def downgrade() -> None:
    for name in (
        "recovery_evidence",
        "recovery_events",
        "recovery_attempts",
        "recovery_strategies",
        "failure_contexts",
        "recovery_sessions",
    ):
        op.drop_table(name)
