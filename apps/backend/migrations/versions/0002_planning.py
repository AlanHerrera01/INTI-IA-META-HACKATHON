"""Add planning-only scenes, plans, action index and trace events."""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "visual_scenes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "observation_id", sa.String(36), sa.ForeignKey("observations.id"), nullable=False
        ),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    op.create_index("ix_visual_scenes_observation_id", "visual_scenes", ["observation_id"])
    op.create_table(
        "action_plans",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("task_id", sa.String(36), nullable=False, unique=True),
        sa.Column(
            "observation_id", sa.String(36), sa.ForeignKey("observations.id"), nullable=False
        ),
        sa.Column("scene_id", sa.String(36), sa.ForeignKey("visual_scenes.id"), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    for column in ("observation_id", "status", "created_at"):
        op.create_index(f"ix_action_plans_{column}", "action_plans", [column])
    op.create_table(
        "planned_actions",
        sa.Column(
            "plan_id",
            sa.String(36),
            sa.ForeignKey("action_plans.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("position", sa.Integer(), primary_key=True),
        sa.Column("action_id", sa.String(80), nullable=False),
        sa.Column("action_type", sa.String(32), nullable=False),
        sa.Column("risk_level", sa.String(16), nullable=False),
    )
    op.create_table(
        "planning_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("task_id", sa.String(36), nullable=False),
        sa.Column("plan_id", sa.String(36), sa.ForeignKey("action_plans.id"), nullable=True),
        sa.Column("correlation_id", sa.String(36), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    for column in ("task_id", "plan_id", "correlation_id"):
        op.create_index(f"ix_planning_events_{column}", "planning_events", [column])


def downgrade() -> None:
    for table in ("planning_events", "planned_actions", "action_plans", "visual_scenes"):
        op.drop_table(table)
