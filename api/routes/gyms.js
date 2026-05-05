// ============================================================
//  routes/gyms.js — Phase 1: Full gym profiles + search
// ============================================================

import { Router } from 'express';
import { pool }   from '../db.js';

const router = Router();

// ── Search gyms ───────────────────────────────────────────────
router.get('/search', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);
    const { rows } = await pool.query(`
      SELECT id, name, address, city, state, zip, gym_type, is_24hr, workout_count
      FROM v_gym_summary
      WHERE LOWER(name) LIKE LOWER($1)
         OR LOWER(city) LIKE LOWER($1)
         OR zip LIKE $2
      ORDER BY workout_count DESC, name
      LIMIT 20
    `, [`%${q}%`, `${q}%`]);
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Gym types ─────────────────────────────────────────────────
router.get('/types', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM gym_types ORDER BY name');
    res.json(rows);
  } catch (err) { next(err); }
});

// ── List all gyms ─────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM v_gym_summary ORDER BY is_default DESC, name');
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Get single gym ────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const { rows: [gym] } = await pool.query(
      'SELECT * FROM v_gym_summary WHERE id = $1', [req.params.id]
    );
    if (!gym) return res.status(404).json({ error: 'Gym not found' });
    res.json(gym);
  } catch (err) { next(err); }
});

// ── Create gym ────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const {
      name, address, city, state, zip, phone, website,
      gym_type, is_24hr, notes, is_default,
      hours_mon, hours_tue, hours_wed, hours_thu,
      hours_fri, hours_sat, hours_sun
    } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { rows: [gym] } = await pool.query(`
      INSERT INTO gyms (
        name, address, city, state, zip, phone, website,
        gym_type, is_24hr, notes, is_default,
        hours_mon, hours_tue, hours_wed, hours_thu,
        hours_fri, hours_sat, hours_sun
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *
    `, [name, address||null, city||null, state||null, zip||null,
        phone||null, website||null, gym_type||'Commercial chain',
        is_24hr||false, notes||null, is_default||false,
        hours_mon||null, hours_tue||null, hours_wed||null, hours_thu||null,
        hours_fri||null, hours_sat||null, hours_sun||null]);
    res.status(201).json(gym);
  } catch (err) { next(err); }
});

// ── Update gym ────────────────────────────────────────────────
router.put('/:id', async (req, res, next) => {
  try {
    const {
      name, address, city, state, zip, phone, website,
      gym_type, is_24hr, notes, is_default,
      hours_mon, hours_tue, hours_wed, hours_thu,
      hours_fri, hours_sat, hours_sun
    } = req.body;
    const { rows: [gym] } = await pool.query(`
      UPDATE gyms SET
        name=$1, address=$2, city=$3, state=$4, zip=$5,
        phone=$6, website=$7, gym_type=$8, is_24hr=$9,
        notes=$10, is_default=$11,
        hours_mon=$12, hours_tue=$13, hours_wed=$14, hours_thu=$15,
        hours_fri=$16, hours_sat=$17, hours_sun=$18,
        updated_at=NOW()
      WHERE id=$19 RETURNING *
    `, [name, address||null, city||null, state||null, zip||null,
        phone||null, website||null, gym_type||'Commercial chain',
        is_24hr||false, notes||null, is_default||false,
        hours_mon||null, hours_tue||null, hours_wed||null, hours_thu||null,
        hours_fri||null, hours_sat||null, hours_sun||null,
        req.params.id]);
    if (!gym) return res.status(404).json({ error: 'Gym not found' });
    res.json(gym);
  } catch (err) { next(err); }
});

// ── Delete gym — admin only ───────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    await pool.query('DELETE FROM gyms WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
