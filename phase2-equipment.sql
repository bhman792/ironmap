-- ============================================================
--  IronMap — Phase 2: Equipment Database
--  Run with:
--    docker exec -i fittrack-db psql -U postgres -d fittrack < phase2-equipment.sql
-- ============================================================

-- ── Global equipment library ──────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_library (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(150) NOT NULL,
    brand        VARCHAR(100),
    type         VARCHAR(50)  NOT NULL DEFAULT 'other',
    category     VARCHAR(50),
    is_flagged   BOOLEAN      DEFAULT FALSE,
    flag_count   INT          DEFAULT 0,
    created_by   VARCHAR(100) DEFAULT 'community',
    created_at   TIMESTAMPTZ  DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE(name, brand)
);

CREATE INDEX IF NOT EXISTS idx_equipment_library_name ON equipment_library(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_equipment_library_brand ON equipment_library(LOWER(brand));
CREATE INDEX IF NOT EXISTS idx_equipment_library_type ON equipment_library(type);

-- ── Equipment types reference ─────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_types (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

INSERT INTO equipment_types (name) VALUES
    ('Plate-loaded'),
    ('Selectorized'),
    ('Cable'),
    ('Smith machine'),
    ('Cardio'),
    ('Free weights'),
    ('Bodyweight / rig'),
    ('Stretching / mobility'),
    ('Other')
ON CONFLICT (name) DO NOTHING;

-- ── Equipment categories reference ────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_categories (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

INSERT INTO equipment_categories (name) VALUES
    ('Chest'),
    ('Back'),
    ('Shoulders'),
    ('Biceps'),
    ('Triceps'),
    ('Legs'),
    ('Glutes'),
    ('Core'),
    ('Full body'),
    ('Cardio'),
    ('Other')
ON CONFLICT (name) DO NOTHING;

-- ── Gym equipment (confirmed at a specific gym) ───────────────
CREATE TABLE IF NOT EXISTS gym_equipment (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id              UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    equipment_id        UUID        NOT NULL REFERENCES equipment_library(id) ON DELETE CASCADE,
    condition           VARCHAR(20) DEFAULT 'good'
                            CHECK (condition IN ('excellent','good','fair','out_of_service')),
    weight_min_lbs      INT,
    weight_max_lbs      INT,
    notes               TEXT,
    is_out_of_service   BOOLEAN     DEFAULT FALSE,
    oos_reported_at     TIMESTAMPTZ,
    oos_auto_clear_at   TIMESTAMPTZ, -- 30 days after last report
    is_flagged          BOOLEAN     DEFAULT FALSE,
    flag_count          INT         DEFAULT 0,
    added_by            VARCHAR(100) DEFAULT 'community',
    added_at            TIMESTAMPTZ  DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE(gym_id, equipment_id)
);

CREATE INDEX IF NOT EXISTS idx_gym_equipment_gym    ON gym_equipment(gym_id);
CREATE INDEX IF NOT EXISTS idx_gym_equipment_equip  ON gym_equipment(equipment_id);
CREATE INDEX IF NOT EXISTS idx_gym_equipment_oos    ON gym_equipment(is_out_of_service, oos_auto_clear_at);

-- ── Out of service reports ────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_oos_reports (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_equipment_id UUID        NOT NULL REFERENCES gym_equipment(id) ON DELETE CASCADE,
    reported_by      VARCHAR(100) DEFAULT 'community',
    reported_at      TIMESTAMPTZ  DEFAULT NOW(),
    resolved_at      TIMESTAMPTZ,
    notes            TEXT
);

CREATE INDEX IF NOT EXISTS idx_oos_reports_equipment ON equipment_oos_reports(gym_equipment_id);

-- ── Content flags (inappropriate content reports) ─────────────
CREATE TABLE IF NOT EXISTS equipment_flags (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('library','gym_equipment')),
    target_id   UUID        NOT NULL,
    reason      VARCHAR(200),
    reported_by VARCHAR(100) DEFAULT 'community',
    reported_at TIMESTAMPTZ  DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_flags_target ON equipment_flags(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_flags_unresolved ON equipment_flags(resolved_at) WHERE resolved_at IS NULL;

-- ── Seed global equipment library with common machines ────────
INSERT INTO equipment_library (name, brand, type, category) VALUES
    -- Chest
    ('Flat Bench Press Station',        'Generic',          'Free weights',  'Chest'),
    ('Incline Bench Press Station',     'Generic',          'Free weights',  'Chest'),
    ('Decline Bench Press Station',     'Generic',          'Free weights',  'Chest'),
    ('ISO Lateral Chest Press',         'Hammer Strength',  'Plate-loaded',  'Chest'),
    ('ISO Incline Press',               'Hammer Strength',  'Plate-loaded',  'Chest'),
    ('Chest Press',                     'Life Fitness',     'Selectorized',  'Chest'),
    ('Chest Fly / Pec Deck',            'Life Fitness',     'Selectorized',  'Chest'),
    ('Cable Crossover',                 'Generic',          'Cable',         'Chest'),
    -- Back
    ('Pull-Up / Chin-Up Rig',           'Generic',          'Bodyweight / rig', 'Back'),
    ('Lat Pulldown',                    'Life Fitness',     'Selectorized',  'Back'),
    ('Seated Cable Row',                'Generic',          'Cable',         'Back'),
    ('ISO Lateral Row',                 'Hammer Strength',  'Plate-loaded',  'Back'),
    ('T-Bar Row',                       'Generic',          'Plate-loaded',  'Back'),
    ('Back Extension',                  'Generic',          'Bodyweight / rig', 'Back'),
    -- Shoulders
    ('Shoulder Press',                  'Life Fitness',     'Selectorized',  'Shoulders'),
    ('ISO Lateral Shoulder Press',      'Hammer Strength',  'Plate-loaded',  'Shoulders'),
    ('Lateral Raise Machine',           'Life Fitness',     'Selectorized',  'Shoulders'),
    ('Rear Delt Fly',                   'Life Fitness',     'Selectorized',  'Shoulders'),
    -- Arms
    ('Preacher Curl',                   'Life Fitness',     'Selectorized',  'Biceps'),
    ('Bicep Curl Machine',              'Generic',          'Selectorized',  'Biceps'),
    ('Tricep Pushdown',                 'Generic',          'Cable',         'Triceps'),
    ('Tricep Extension',                'Life Fitness',     'Selectorized',  'Triceps'),
    ('Dip Station',                     'Generic',          'Bodyweight / rig', 'Triceps'),
    -- Legs
    ('Squat Rack',                      'Generic',          'Free weights',  'Legs'),
    ('Leg Press',                       'Hammer Strength',  'Plate-loaded',  'Legs'),
    ('Leg Extension',                   'Life Fitness',     'Selectorized',  'Legs'),
    ('Leg Curl (Seated)',               'Life Fitness',     'Selectorized',  'Legs'),
    ('Leg Curl (Lying)',                'Life Fitness',     'Selectorized',  'Legs'),
    ('Hip Abductor / Adductor',         'Life Fitness',     'Selectorized',  'Legs'),
    ('Calf Raise (Standing)',           'Generic',          'Plate-loaded',  'Legs'),
    ('Calf Raise (Seated)',             'Life Fitness',     'Selectorized',  'Legs'),
    ('Smith Machine',                   'Generic',          'Smith machine', 'Full body'),
    -- Glutes
    ('Hip Thrust Machine',              'Nautilus',         'Selectorized',  'Glutes'),
    ('Glute Kickback Machine',          'Life Fitness',     'Selectorized',  'Glutes'),
    -- Core
    ('Ab Crunch Machine',               'Life Fitness',     'Selectorized',  'Core'),
    ('Roman Chair / Hyperextension',    'Generic',          'Bodyweight / rig', 'Core'),
    ('Cable Crunch Station',            'Generic',          'Cable',         'Core'),
    -- Cardio
    ('Treadmill',                       'Life Fitness',     'Cardio',        'Cardio'),
    ('Elliptical',                      'Life Fitness',     'Cardio',        'Cardio'),
    ('Stationary Bike (Upright)',       'Life Fitness',     'Cardio',        'Cardio'),
    ('Stationary Bike (Recumbent)',     'Life Fitness',     'Cardio',        'Cardio'),
    ('Rowing Machine',                  'Concept2',         'Cardio',        'Cardio'),
    ('Stair Climber',                   'StairMaster',      'Cardio',        'Cardio'),
    ('Assault Bike',                    'Assault Fitness',  'Cardio',        'Cardio'),
    ('Jacob''s Ladder',                 'Jacob''s Ladder',  'Cardio',        'Cardio'),
    -- Free weights
    ('Dumbbell Rack',                   'Generic',          'Free weights',  'Full body'),
    ('Barbell Rack',                    'Generic',          'Free weights',  'Full body'),
    ('Kettlebell Rack',                 'Generic',          'Free weights',  'Full body'),
    ('Cable Machine (Dual Adjustable)', 'Life Fitness',     'Cable',         'Full body'),
    ('Functional Trainer',              'Life Fitness',     'Cable',         'Full body')
ON CONFLICT (name, brand) DO NOTHING;

-- ── View: gym equipment with library details ──────────────────
CREATE OR REPLACE VIEW v_gym_equipment AS
SELECT
    ge.id,
    ge.gym_id,
    ge.equipment_id,
    el.name             AS equipment_name,
    el.brand,
    el.type,
    el.category,
    ge.condition,
    ge.weight_min_lbs,
    ge.weight_max_lbs,
    ge.notes,
    ge.is_out_of_service,
    ge.oos_reported_at,
    ge.oos_auto_clear_at,
    ge.is_flagged,
    ge.flag_count,
    ge.added_by,
    ge.added_at,
    -- Auto-clear OOS if 30 days have passed
    CASE WHEN ge.is_out_of_service
          AND ge.oos_auto_clear_at IS NOT NULL
          AND ge.oos_auto_clear_at < NOW()
         THEN FALSE
         ELSE ge.is_out_of_service
    END                 AS effective_oos,
    (SELECT COUNT(*) FROM equipment_oos_reports r
     WHERE r.gym_equipment_id = ge.id
       AND r.resolved_at IS NULL) AS oos_report_count
FROM gym_equipment ge
JOIN equipment_library el ON el.id = ge.equipment_id
WHERE el.is_flagged = FALSE
ORDER BY el.category, el.name;

-- ── View: equipment library search ───────────────────────────
CREATE OR REPLACE VIEW v_equipment_library AS
SELECT
    el.id,
    el.name,
    el.brand,
    el.type,
    el.category,
    el.is_flagged,
    el.created_by,
    el.created_at,
    COUNT(ge.id)::INT AS gym_count
FROM equipment_library el
LEFT JOIN gym_equipment ge ON ge.equipment_id = el.id
WHERE el.is_flagged = FALSE
GROUP BY el.id
ORDER BY el.category, el.name;

-- ── Permissions ───────────────────────────────────────────────
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO fittrack;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fittrack;
