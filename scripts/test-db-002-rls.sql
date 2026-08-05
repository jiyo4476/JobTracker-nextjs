\set ON_ERROR_STOP on

-- Run against a disposable, migrated PostgreSQL database as its migration owner.
--
-- NOTE: this script is NOT wrapped in a single transaction -- it deliberately uses
-- SET ROLE plus inner BEGIN/ROLLBACK blocks to exercise RLS as a non-bypass role,
-- and psql cannot nest those inside an outer transaction. A failure therefore aborts
-- part-way and leaves its fixture rows behind. The idempotent pre-clean below removes
-- any residue from a previous aborted run so the script is safely re-runnable; the
-- matching teardown at the end removes it on the success path.
--
-- Pre-clean: drop residue from any earlier aborted run.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'db002_app_test') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM db002_app_test';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM db002_app_test';
    EXECUTE 'REVOKE ALL ON SCHEMA public FROM db002_app_test';
  END IF;
END $$;
DELETE FROM resume_versions WHERE label LIKE 'DB-002 %';
DELETE FROM users WHERE issuer = 'db002-test';
DELETE FROM jobs WHERE job_title LIKE 'DB-002 %';

DROP ROLE IF EXISTS db002_app_test;
CREATE ROLE db002_app_test NOSUPERUSER NOBYPASSRLS NOLOGIN;
GRANT USAGE ON SCHEMA public TO db002_app_test;
GRANT SELECT ON users TO db002_app_test;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_job_state, user_job_contacts, user_job_status_history TO db002_app_test;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO db002_app_test;

INSERT INTO users (issuer, subject) VALUES
  ('db002-test', 'user-1'), ('db002-test', 'user-2');
INSERT INTO jobs (job_title) VALUES
  ('DB-002 shared job'),
  ('DB-002 parent check'),
  ('DB-002 resume insert check'),
  ('DB-002 resume update check');

INSERT INTO resume_versions (user_id, label)
SELECT id, 'DB-002 resume ' || subject
FROM users WHERE issuer = 'db002-test';

-- The former "unowned legacy resume" case is intentionally gone. It inserted a
-- resume_versions row with a NULL user_id to prove the composite FK rejected
-- associating an ownerless resume to a user's state. Migration 0011 (API-014)
-- made resume_versions.user_id NOT NULL, so that row can no longer be created --
-- the schema now makes the state unrepresentable rather than merely rejected,
-- which is a strictly stronger guarantee. Keeping the case would fail at INSERT.

-- Run as the migration owner so this proves the FK invariant independently of RLS.
DO $$
DECLARE
  user_1_id int := (SELECT id FROM users WHERE issuer='db002-test' AND subject='user-1');
  user_2_resume_id int := (SELECT rv.id FROM resume_versions rv JOIN users u ON u.id=rv.user_id
                            WHERE u.issuer='db002-test' AND u.subject='user-2');
  user_1_resume_id int := (SELECT rv.id FROM resume_versions rv JOIN users u ON u.id=rv.user_id
                            WHERE u.issuer='db002-test' AND u.subject='user-1');
  insert_job_id int := (SELECT id FROM jobs WHERE job_title='DB-002 resume insert check');
  update_job_id int := (SELECT id FROM jobs WHERE job_title='DB-002 resume update check');
BEGIN
  INSERT INTO user_job_state (user_id, job_id, resume_version_id)
  VALUES (user_1_id, insert_job_id, user_1_resume_id);

  BEGIN
    INSERT INTO user_job_state (user_id, job_id, resume_version_id)
    VALUES (user_1_id, update_job_id, user_2_resume_id);
    RAISE EXCEPTION 'cross-owner resume insert was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  INSERT INTO user_job_state (user_id, job_id, resume_version_id)
  VALUES (user_1_id, update_job_id, NULL);
  UPDATE user_job_state SET resume_version_id=user_1_resume_id
    WHERE (user_id, job_id)=(user_1_id, update_job_id);

  BEGIN
    UPDATE user_job_state SET resume_version_id=user_2_resume_id
      WHERE (user_id, job_id)=(user_1_id, update_job_id);
    RAISE EXCEPTION 'cross-owner resume update was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  DELETE FROM resume_versions WHERE id=user_1_resume_id;
  IF (SELECT count(*) FROM user_job_state
      WHERE user_id=user_1_id AND job_id IN (insert_job_id, update_job_id)) <> 2 THEN
    RAISE EXCEPTION 'resume delete removed or changed owner-scoped state rows';
  END IF;
  IF EXISTS (SELECT 1 FROM user_job_state
             WHERE user_id=user_1_id AND job_id IN (insert_job_id, update_job_id)
               AND resume_version_id IS NOT NULL) THEN
    RAISE EXCEPTION 'resume delete did not clear resume_version_id';
  END IF;
END $$;

DELETE FROM jobs WHERE job_title IN (
  'DB-002 resume insert check', 'DB-002 resume update check'
);
DELETE FROM resume_versions WHERE label = 'DB-002 resume user-2';

-- Non-bypass resume delete: proves the column-targeted ON DELETE SET NULL (migration 0010)
-- clears the reference under a NOBYPASSRLS role with no app.user_id set — the exact path the
-- old BEFORE DELETE trigger failed (its RLS-guarded UPDATE matched zero rows). Setup and
-- verification run as the (bypass) migration owner; only the DELETE runs as the app role.
INSERT INTO jobs (job_title) VALUES ('DB-002 nonbypass delete check');
INSERT INTO resume_versions (user_id, label)
SELECT id, 'DB-002 nonbypass resume' FROM users WHERE issuer='db002-test' AND subject='user-1';
INSERT INTO user_job_state (user_id, job_id, resume_version_id)
SELECT u.id, j.id, rv.id
FROM users u
  JOIN jobs j ON j.job_title='DB-002 nonbypass delete check'
  JOIN resume_versions rv ON rv.label='DB-002 nonbypass resume'
WHERE u.issuer='db002-test' AND u.subject='user-1';

GRANT SELECT, DELETE ON resume_versions TO db002_app_test;

-- resume_versions is not RLS-guarded, so the app role may delete the row; the FK's
-- referential action nulls user_job_state.resume_version_id independently of RLS/app.user_id.
SET ROLE db002_app_test;
DELETE FROM resume_versions WHERE label='DB-002 nonbypass resume';
RESET ROLE;

DO $$
DECLARE state_n int; job_id_v int := (SELECT id FROM jobs WHERE job_title='DB-002 nonbypass delete check');
BEGIN
  IF EXISTS (SELECT 1 FROM resume_versions WHERE label='DB-002 nonbypass resume') THEN
    RAISE EXCEPTION 'non-bypass resume delete did not remove the resume';
  END IF;
  SELECT count(*) INTO state_n FROM user_job_state WHERE job_id=job_id_v;
  IF state_n <> 1 THEN
    RAISE EXCEPTION 'non-bypass resume delete removed the referencing state row';
  END IF;
  IF EXISTS (SELECT 1 FROM user_job_state WHERE job_id=job_id_v AND resume_version_id IS NOT NULL) THEN
    RAISE EXCEPTION 'non-bypass resume delete did not clear resume_version_id';
  END IF;
END $$;

REVOKE ALL ON resume_versions FROM db002_app_test;
DELETE FROM jobs WHERE job_title='DB-002 nonbypass delete check';

INSERT INTO user_job_state (user_id, job_id, priority, notes)
SELECT u.id, j.id, CASE u.subject WHEN 'user-1' THEN 1 ELSE 5 END,
       'private-' || u.subject
FROM users u CROSS JOIN jobs j
WHERE u.issuer = 'db002-test' AND j.job_title = 'DB-002 shared job';
INSERT INTO user_job_contacts (user_id, job_id, name)
SELECT u.id, j.id, 'contact-' || u.subject FROM users u CROSS JOIN jobs j
WHERE u.issuer = 'db002-test' AND j.job_title = 'DB-002 shared job';
INSERT INTO user_job_status_history (user_id, job_id, to_stage)
SELECT u.id, j.id, 'applied' FROM users u CROSS JOIN jobs j
WHERE u.issuer = 'db002-test' AND j.job_title = 'DB-002 shared job';

SET ROLE db002_app_test;
BEGIN;
SELECT set_config('app.user_id', (SELECT id::text FROM users WHERE issuer='db002-test' AND subject='user-1'), true);
DO $$
DECLARE state_n int; contact_n int; history_n int; affected int;
BEGIN
  SELECT count(*) INTO state_n FROM user_job_state;
  SELECT count(*) INTO contact_n FROM user_job_contacts;
  SELECT count(*) INTO history_n FROM user_job_status_history;
  IF (state_n, contact_n, history_n) <> (1, 1, 1) THEN
    RAISE EXCEPTION 'owner-1 RLS mismatch: %, %, %', state_n, contact_n, history_n;
  END IF;
  IF EXISTS (SELECT 1 FROM user_job_state WHERE notes <> 'private-user-1') THEN
    RAISE EXCEPTION 'cross-user state visible';
  END IF;
  BEGIN
    INSERT INTO user_job_state (user_id, job_id)
    SELECT u.id, j.id FROM users u CROSS JOIN jobs j
    WHERE u.issuer='db002-test' AND u.subject='user-2' AND j.job_title='DB-002 parent check';
    RAISE EXCEPTION 'cross-owner state insert was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE user_job_state SET user_id=(SELECT id FROM users WHERE issuer='db002-test' AND subject='user-2');
    RAISE EXCEPTION 'cross-owner state update was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  DELETE FROM user_job_state WHERE user_id=(SELECT id FROM users WHERE issuer='db002-test' AND subject='user-2');
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'cross-owner state delete affected a row';
  END IF;
  BEGIN
    INSERT INTO user_job_contacts (user_id, job_id, name)
    SELECT u.id, j.id, 'forbidden' FROM users u CROSS JOIN jobs j
    WHERE u.issuer='db002-test' AND u.subject='user-2' AND j.job_title='DB-002 shared job';
    RAISE EXCEPTION 'cross-owner contact insert was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE user_job_contacts SET notes='forbidden'
    WHERE user_id=(SELECT id FROM users WHERE issuer='db002-test' AND subject='user-2');
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'cross-owner contact update affected a row'; END IF;
  DELETE FROM user_job_contacts
    WHERE user_id=(SELECT id FROM users WHERE issuer='db002-test' AND subject='user-2');
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'cross-owner contact delete affected a row'; END IF;
  BEGIN
    INSERT INTO user_job_status_history (user_id, job_id, to_stage)
    SELECT u.id, j.id, 'applied' FROM users u CROSS JOIN jobs j
    WHERE u.issuer='db002-test' AND u.subject='user-2' AND j.job_title='DB-002 shared job';
    RAISE EXCEPTION 'cross-owner history insert was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE user_job_status_history SET to_stage='offer_received';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'append-only history update affected a row'; END IF;
  DELETE FROM user_job_status_history;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'append-only history delete affected a row'; END IF;
END $$;
ROLLBACK;

BEGIN;
SELECT set_config('app.user_id', (SELECT id::text FROM users WHERE issuer='db002-test' AND subject='user-2'), true);
DO $$ BEGIN
  IF (SELECT count(*) FROM user_job_state) <> 1 OR
     (SELECT priority FROM user_job_state) <> 5 THEN
    RAISE EXCEPTION 'owner-2 independent state not isolated';
  END IF;
END $$;
SELECT set_config('app.user_id', 'malformed', true);
DO $$ BEGIN
  BEGIN
    PERFORM count(*) FROM user_job_state;
    RAISE EXCEPTION 'malformed context did not fail closed';
  EXCEPTION WHEN invalid_text_representation THEN NULL;
  END;
END $$;
ROLLBACK;

BEGIN;
SELECT set_config('app.user_id', '', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM user_job_state) <> 0 OR
     (SELECT count(*) FROM user_job_contacts) <> 0 OR
     (SELECT count(*) FROM user_job_status_history) <> 0 THEN
    RAISE EXCEPTION 'empty context did not fail closed';
  END IF;
END $$;
ROLLBACK;
RESET ROLE;

DO $$ BEGIN
  BEGIN
    INSERT INTO user_job_contacts (user_id, job_id, name)
    SELECT u.id, j.id, 'invalid-parent' FROM users u CROSS JOIN jobs j
    WHERE u.issuer='db002-test' AND u.subject='user-1' AND j.job_title='DB-002 parent check';
    RAISE EXCEPTION 'composite parent FK accepted an orphan child';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $$;

DELETE FROM users WHERE issuer = 'db002-test';
DELETE FROM jobs WHERE job_title IN ('DB-002 shared job', 'DB-002 parent check');
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM db002_app_test;
REVOKE ALL ON user_job_state, user_job_contacts, user_job_status_history FROM db002_app_test;
REVOKE ALL ON users FROM db002_app_test;
REVOKE USAGE ON SCHEMA public FROM db002_app_test;
DROP ROLE db002_app_test;
\echo 'DB-002 RLS, composite-parent, owner-matched, and non-bypass resume-delete checks passed'
