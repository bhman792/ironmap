-- ============================================================
--  FitTrack — Samsung Health / Open Wearables Schema
--  Run against your fittrack database:
--    docker exec -it fittrack-db psql -U postgres -d fittrack -f samsung_health_schema.sql
--
--  Covers: sleep, heart rate, blood oxygen, blood pressure,
--          stress, daily activity summary, workout sessions
--
--  Note: measurement_date columns are plain DATE (not generated)
--  to avoid PostgreSQL immutability errors. The sync script
--  simply passes date = timestamp.date() when inserting.
-- ============================================================


-- ── Sleep sessions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sleep_sessions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_date    DATE        NOT NULL,
    sleep_start     TIMESTAMPTZ NOT NULL,
    sleep_end       TIMESTAMPTZ NOT NULL,
    duration_min    INT,                               -- stored explicitly, not generated
    efficiency_pct  NUMERIC(5,2),
    awake_min       NUMERIC(6,1),
    rem_min         NUMERIC(6,1),
    light_min       NUMERIC(6,1),
    deep_min        NUMERIC(6,1),
    out_of_bed_min  NUMERIC(6,1),
    avg_hr_bpm      NUMERIC(5,1),
    avg_spo2_pct    NUMERIC(5,2),
    sleep_score     SMALLINT,
    source          VARCHAR(30) DEFAULT 'samsung',
    external_id     VARCHAR(100) UNIQUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sleep_sessions_date ON sleep_sessions(session_date DESC);


-- ── Heart rate readings ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS heart_rate (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    measured_at      TIMESTAMPTZ NOT NULL,
    measurement_date DATE        NOT NULL DEFAULT CURRENT_DATE,
    bpm              SMALLINT    NOT NULL,
    context          VARCHAR(30),
    source           VARCHAR(30) DEFAULT 'samsung',
    external_id      VARCHAR(100),
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_heart_rate_date ON heart_rate(measurement_date DESC, measured_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_heart_rate_external ON heart_rate(external_id) WHERE external_id IS NOT NULL;


-- ── Daily heart rate summary ──────────────────────────────────
CREATE TABLE IF NOT EXISTS heart_rate_daily (
    id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    summary_date DATE    NOT NULL UNIQUE,
    resting_bpm  NUMERIC(5,1),
    min_bpm      SMALLINT,
    max_bpm      SMALLINT,
    avg_bpm      NUMERIC(5,1),
    hrv_ms       NUMERIC(6,2),
    source       VARCHAR(30) DEFAULT 'samsung',
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_heart_rate_daily_date ON heart_rate_daily(summary_date DESC);


-- ── Blood oxygen (SpO2) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS blood_oxygen (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    measured_at      TIMESTAMPTZ NOT NULL,
    measurement_date DATE        NOT NULL DEFAULT CURRENT_DATE,
    spo2_pct         NUMERIC(5,2) NOT NULL,
    context          VARCHAR(30),
    source           VARCHAR(30) DEFAULT 'samsung',
    external_id      VARCHAR(100),
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blood_oxygen_date ON blood_oxygen(measurement_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_blood_oxygen_external ON blood_oxygen(external_id) WHERE external_id IS NOT NULL;


-- ── Blood pressure ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blood_pressure (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    measured_at      TIMESTAMPTZ NOT NULL,
    measurement_date DATE        NOT NULL DEFAULT CURRENT_DATE,
    systolic_mmhg    SMALLINT    NOT NULL,
    diastolic_mmhg   SMALLINT    NOT NULL,
    pulse_bpm        SMALLINT,
    context          VARCHAR(30),
    notes            TEXT,
    source           VARCHAR(30) DEFAULT 'manual',
    external_id      VARCHAR(100),
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blood_pressure_date ON blood_pressure(measurement_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_blood_pressure_external ON blood_pressure(external_id) WHERE external_id IS NOT NULL;


-- ── Stress levels ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stress_readings (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    measured_at      TIMESTAMPTZ NOT NULL,
    measurement_date DATE        NOT NULL DEFAULT CURRENT_DATE,
    stress_score     SMALLINT    NOT NULL,
    source           VARCHAR(30) DEFAULT 'samsung',
    external_id      VARCHAR(100),
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stress_date ON stress_readings(measurement_date DESC);


-- ── Daily activity summary ────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_activity (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_date   DATE    NOT NULL UNIQUE,
    steps           INT,
    distance_m      NUMERIC(8,1),
    calories_active INT,
    calories_total  INT,
    active_min      INT,
    floors_climbed  SMALLINT,
    move_min        INT,
    vo2_max         NUMERIC(5,2),
    source          VARCHAR(30) DEFAULT 'samsung',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_activity_date ON daily_activity(activity_date DESC);


-- ── Samsung-detected workout sessions ────────────────────────
CREATE TABLE IF NOT EXISTS samsung_workouts (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_date     DATE        NOT NULL,
    workout_start    TIMESTAMPTZ NOT NULL,
    workout_end      TIMESTAMPTZ NOT NULL,
    duration_min     INT,
    activity_type    VARCHAR(50) NOT NULL,
    calories         INT,
    distance_m       NUMERIC(8,1),
    avg_hr_bpm       NUMERIC(5,1),
    max_hr_bpm       SMALLINT,
    avg_pace_sec_km  INT,
    avg_speed_kmh    NUMERIC(5,2),
    elevation_gain_m NUMERIC(7,1),
    steps            INT,
    avg_power_w      NUMERIC(6,1),
    vo2_max          NUMERIC(5,2),
    workout_score    SMALLINT,
    notes            TEXT,
    source           VARCHAR(30) DEFAULT 'samsung',
    external_id      VARCHAR(100) UNIQUE,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_samsung_workouts_date ON samsung_workouts(session_date DESC);


-- ============================================================
--  VIEWS
-- ============================================================

CREATE OR REPLACE VIEW v_daily_health_summary AS
SELECT
    COALESCE(da.activity_date,
             bpd.measurement_date,
             hrd.summary_date)              AS summary_date,
    da.steps,
    ROUND(da.distance_m / 1000.0, 2)       AS distance_km,
    da.calories_active,
    da.calories_total,
    da.active_min,
    da.floors_climbed,
    da.vo2_max                              AS vo2_max_daily,
    hrd.resting_bpm,
    hrd.min_bpm,
    hrd.max_bpm,
    hrd.hrv_ms,
    bpd.systolic_mmhg,
    bpd.diastolic_mmhg,
    spo2d.avg_spo2,
    strd.avg_stress,
    sl.duration_min                         AS sleep_min,
    sl.deep_min,
    sl.rem_min,
    sl.light_min,
    sl.efficiency_pct                       AS sleep_efficiency,
    sl.sleep_score
FROM daily_activity da
FULL OUTER JOIN heart_rate_daily hrd
    ON hrd.summary_date = da.activity_date
FULL OUTER JOIN (
    SELECT DISTINCT ON (measurement_date)
        measurement_date, systolic_mmhg, diastolic_mmhg
    FROM blood_pressure
    ORDER BY measurement_date DESC, measured_at DESC
) bpd ON bpd.measurement_date = da.activity_date
FULL OUTER JOIN (
    SELECT measurement_date,
           ROUND(AVG(spo2_pct)::NUMERIC, 1) AS avg_spo2
    FROM blood_oxygen GROUP BY measurement_date
) spo2d ON spo2d.measurement_date = da.activity_date
FULL OUTER JOIN (
    SELECT measurement_date,
           ROUND(AVG(stress_score)::NUMERIC, 1) AS avg_stress
    FROM stress_readings GROUP BY measurement_date
) strd ON strd.measurement_date = da.activity_date
FULL OUTER JOIN (
    SELECT DISTINCT ON (session_date)
        session_date,
        duration_min, deep_min, rem_min,
        light_min, efficiency_pct, sleep_score
    FROM sleep_sessions
    ORDER BY session_date DESC
) sl ON sl.session_date = da.activity_date - 1
ORDER BY summary_date DESC NULLS LAST;


CREATE OR REPLACE VIEW v_weekly_sleep AS
SELECT
    DATE_TRUNC('week', session_date)::DATE  AS week_start,
    COUNT(*)                                AS nights,
    ROUND(AVG(duration_min))               AS avg_sleep_min,
    ROUND(AVG(deep_min))                   AS avg_deep_min,
    ROUND(AVG(rem_min))                    AS avg_rem_min,
    ROUND(AVG(efficiency_pct)::NUMERIC, 1) AS avg_efficiency,
    ROUND(AVG(sleep_score)::NUMERIC, 1)    AS avg_sleep_score
FROM sleep_sessions
GROUP BY week_start
ORDER BY week_start DESC;


CREATE OR REPLACE VIEW v_hr_trend AS
SELECT
    summary_date,
    resting_bpm,
    ROUND(AVG(resting_bpm) OVER (
        ORDER BY summary_date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    )::NUMERIC, 1) AS rolling_7day_avg,
    hrv_ms
FROM heart_rate_daily
WHERE resting_bpm IS NOT NULL
ORDER BY summary_date DESC;


CREATE OR REPLACE VIEW v_blood_pressure_log AS
SELECT
    measured_at,
    measurement_date,
    systolic_mmhg,
    diastolic_mmhg,
    pulse_bpm,
    CASE
        WHEN systolic_mmhg < 120 AND diastolic_mmhg < 80  THEN 'Normal'
        WHEN systolic_mmhg < 130 AND diastolic_mmhg < 80  THEN 'Elevated'
        WHEN systolic_mmhg < 140 OR  diastolic_mmhg < 90  THEN 'High Stage 1'
        WHEN systolic_mmhg >= 140 OR diastolic_mmhg >= 90 THEN 'High Stage 2'
        ELSE 'Unknown'
    END AS classification,
    source,
    notes
FROM blood_pressure
ORDER BY measured_at DESC;


CREATE OR REPLACE VIEW v_samsung_workout_history AS
SELECT
    session_date,
    activity_type,
    duration_min,
    ROUND(distance_m / 1000.0, 2) AS distance_km,
    calories,
    avg_hr_bpm,
    max_hr_bpm,
    CASE WHEN avg_pace_sec_km IS NOT NULL
        THEN TO_CHAR((avg_pace_sec_km || ' seconds')::INTERVAL, 'MI:SS')
    END AS avg_pace,
    avg_speed_kmh,
    elevation_gain_m,
    vo2_max,
    workout_score,
    source
FROM samsung_workouts
ORDER BY session_date DESC, workout_start DESC;


-- ============================================================
--  REFERENCE: Open Wearables → FitTrack table mapping
-- ============================================================
--
--  steps / distance / calories   → daily_activity
--  heart_rate (spot readings)    → heart_rate
--  heart_rate (daily summary)    → heart_rate_daily
--  hrv                           → heart_rate_daily.hrv_ms
--  spo2 / blood_oxygen           → blood_oxygen
--  blood_pressure                → blood_pressure
--  stress                        → stress_readings
--  sleep session                 → sleep_sessions
--  workout / exercise session    → samsung_workouts
--  weight / body composition     → body_metrics (already exists)
--
--  Power BI views:
--    v_daily_health_summary      → main health dashboard
--    v_weekly_sleep              → sleep trend charts
--    v_hr_trend                  → resting HR + HRV over time
--    v_blood_pressure_log        → BP with classification
--    v_samsung_workout_history   → auto-detected workouts
-- ============================================================
