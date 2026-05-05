// ============================================================
//  routes/settings.js
//  Exercises, muscle groups, and cardio types — all DB-backed
//
//  GET    /api/settings/exercises
//  POST   /api/settings/exercises
//  DELETE /api/settings/exercises/:id
//
//  GET    /api/settings/muscles
//  POST   /api/settings/muscles
//  DELETE /api/settings/muscles/:id
//
//  GET    /api/settings/cardio-types
//  POST   /api/settings/cardio-types
//  DELETE /api/settings/cardio-types/:id
// ============================================================

import { Router } from 'express';
import { pool }   from '../db.js';

const router = Router();

// ── User settings (key-value store, per user) ─────────────────
router.get('/user-settings', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT key, value FROM user_settings WHERE user_id=$1', [req.user.id]
    );
    const result = {};
    rows.forEach(r => { try { result[r.key] = JSON.parse(r.value); } catch { result[r.key] = r.value; } });
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/user-settings', async (req, res, next) => {
  try {
    const entries = Object.entries(req.body);
    for (const [key, value] of entries) {
      await pool.query(`
        INSERT INTO user_settings (user_id, key, value)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, key) DO UPDATE SET value=$3, updated_at=NOW()
      `, [req.user.id, key, JSON.stringify(value)]);
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Exercises ─────────────────────────────────────────────────
router.get('/exercises', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT e.id, e.name, e.equipment, e.is_custom, mg.name AS muscle_group
      FROM exercises e
      LEFT JOIN muscle_groups mg ON mg.id = e.muscle_group_id
      ORDER BY e.is_custom, e.name
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/exercises', async (req, res, next) => {
  try {
    const { name, muscle_group, equipment } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    // Find or ignore muscle group
    let muscle_group_id = null;
    if (muscle_group) {
      const { rows } = await pool.query(
        'SELECT id FROM muscle_groups WHERE name = $1', [muscle_group]
      );
      if (rows.length) muscle_group_id = rows[0].id;
    }

    const { rows: [ex] } = await pool.query(`
      INSERT INTO exercises (name, muscle_group_id, equipment, is_custom)
      VALUES ($1, $2, $3, TRUE)
      ON CONFLICT (name) DO NOTHING
      RETURNING *
    `, [name, muscle_group_id, equipment || null]);

    if (!ex) return res.status(409).json({ error: 'Exercise already exists' });
    res.status(201).json(ex);
  } catch (err) { next(err); }
});

router.delete('/exercises/:id', async (req, res, next) => {
  try {
    const { rows: [ex] } = await pool.query(
      'SELECT is_custom FROM exercises WHERE id = $1', [req.params.id]
    );
    if (!ex) return res.status(404).json({ error: 'Not found' });
    if (!ex.is_custom) return res.status(403).json({ error: 'Cannot delete default exercises' });
    await pool.query('DELETE FROM exercises WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Muscle groups ─────────────────────────────────────────────
router.get('/muscles', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM muscle_groups ORDER BY is_custom, name'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/muscles', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { rows: [mg] } = await pool.query(`
      INSERT INTO muscle_groups (name, is_custom)
      VALUES ($1, TRUE)
      ON CONFLICT (name) DO NOTHING
      RETURNING *
    `, [name]);
    if (!mg) return res.status(409).json({ error: 'Muscle group already exists' });
    res.status(201).json(mg);
  } catch (err) { next(err); }
});

router.delete('/muscles/:id', async (req, res, next) => {
  try {
    const { rows: [mg] } = await pool.query(
      'SELECT is_custom FROM muscle_groups WHERE id = $1', [req.params.id]
    );
    if (!mg) return res.status(404).json({ error: 'Not found' });
    if (!mg.is_custom) return res.status(403).json({ error: 'Cannot delete default muscle groups' });
    await pool.query('DELETE FROM muscle_groups WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Cardio types ──────────────────────────────────────────────
router.get('/cardio-types', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM cardio_types ORDER BY is_custom, name'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/cardio-types', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { rows: [ct] } = await pool.query(`
      INSERT INTO cardio_types (name, is_custom)
      VALUES ($1, TRUE)
      ON CONFLICT (name) DO NOTHING
      RETURNING *
    `, [name]);
    if (!ct) return res.status(409).json({ error: 'Activity already exists' });
    res.status(201).json(ct);
  } catch (err) { next(err); }
});

router.delete('/cardio-types/:id', async (req, res, next) => {
  try {
    const { rows: [ct] } = await pool.query(
      'SELECT is_custom FROM cardio_types WHERE id = $1', [req.params.id]
    );
    if (!ct) return res.status(404).json({ error: 'Not found' });
    if (!ct.is_custom) return res.status(403).json({ error: 'Cannot delete default activities' });
    await pool.query('DELETE FROM cardio_types WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
