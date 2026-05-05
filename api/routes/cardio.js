// ============================================================
//  routes/cardio.js — user-aware
// ============================================================
import { Router } from 'express';
import { pool }   from '../db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '50'), 200);
    const offset = parseInt(req.query.offset || '0');
    const { rows } = await pool.query(`
      SELECT * FROM cardio_sessions
      WHERE user_id = $3
      ORDER BY session_date DESC, created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset, req.user.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { session_date, activity_type, duration_min, distance_km, notes } = req.body;
    if (!session_date) return res.status(400).json({ error: 'session_date is required' });
    const { rows: [row] } = await pool.query(`
      INSERT INTO cardio_sessions (user_id, session_date, activity_type, duration_min, distance_km, notes)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [req.user.id, session_date, activity_type||'Other', duration_min||null, distance_km||null, notes||null]);
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM cardio_sessions WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
