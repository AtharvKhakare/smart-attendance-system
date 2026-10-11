"""add linked student portal accounts

Revision ID: a14f92c6d1b0
Revises: 359a57ab550e
Create Date: 2026-10-11 14:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "a14f92c6d1b0"
down_revision = "359a57ab550e"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_constraint("ck_users_role", type_="check")
        batch_op.add_column(sa.Column("student_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_users_student_id_students",
            "students",
            ["student_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_unique_constraint("uq_users_student_id", ["student_id"])
        batch_op.create_check_constraint(
            "ck_users_role", "role IN ('admin', 'teacher', 'student')"
        )
        batch_op.create_check_constraint(
            "ck_users_student_link",
            "(role = 'student' AND student_id IS NOT NULL) OR "
            "(role != 'student' AND student_id IS NULL)",
        )


def downgrade():
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_constraint("ck_users_student_link", type_="check")
        batch_op.drop_constraint("ck_users_role", type_="check")
        batch_op.drop_constraint("uq_users_student_id", type_="unique")
        batch_op.drop_constraint("fk_users_student_id_students", type_="foreignkey")
        batch_op.drop_column("student_id")
        batch_op.create_check_constraint("ck_users_role", "role IN ('admin', 'teacher')")
