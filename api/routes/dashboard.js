// ============================================================
//  routes/dashboard.js — user-aware
// ============================================================
import { Router } from 'express';
import { pool }   from '../db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const userId  = req.user.id;
    const today   = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() -  7 * 86400000).toISOString().split('T')[0];
    const monthAgo= new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

    const [workouts, cardio, weight, nutrition, recentActivity] = await Promise.all([

      pool.query(`
        SELECT COUNT(*)::INT AS count, COALESCE(SUM(duration_min),0)::INT AS total_min
        FROM workout_sessions WHERE session_date >= $1 AND user_id = $2
      `, [weekAgo, userId]),

      pool.query(`
        SELECT COUNT(*)::INT AS count,
               COALESCE(SUM(distance_km), 0) AS total_km,
               COALESCE(SUM(steps), 0)::INT AS total_steps
        FROM cardio_sessions WHERE session_date >= $1 AND user_id = $2
      `, [weekAgo, userId]),

      pool.query(`
        SELECT weight_lbs, body_fat_pct, bmi, measurement_date
        FROM body_metrics
        WHERE weight_lbs IS NOT NULL AND user_id = $1
        ORDER BY measured_at DESC LIMIT 1
      `, [userId]),

      pool.query(`
        SELECT COALESCE(SUM(calories_kcal),0)::INT AS calories,
               COALESCE(ROUND(SUM(protein_g)::NUMERIC,1),0) AS protein_g,
               COUNT(*)::INT AS entry_count
        FROM nutrition_log WHERE log_date=$1 AND user_id=$2
      `, [today, userId]),

      pool.query(`
        SELECT session_date AS date, 'Workout' AS type,
               name || CASE WHEN duration_min IS NOT NULL THEN ' · ' || duration_min || 'min' ELSE '' END AS detail
        FROM workout_sessions WHERE user_id = $1
        UNION ALL
        SELECT session_date, 'Cardio',
               activity_type || CASE WHEN distance_km IS NOT NULL THEN ' · ' || ROUND((distance_km*0.621371)::NUMERIC,2)||'mi' ELSE '' END
        FROM cardio_sessions WHERE user_id = $1
        UNION ALL
        SELECT measurement_date, 'Weight',
               weight_lbs || ' lbs' || CASE WHEN body_fat_pct IS NOT NULL THEN ' · ' || body_fat_pct || '% BF' ELSE '' END
        FROM body_metrics WHERE weight_lbs IS NOT NULL AND user_id = $1
        ORDER BY date DESC LIMIT 10
      `, [userId]),
    ]);

    const { rows: volumeByDay } = await pool.query(`
      SELECT ws.session_date::TEXT AS date,
             COALESCE(SUM(wst.weight_lbs * wst.reps),0)::INT AS total_lbs
      FROM workout_sessions ws
      LEFT JOIN workout_sets wst ON wst.session_id = ws.id
      WHERE ws.session_date >= $1 AND ws.user_id = $2
      GROUP BY ws.session_date ORDER BY ws.session_date
    `, [weekAgo, userId]);

    const { rows: cardioByDay } = await pool.query(`
      SELECT session_date::TEXT AS date,
             COALESCE(SUM(distance_km),0)::NUMERIC AS distance_km
      FROM cardio_sessions
      WHERE session_date >= $1 AND user_id = $2
      GROUP BY session_date ORDER BY session_date
    `, [weekAgo, userId]);

    const { rows: weightTrend } = await pool.query(`
      SELECT measurement_date::TEXT AS date, weight_lbs
      FROM body_metrics
      WHERE weight_lbs IS NOT NULL AND user_id=$1 AND measurement_date >= $2
      ORDER BY measurement_date
    `, [userId, monthAgo]);

    res.json({
      summary: {
        workouts:  workouts.rows[0],
        cardio:    cardio.rows[0],
        weight:    weight.rows[0] || null,
        nutrition: nutrition.rows[0],
      },
      charts: { volume_by_day: volumeByDay, cardio_by_day: cardioByDay, weight_trend: weightTrend },
      recent_activity: recentActivity.rows,
    });
  } catch (err) { next(err); }
});

router.get('/prs', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM v_exercise_prs WHERE gym_name IS NOT NULL OR equipment_name IS NOT NULL ORDER BY exercise_name'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

export default router;
