// ============================================================
//  routes/metrics.js — user-aware
// ============================================================
import { Router } from 'express';
import { pool }   from '../db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '90'), 365);
    const offset = parseInt(req.query.offset || '0');
    const { rows } = await pool.query(`
      SELECT * FROM body_metrics
      WHERE user_id = $3
      ORDER BY measurement_date DESC, measured_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset, req.user.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/latest', async (req, res, next) => {
  try {
    const { rows: [row] } = await pool.query(`
      SELECT * FROM body_metrics
      WHERE user_id = $1 AND weight_lbs IS NOT NULL
      ORDER BY measured_at DESC LIMIT 1
    `, [req.user.id]);
    res.json(row || null);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const {
      measurement_date, weight_lbs, body_fat_pct, muscle_mass_lbs,
      bmi, bone_mass_lbs, body_water_pct, visceral_fat, metabolic_age,
      source, measured_at
    } = req.body;
    const { rows: [row] } = await pool.query(`
      INSERT INTO body_metrics
        (user_id, measurement_date, weight_lbs, body_fat_pct, muscle_mass_lbs,
         bmi, bone_mass_lbs, body_water_pct, visceral_fat, metabolic_age, source, measured_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [req.user.id, measurement_date, weight_lbs||null, body_fat_pct||null,
        muscle_mass_lbs||null, bmi||null, bone_mass_lbs||null, body_water_pct||null,
        visceral_fat||null, metabolic_age||null, source||'manual',
        measured_at || new Date().toISOString()]);
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM body_metrics WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
