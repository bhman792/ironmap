// ============================================================
//  routes/nutrition.js — user-aware
// ============================================================
import { Router } from 'express';
import { pool }   from '../db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { date } = req.query;
    let sql = 'SELECT * FROM nutrition_log WHERE user_id=$1';
    const params = [req.user.id];
    if (date) { params.push(date); sql += ` AND log_date=$${params.length}`; }
    sql += ' ORDER BY log_date DESC, created_at DESC LIMIT 200';
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const entries = Array.isArray(req.body) ? req.body : [req.body];
    const results = [];
    for (const e of entries) {
      const { log_date, meal_type, food_name, calories_kcal, protein_g, carbs_g, fat_g, notes } = e;
      if (!log_date) continue;
      const { rows: [row] } = await pool.query(`
        INSERT INTO nutrition_log (user_id, log_date, meal_type, food_name, calories_kcal, protein_g, carbs_g, fat_g, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
      `, [req.user.id, log_date, meal_name||null, calories||null, protein_g||null, carbs_g||null, fat_g||null, notes||null]);
      results.push(row);
    }
    res.status(201).json(results);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM nutrition_log WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
