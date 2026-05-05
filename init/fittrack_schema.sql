-- ============================================================
--  FitTrack PostgreSQL Schema
--  Compatible with PostgreSQL 14+
--  Run this once after creating your database:
--    psql -U fittrack -d fittrack -f fittrack_schema.sql
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- for gen_random_uuid()


-- ── Lookup: muscle groups (used for Power BI filtering) ──────
CREATE TABLE muscle_groups (
    id      SERIAL PRIMARY KEY,
    name    VARCHAR(50) NOT NULL UNIQUE   -- e.g. 'Chest', 'Back', 'Legs'
);

INSERT INTO muscle_groups (name) VALUES
    ('Chest'), ('Back'), ('Shoulders'), ('Biceps'), ('Triceps'),
    ('Legs'), ('Glutes'), ('Core'), ('Full Body'), ('Other');


-- ── Lookup: exercise library ──────────────────────────────────
CREATE TABLE exercises (
    id               SERIAL PRIMARY KEY,
    name             VARCHAR(100) NOT NULL UNIQUE,
    muscle_group_id  INT REFERENCES muscle_groups(id),
    equipment        VARCHAR(50),          -- 'Barbell', 'Dumbbell', 'Machine', 'Bodyweight'
    notes            TEXT
);

INSERT INTO exercises (name, muscle_group_id, equipment) VALUES
    ('Bench Press',       1, 'Barbell'),
    ('Incline DB Press',  1, 'Dumbbell'),
    ('Pull-Up',           2, 'Bodyweight'),
    ('Barbell Row',       2, 'Barbell'),
    ('Overhead Press',    3, 'Barbell'),
    ('Lateral Raise',     3, 'Dumbbell'),
    ('Barbell Curl',      4, 'Barbell'),
    ('Hammer Curl',       4, 'Dumbbell'),
    ('Tricep Pushdown',   5, 'Machine'),
    ('Squat',             6, 'Barbell'),
    ('Romanian Deadlift', 6, 'Barbell'),
    ('Leg Press',         6, 'Machine'),
    ('Hip Thrust',        7, 'Barbell'),
    ('Plank',             8, 'Bodyweight'),
    ('Deadlift',          9, 'Barbell');


-- ── Workout sessions ─────────────────────────────────────────
CREATE TABLE workout_sessions (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_date DATE        NOT NULL,
    name         VARCHAR(100) NOT NULL,            -- 'Push Day', 'Leg Day', etc.
    duration_min INT,                              -- total session length in minutes
    notes        TEXT,
    source       VARCHAR(20) DEFAULT 'manual',     -- 'manual' | 'import'
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workout_sessions_date ON workout_sessions(session_date DESC);


-- ── Exercises performed in each session ──────────────────────
CREATE TABLE workout_sets (
    id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID    NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    exercise_id         INT     REFERENCES exercises(id),
    exercise_name       VARCHAR(100),              -- fallback if not in library
    set_number          SMALLINT NOT NULL,
    reps                SMALLINT,
    weight_lbs          NUMERIC(6,2),
    rpe                 NUMERIC(3,1),              -- Rate of Perceived Exertion (1-10)
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workout_sets_session ON workout_sets(session_id);
CREATE INDEX idx_workout_sets_exercise ON workout_sets(exercise_id);


-- ── Cardio sessions ──────────────────────────────────────────
CREATE TABLE cardio_sessions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_date    DATE        NOT NULL,
    activity_type   VARCHAR(50) NOT NULL,   -- 'Run', 'Cycle', 'Walk', 'Row', 'Swim', etc.
    distance_km     NUMERIC(7,2),
    duration_min    INT,
    avg_hr_bpm      SMALLINT,
    max_hr_bpm      SMALLINT,
    steps           INT,
    calories_burned INT,
    notes           TEXT,
    source          VARCHAR(20) DEFAULT 'manual',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cardio_sessions_date ON cardio_sessions(session_date DESC);


-- ── Body metrics (manual + Renpho auto-sync) ─────────────────
CREATE TABLE body_metrics (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    measured_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    measurement_date DATE        NOT NULL DEFAULT CURRENT_DATE,
    weight_lbs      NUMERIC(6,2),
    body_fat_pct    NUMERIC(5,2),
    muscle_mass_lbs NUMERIC(6,2),
    bone_mass_lbs   NUMERIC(5,2),
    body_water_pct  NUMERIC(5,2),
    visceral_fat    SMALLINT,
    bmi             NUMERIC(5,2),
    bmr_kcal        INT,                    -- Basal Metabolic Rate
    metabolic_age   SMALLINT,
    source          VARCHAR(20) DEFAULT 'manual',   -- 'manual' | 'renpho'
    renpho_user_id  VARCHAR(50),            -- Renpho account reference
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_body_metrics_date   ON body_metrics(measurement_date DESC, created_at DESC);
CREATE INDEX idx_body_metrics_source ON body_metrics(source);

-- Prevent duplicate Renpho entries for the same timestamp
CREATE UNIQUE INDEX idx_body_metrics_renpho_unique
    ON body_metrics(renpho_user_id, measured_at)
    WHERE source = 'renpho';


-- ── Nutrition log ────────────────────────────────────────────
CREATE TABLE nutrition_log (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    log_date        DATE        NOT NULL,
    meal_type       VARCHAR(20) NOT NULL,   -- 'Breakfast', 'Lunch', 'Dinner', 'Snack'
    food_name       VARCHAR(200) NOT NULL,
    quantity        NUMERIC(7,2),
    unit            VARCHAR(30),            -- 'g', 'oz', 'cup', 'serving'
    calories_kcal   INT,
    protein_g       NUMERIC(6,2),
    carbs_g         NUMERIC(6,2),
    fat_g           NUMERIC(6,2),
    fiber_g         NUMERIC(6,2),
    sugar_g         NUMERIC(6,2),
    sodium_mg       INT,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_nutrition_log_date ON nutrition_log(log_date DESC);


-- ── Personal goals ───────────────────────────────────────────
CREATE TABLE goals (
    id              SERIAL      PRIMARY KEY,
    goal_type       VARCHAR(50) NOT NULL,   -- 'weight', 'body_fat', 'workout_frequency', etc.
    target_value    NUMERIC(8,2),
    target_date     DATE,
    start_value     NUMERIC(8,2),
    start_date      DATE        DEFAULT CURRENT_DATE,
    notes           TEXT,
    is_active       BOOLEAN     DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
--  VIEWS  (these are what you connect Power BI to)
-- ============================================================

-- Daily nutrition totals — one row per day
CREATE OR REPLACE VIEW v_daily_nutrition AS
SELECT
    log_date,
    SUM(calories_kcal)  AS total_calories,
    SUM(protein_g)      AS total_protein_g,
    SUM(carbs_g)        AS total_carbs_g,
    SUM(fat_g)          AS total_fat_g,
    SUM(fiber_g)        AS total_fiber_g,
    COUNT(*)            AS entry_count
FROM nutrition_log
GROUP BY log_date
ORDER BY log_date DESC;


-- Weekly workout summary
CREATE OR REPLACE VIEW v_weekly_workouts AS
SELECT
    DATE_TRUNC('week', session_date)::DATE  AS week_start,
    COUNT(*)                                AS session_count,
    SUM(duration_min)                       AS total_duration_min,
    ROUND(AVG(duration_min), 1)             AS avg_duration_min
FROM workout_sessions
GROUP BY week_start
ORDER BY week_start DESC;


-- Weekly cardio summary
CREATE OR REPLACE VIEW v_weekly_cardio AS
SELECT
    DATE_TRUNC('week', session_date)::DATE  AS week_start,
    activity_type,
    COUNT(*)                                AS session_count,
    ROUND(SUM(distance_km)::NUMERIC, 2)    AS total_km,
    SUM(duration_min)                       AS total_min,
    SUM(steps)                              AS total_steps
FROM cardio_sessions
GROUP BY week_start, activity_type
ORDER BY week_start DESC;


-- Most recent weight reading per day (de-duplication for Power BI)
CREATE OR REPLACE VIEW v_weight_trend AS
SELECT DISTINCT ON (measurement_date)
    measurement_date,
    weight_lbs,
    body_fat_pct,
    muscle_mass_lbs,
    bmi,
    source
FROM body_metrics
WHERE weight_lbs IS NOT NULL
ORDER BY measurement_date DESC, created_at DESC;


-- Personal record (PR) per exercise — heaviest single set
CREATE OR REPLACE VIEW v_exercise_prs AS
SELECT
    COALESCE(e.name, ws.exercise_name)  AS exercise,
    mg.name                             AS muscle_group,
    MAX(ws.weight_lbs)                  AS pr_weight_lbs,
    MAX(ws.reps)                        AS max_reps,
    MAX(wk.session_date)                AS last_performed
FROM workout_sets ws
JOIN workout_sessions wk ON wk.id = ws.session_id
LEFT JOIN exercises e    ON e.id  = ws.exercise_id
LEFT JOIN muscle_groups mg ON mg.id = e.muscle_group_id
GROUP BY COALESCE(e.name, ws.exercise_name), mg.name
ORDER BY exercise;


-- Full workout detail — useful for Power BI drill-through
CREATE OR REPLACE VIEW v_workout_detail AS
SELECT
    wk.session_date,
    wk.name          AS session_name,
    wk.duration_min,
    ws.set_number,
    COALESCE(e.name, ws.exercise_name)  AS exercise,
    mg.name          AS muscle_group,
    ws.weight_lbs,
    ws.reps,
    ws.rpe
FROM workout_sessions wk
JOIN workout_sets ws    ON ws.session_id = wk.id
LEFT JOIN exercises e   ON e.id          = ws.exercise_id
LEFT JOIN muscle_groups mg ON mg.id      = e.muscle_group_id
ORDER BY wk.session_date DESC, ws.set_number;


-- ============================================================
--  SAMPLE DATA  (delete this block after testing)
-- ============================================================

-- Sample workout
WITH s AS (
    INSERT INTO workout_sessions (session_date, name, duration_min, notes)
    VALUES ('2025-04-14', 'Push Day', 55, 'Good session, bench felt strong')
    RETURNING id
)
INSERT INTO workout_sets (session_id, exercise_name, set_number, reps, weight_lbs, rpe)
SELECT s.id, exercise_name, set_number, reps, weight_lbs, rpe FROM s,
(VALUES
    ('Bench Press',      1, 8, 185.0, 7.0),
    ('Bench Press',      2, 8, 185.0, 7.5),
    ('Bench Press',      3, 6, 195.0, 8.5),
    ('Incline DB Press', 1, 10, 65.0, 7.0),
    ('Incline DB Press', 2, 10, 65.0, 7.5),
    ('Overhead Press',   1, 8,  95.0, 7.0),
    ('Overhead Press',   2, 8,  95.0, 8.0)
) AS ex(exercise_name, set_number, reps, weight_lbs, rpe);

-- Sample cardio
INSERT INTO cardio_sessions (session_date, activity_type, distance_km, duration_min, avg_hr_bpm, steps)
VALUES
    ('2025-04-13', 'Run',   5.2, 28, 158, 6800),
    ('2025-04-11', 'Cycle', 18.0, 45, 142, NULL),
    ('2025-04-09', 'Walk',  3.1, 40, 115, 4200);

-- Sample body metrics (as if from Renpho)
INSERT INTO body_metrics (measured_at, measurement_date, weight_lbs, body_fat_pct, muscle_mass_lbs, bmi, source)
VALUES
    ('2025-04-15 07:12:00', '2025-04-15', 187.4, 19.2, 142.1, 25.8, 'renpho'),
    ('2025-04-14 07:08:00', '2025-04-14', 188.0, 19.4, 141.8, 25.9, 'renpho'),
    ('2025-04-13 07:22:00', '2025-04-13', 187.8, 19.3, 142.0, 25.9, 'renpho'),
    ('2025-04-12 07:15:00', '2025-04-12', 188.6, 19.5, 141.5, 26.0, 'renpho'),
    ('2025-04-11 07:05:00', '2025-04-11', 189.1, 19.7, 141.2, 26.1, 'renpho');

-- Sample nutrition
INSERT INTO nutrition_log (log_date, meal_type, food_name, calories_kcal, protein_g, carbs_g, fat_g)
VALUES
    ('2025-04-15', 'Breakfast', 'Greek yogurt with berries', 220, 18.0, 28.0, 4.0),
    ('2025-04-15', 'Breakfast', 'Oatmeal',                   310, 10.0, 54.0, 6.0),
    ('2025-04-15', 'Lunch',     'Chicken breast + rice',     520, 45.0, 52.0, 8.0),
    ('2025-04-15', 'Snack',     'Protein shake',             160, 25.0,  8.0, 3.0),
    ('2025-04-15', 'Dinner',    'Salmon + veggies',          480, 38.0, 22.0, 22.0);


-- ============================================================
--  QUICK REFERENCE: Power BI connection
-- ============================================================
--
--  In Power BI Desktop → Get Data → PostgreSQL:
--    Server:   <your-unraid-ip>:5432
--    Database: fittrack
--    Mode:     Import  (or DirectQuery for live data)
--
--  Recommended tables/views to import:
--    v_daily_nutrition    → daily macro totals
--    v_weekly_workouts    → weekly volume
--    v_weekly_cardio      → cardio by type
--    v_weight_trend       → one weight reading per day
--    v_exercise_prs       → personal records table
--    v_workout_detail     → drill-through for individual sets
--
--  Suggested Power BI visuals:
--    Line chart  → v_weight_trend (date vs weight_lbs)
--    Bar chart   → v_weekly_workouts (week_start vs session_count)
--    Area chart  → v_daily_nutrition (date vs total_calories)
--    Table       → v_exercise_prs
--    Card KPIs   → latest weight, current body fat %, this week's sessions
-- ============================================================
