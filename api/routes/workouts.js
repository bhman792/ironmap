// ============================================================
//  routes/workouts.js — user-aware
// ============================================================

import { Router } from 'express';
import { pool }   from '../db.js';

const router = Router();

// ── Last performance for a named exercise ─────────────────────
router.get('/exercise-history/:name', async (req, res, next) => {
  try {
    const name    = decodeURIComponent(req.params.name);
    const equipId = req.query.equipment_id || null;
    const userId  = req.user.id;

    const { rows } = await pool.query(`
      SELECT ws.session_date, ws.name AS workout_name,
        wst.set_number, wst.reps, wst.weight_lbs, wst.rpe, wst.gym_equipment_id,
        el.name AS equipment_name, el.brand AS equipment_brand, g.name AS gym_name
      FROM workout_sets wst
      JOIN workout_sessions ws ON ws.id = wst.session_id
      LEFT JOIN gym_equipment ge ON ge.id = wst.gym_equipment_id
      LEFT JOIN equipment_library el ON el.id = ge.equipment_id
      LEFT JOIN gyms g ON g.id = ge.gym_id
      WHERE LOWER(wst.exercise_name) = LOWER($1)
        AND ws.user_id = $3
        AND ($2::uuid IS NULL OR wst.gym_equipment_id = $2::uuid)
        AND ws.session_date = (
          SELECT MAX(ws2.session_date)
          FROM workout_sets wst2
          JOIN workout_sessions ws2 ON ws2.id = wst2.session_id
          WHERE LOWER(wst2.exercise_name) = LOWER($1)
            AND ws2.user_id = $3
            AND ($2::uuid IS NULL OR wst2.gym_equipment_id = $2::uuid)
        )
      ORDER BY wst.set_number
    `, [name, equipId, userId]);

    if (!rows.length && equipId) {
      return res.redirect(`/api/workouts/exercise-history/${encodeURIComponent(req.params.name)}`);
    }
    if (!rows.length) return res.json(null);

    res.json({
      session_date:    rows[0].session_date,
      workout_name:    rows[0].workout_name,
      equipment_name:  rows[0].equipment_name,
      equipment_brand: rows[0].equipment_brand,
      gym_name:        rows[0].gym_name,
      sets: rows.map(r => ({ set_number: r.set_number, reps: r.reps, weight_lbs: r.weight_lbs, rpe: r.rpe }))
    });
  } catch (err) { next(err); }
});

// ── Personal records ──────────────────────────────────────────
router.get('/prs', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        wst.exercise_name,
        el.name        AS equipment_name,
        el.brand       AS equipment_brand,
        el.type        AS equipment_type,
        g.name         AS gym_name,
        MAX(wst.weight_lbs)                                          AS max_weight_lbs,
        MAX(CASE WHEN wst.reps IS NOT NULL
                 THEN wst.weight_lbs * (1 + 0.0333 * wst.reps::NUMERIC)
            END)::NUMERIC(8,2)                                       AS estimated_1rm,
        (SELECT wst2.reps FROM workout_sets wst2
         JOIN workout_sessions ws2 ON ws2.id = wst2.session_id
         WHERE LOWER(wst2.exercise_name) = LOWER(wst.exercise_name)
           AND ws2.user_id = $1
           AND wst2.weight_lbs = MAX(wst.weight_lbs)
         ORDER BY ws2.session_date DESC LIMIT 1)                     AS reps_at_max,
        COUNT(DISTINCT ws.session_date)::INT                         AS session_count,
        COUNT(wst.id)::INT                                           AS total_sets,
        MAX(ws.session_date)::TEXT                                   AS last_performed,
        MIN(ws.session_date)::TEXT                                   AS first_performed
      FROM workout_sets wst
      JOIN workout_sessions ws ON ws.id = wst.session_id
      LEFT JOIN gym_equipment ge ON ge.id = wst.gym_equipment_id
      LEFT JOIN equipment_library el ON el.id = ge.equipment_id
      LEFT JOIN gyms g ON g.id = ge.gym_id
      WHERE ws.user_id = $1
        AND wst.weight_lbs IS NOT NULL
        AND wst.weight_lbs > 0
      GROUP BY wst.exercise_name, el.name, el.brand, el.type, g.name
      ORDER BY MAX(wst.weight_lbs) DESC
    `, [req.user.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

// ── List sessions ─────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '50'), 200);
    const offset = parseInt(req.query.offset || '0');
    const { rows } = await pool.query(`
      SELECT ws.id, ws.session_date, ws.name, ws.duration_min, ws.notes, ws.created_at,
        ws.gym_id, g.name AS gym_name,
        COUNT(DISTINCT wst.exercise_name)::INT AS exercise_count
      FROM workout_sessions ws
      LEFT JOIN gyms g ON g.id = ws.gym_id
      LEFT JOIN workout_sets wst ON wst.session_id = ws.id
      WHERE ws.user_id = $3
      GROUP BY ws.id, g.name
      ORDER BY ws.session_date DESC, ws.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset, req.user.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Single session ────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const { rows: [session] } = await pool.query(
      'SELECT * FROM workout_sessions WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const { rows: sets } = await pool.query(`
      SELECT exercise_name, set_number, reps, weight_lbs, rpe, notes
      FROM workout_sets WHERE session_id=$1 ORDER BY exercise_name, set_number
    `, [req.params.id]);

    const exerciseMap = {};
    sets.forEach(s => {
      if (!exerciseMap[s.exercise_name]) exerciseMap[s.exercise_name] = [];
      exerciseMap[s.exercise_name].push({ reps: s.reps, weight_lbs: s.weight_lbs, rpe: s.rpe, notes: s.notes });
    });
    const exercises = Object.entries(exerciseMap).map(([name, sets]) => ({ name, sets }));
    res.json({ ...session, exercises });
  } catch (err) { next(err); }
});

// ── Create session ────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { date, name, duration_min, notes, exercises = [], gym_id } = req.body;
    if (!date || !name) return res.status(400).json({ error: 'date and name are required' });

    await client.query('BEGIN');
    const { rows: [session] } = await client.query(`
      INSERT INTO workout_sessions (session_date, name, duration_min, notes, gym_id, user_id)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [date, name, duration_min || null, notes || null, gym_id || null, req.user.id]);

    const sets = [];
    for (const ex of exercises) {
      for (let i = 0; i < (ex.sets || []).length; i++) {
        const s = ex.sets[i];
        const { rows: [set] } = await client.query(`
          INSERT INTO workout_sets
            (session_id, exercise_name, set_number, reps, weight_lbs, rpe, notes, gym_equipment_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
        `, [session.id, ex.name, i+1, s.reps||null, s.weight_lbs||null, s.rpe||null, s.notes||null, ex.gym_equipment_id||null]);
        sets.push(set);
      }
    }
    await client.query('COMMIT');
    res.status(201).json({ ...session, sets });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

// ── Update session ────────────────────────────────────────────
router.put('/:id', async (req, res, next) => {
  try {
    const { name, duration_min, notes } = req.body;
    const { rows: [session] } = await pool.query(`
      UPDATE workout_sessions SET
        name=COALESCE($1,name), duration_min=COALESCE($2,duration_min), notes=COALESCE($3,notes)
      WHERE id=$4 AND user_id=$5 RETURNING *
    `, [name, duration_min, notes, req.params.id, req.user.id]);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (err) { next(err); }
});

// ── Delete session ────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM workout_sessions WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Session not found' });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
