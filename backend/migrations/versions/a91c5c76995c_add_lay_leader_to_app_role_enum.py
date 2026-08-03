"""add lay_leader to app_role enum

Revision ID: a91c5c76995c
Revises: e774aac868d1
Create Date: 2026-07-08 13:10:52.770352

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a91c5c76995c'
down_revision = 'e774aac868d1'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'lay_leader'")


def downgrade():
    # Postgres has no direct "remove enum value" — recreate the type without it if ever needed
    op.execute("""
        DELETE FROM user_roles WHERE role = 'lay_leader';
        ALTER TYPE app_role RENAME TO app_role_old;
        CREATE TYPE app_role AS ENUM (
            'super_admin', 'admin', 'pastor', 'secretary', 'treasurer', 'ministry_leader'
        );
        ALTER TABLE user_roles ALTER COLUMN role TYPE app_role USING role::text::app_role;
        DROP TYPE app_role_old;
    """)
