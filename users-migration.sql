-- ============================================================
--  IronMap — User Accounts Migration
--  Phase 1: Schema changes
--
--  Run with:
--    docker exec -i fittrack-db psql -U postgres -d fittrack < users-migration.sql
-- ============================================================

-- ── 1. Users table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email        VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    role         VARCHAR(20)  NOT NULL DEFAULT 'member'
                     CHECK (role IN ('admin','member')),
    is_active    BOOLEAN      DEFAULT TRUE,
    created_at   TIMESTAMPTZ  DEFAULT NOW(),
    last_login   TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));

-- ── 2. Invite codes table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS invite_codes (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code         VARCHAR(32)  NOT NULL UNIQUE,
    created_by   UUID         REFERENCES users(id) ON DELETE SET NULL,
    used_by      UUID         REFERENCES users(id) ON DELETE SET NULL,
    used_at      TIMESTAMPTZ,
    expires_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  DEFAULT NOW(),
    note         VARCHAR(200)  -- e.g. "for John at CAC"
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);

-- ── 3. Add user_id to all data tables ────────────────────────
ALTER TABLE workout_sessions  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE cardio_sessions   ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE body_metrics      ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE nutrition_log     ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE goals             ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_settings     ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Community tables — track who contributed but data is shared
ALTER TABLE gyms              ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE gym_equipment     ADD COLUMN IF NOT EXISTS added_by_user UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE equipment_library ADD COLUMN IF NOT EXISTS created_by_user UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE equipment_flags   ADD COLUMN IF NOT EXISTS reported_by_user UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE equipment_oos_reports ADD COLUMN IF NOT EXISTS reported_by_user UUID REFERENCES users(id) ON DELETE SET NULL;

-- ── 4. Indexes on user_id columns ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_workouts_user  ON workout_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_cardio_user    ON cardio_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_metrics_user   ON body_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_user ON nutrition_log(user_id);
CREATE INDEX IF NOT EXISTS idx_settings_user  ON user_settings(user_id);

-- ── 5. Create admin user (you) ────────────────────────────────
-- Password will be set via the API on first login
-- We insert a placeholder and update it after running the server
INSERT INTO users (id, email, display_name, role, password_hash)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'admin@ironmap.local',
    'Admin',
    'admin',
    'PLACEHOLDER'  -- will be replaced on first setup
)
ON CONFLICT (email) DO NOTHING;

-- ── 6. Assign all existing data to admin user ─────────────────
UPDATE workout_sessions  SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;
UPDATE cardio_sessions   SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;
UPDATE body_metrics      SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;
UPDATE nutrition_log     SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;
UPDATE goals             SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;
UPDATE user_settings     SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;
UPDATE gyms              SET created_by = '00000000-0000-0000-0000-000000000001' WHERE created_by IS NULL;

-- ── 7. Make user_id NOT NULL on private tables ────────────────
-- Only after all existing data has been assigned above
ALTER TABLE workout_sessions  ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE cardio_sessions   ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE body_metrics      ALTER COLUMN user_id SET NOT NULL;

-- nutrition_log and user_settings can stay nullable in case of edge cases

-- ── 8. Refresh permissions ────────────────────────────────────
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO fittrack;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fittrack;

-- ── Fix user_settings unique constraint for per-user keys ─────
ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS user_settings_pkey;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS id SERIAL;
ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS user_settings_key_key;
-- Add composite unique constraint: one value per key per user
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_settings_user_key_unique'
  ) THEN
    ALTER TABLE user_settings ADD CONSTRAINT user_settings_user_key_unique UNIQUE (user_id, key);
  END IF;
END $$;
