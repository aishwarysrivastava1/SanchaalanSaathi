"""Baseline: adopt the schema Django already created.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-09-08

This migration is intentionally EMPTY.

Every table in `app/models.py` already exists in the database, created by
Django's migrations. Re-creating them would fail; dropping and recreating them
would destroy production data. So this revision exists purely as a marker:

    alembic stamp 0001_baseline

records "the database is already at this point" without executing anything.
Real schema changes start at 0002.

This is the Alembic equivalent of the `migrate --fake-initial` the old README
told you to run, and it is why the cutover needs no data migration at all.
"""
from __future__ import annotations

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
