"""Make the daily token counter safe to increment concurrently.

Revision ID: 0002_token_usage_unique
Revises: 0001_baseline
Create Date: 2026-09-08

`token_usage_counters` had plain indexes on identifier and date_stamp but no
uniqueness across the pair, so the Django cost tracker maintained it with a
read-modify-write: get_or_create, then filter().update(F(...)), then
refresh_from_db. Two concurrent chat requests from the same user could each read
the same starting value and one increment would be lost -- quietly handing that
user extra budget.

A unique constraint lets the new code use a single atomic
INSERT ... ON CONFLICT DO UPDATE instead.

SCOPE OF DATA CHANGE: this migration merges duplicate (identifier, date_stamp)
rows in `token_usage_counters` before adding the constraint, because Postgres
will not create it while duplicates exist. Counter values are SUMMED into the
surviving (oldest) row first, so no usage is lost -- only redundant rows go.
Nothing outside this one bookkeeping table is touched. On a database with no
duplicates, the cleanup is a no-op.

Take a database snapshot before running this, as with any migration that
deletes rows.
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0002_token_usage_unique"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None

CONSTRAINT = "uq_token_usage_identifier_date"


def upgrade() -> None:
    # 1. Fold each duplicate group's totals into its oldest row.
    op.execute(
        sa.text(
            """
            WITH ranked AS (
                SELECT id,
                       identifier,
                       date_stamp,
                       ROW_NUMBER() OVER (
                           PARTITION BY identifier, date_stamp ORDER BY created_at
                       ) AS rn
                  FROM token_usage_counters
            ),
            totals AS (
                SELECT identifier,
                       date_stamp,
                       SUM(total_tokens)   AS total_tokens,
                       SUM(requests_count) AS requests_count
                  FROM token_usage_counters
                 GROUP BY identifier, date_stamp
                HAVING COUNT(*) > 1
            )
            UPDATE token_usage_counters c
               SET total_tokens   = t.total_tokens,
                   requests_count = t.requests_count
              FROM ranked r
              JOIN totals t
                ON t.identifier = r.identifier
               AND t.date_stamp = r.date_stamp
             WHERE c.id = r.id
               AND r.rn = 1
            """
        )
    )

    # 2. Remove the now-redundant rows; their values live in the survivor.
    op.execute(
        sa.text(
            """
            DELETE FROM token_usage_counters
             WHERE id IN (
                 SELECT id
                   FROM (
                        SELECT id,
                               ROW_NUMBER() OVER (
                                   PARTITION BY identifier, date_stamp
                                   ORDER BY created_at
                               ) AS rn
                          FROM token_usage_counters
                   ) ranked
                  WHERE ranked.rn > 1
             )
            """
        )
    )

    # 3. With the table clean, the constraint can be created.
    op.create_unique_constraint(
        CONSTRAINT, "token_usage_counters", ["identifier", "date_stamp"]
    )


def downgrade() -> None:
    # Only the constraint is reversible. The merged rows are not restored --
    # their values were summed into the survivor, not discarded, so the counters
    # stay correct either way.
    op.drop_constraint(CONSTRAINT, "token_usage_counters", type_="unique")
