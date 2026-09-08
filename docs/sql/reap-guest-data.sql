-- Expire abandoned guest/demo workspaces.
--
-- WHY THIS EXISTS
-- `POST /api/auth/guest` and `/api/auth/guest-volunteer` are unauthenticated
-- and each write ~35 rows (1 user + 1 NGO + 5 volunteers + 5 profiles +
-- 8 tasks + 8 assignments + 4 events + 6 resources + 6 notifications).
-- Nothing in the application ever removes them. Rate limiting slows abuse but
-- does not clean up, so without this job a free-tier database steadily fills
-- with abandoned demo data.
--
-- SAFETY
-- The stale set matches ONLY NGOs whose `sector` is 'Demo' or 'Hackathon' --
-- the markers the guest endpoints set -- AND that are older than 7 days.
-- An NGO created through real signup carries a real sector and is never
-- matched. Child rows are removed before parent rows: these tables have no
-- foreign keys, so nothing cascades for you, and deleting `ngos` first would
-- orphan everything else.
--
-- BEFORE THE FIRST RUN:
--   1. Take a Supabase backup (Database -> Backups).
--   2. Run the preview below and check the number looks right.
--
-- Preview (reads only, changes nothing):
--
--   SELECT count(*) FROM ngos
--    WHERE sector IN ('Demo', 'Hackathon')
--      AND created_at < now() - interval '7 days';
--
-- Then run the block below by hand, or schedule it weekly with pg_cron
-- (Supabase -> Integrations -> pg_cron) as shown at the bottom.

BEGIN;

CREATE TEMP TABLE stale_ngos ON COMMIT DROP AS
SELECT id
  FROM ngos
 WHERE sector IN ('Demo', 'Hackathon')
   AND created_at < now() - interval '7 days';

CREATE TEMP TABLE stale_users ON COMMIT DROP AS
SELECT id
  FROM users
 WHERE ngo_id IN (SELECT id FROM stale_ngos);

-- Children first.
DELETE FROM event_attendance
 WHERE event_id IN (
       SELECT id FROM events WHERE ngo_id IN (SELECT id FROM stale_ngos));

DELETE FROM allocations              WHERE ngo_id  IN (SELECT id FROM stale_ngos);
DELETE FROM assignments              WHERE ngo_id  IN (SELECT id FROM stale_ngos);
DELETE FROM task_enrollment_requests WHERE ngo_id  IN (SELECT id FROM stale_ngos);
DELETE FROM tasks                    WHERE ngo_id  IN (SELECT id FROM stale_ngos);
DELETE FROM resources                WHERE ngo_id  IN (SELECT id FROM stale_ngos);
DELETE FROM events                   WHERE ngo_id  IN (SELECT id FROM stale_ngos);
DELETE FROM volunteer_profiles       WHERE ngo_id  IN (SELECT id FROM stale_ngos);

DELETE FROM notifications            WHERE user_id IN (SELECT id FROM stale_users);
DELETE FROM consent_events           WHERE user_id IN (SELECT id FROM stale_users);

-- Then parents.
DELETE FROM users                    WHERE id      IN (SELECT id FROM stale_users);
DELETE FROM ngos                     WHERE id      IN (SELECT id FROM stale_ngos);

COMMIT;


-- ── Schedule it weekly (Sunday 03:00 UTC) ────────────────────────────────────
-- Run once in the Supabase SQL editor, after enabling pg_cron:
--
--   SELECT cron.schedule(
--     'reap-guest-data',
--     '0 3 * * 0',
--     $job$ <paste the BEGIN..COMMIT block above> $job$
--   );
--
-- Inspect or remove it later:
--
--   SELECT * FROM cron.job;
--   SELECT cron.unschedule('reap-guest-data');
