"""Independent verification criteria, provenance, results and event history."""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "criteria_versions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "execution_id", sa.String(36), sa.ForeignKey("execution_sessions.id"), nullable=False
        ),
        sa.Column("task_id", sa.String(36), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("digest", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.UniqueConstraint("execution_id", "version", name="uq_criteria_version"),
    )
    for column in ("execution_id", "task_id"):
        op.create_index(f"ix_criteria_versions_{column}", "criteria_versions", [column])
    op.create_table(
        "success_criteria",
        sa.Column(
            "criteria_version_id",
            sa.String(36),
            sa.ForeignKey("criteria_versions.id"),
            primary_key=True,
        ),
        sa.Column("criterion_id", sa.String(36), primary_key=True),
        sa.Column("task_id", sa.String(36), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    op.create_index("ix_success_criteria_task_id", "success_criteria", ["task_id"])
    op.create_table(
        "verification_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "execution_id", sa.String(36), sa.ForeignKey("execution_sessions.id"), nullable=False
        ),
        sa.Column("task_id", sa.String(36), nullable=False),
        sa.Column(
            "criteria_version_id",
            sa.String(36),
            sa.ForeignKey("criteria_versions.id"),
            nullable=False,
        ),
        sa.Column("idempotency_key", sa.String(80), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("final_verdict", sa.String(32), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.UniqueConstraint(
            "execution_id", "criteria_version_id", "idempotency_key", name="uq_verification_request"
        ),
    )
    for column in ("execution_id", "task_id", "status", "started_at"):
        op.create_index(f"ix_verification_sessions_{column}", "verification_sessions", [column])
    op.create_table(
        "evidence_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "verification_id",
            sa.String(36),
            sa.ForeignKey("verification_sessions.id"),
            nullable=False,
        ),
        sa.Column("evidence_type", sa.String(40), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("artifact_reference", sa.String(36), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    for column in ("verification_id", "captured_at"):
        op.create_index(f"ix_evidence_records_{column}", "evidence_records", [column])
    op.create_table(
        "criterion_results",
        sa.Column(
            "verification_id",
            sa.String(36),
            sa.ForeignKey("verification_sessions.id"),
            primary_key=True,
        ),
        sa.Column("criterion_id", sa.String(36), primary_key=True),
        sa.Column("criteria_version_id", sa.String(36), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(
            ["criteria_version_id", "criterion_id"],
            ["success_criteria.criteria_version_id", "success_criteria.criterion_id"],
        ),
    )
    op.create_table(
        "verification_events",
        sa.Column("sequence", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("id", sa.String(36), unique=True, nullable=False),
        sa.Column(
            "verification_id",
            sa.String(36),
            sa.ForeignKey("verification_sessions.id"),
            nullable=False,
        ),
        sa.Column(
            "execution_id", sa.String(36), sa.ForeignKey("execution_sessions.id"), nullable=False
        ),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    for column in ("verification_id", "execution_id"):
        op.create_index(f"ix_verification_events_{column}", "verification_events", [column])


def downgrade() -> None:
    for table in (
        "verification_events",
        "criterion_results",
        "evidence_records",
        "verification_sessions",
        "success_criteria",
        "criteria_versions",
    ):
        op.drop_table(table)
