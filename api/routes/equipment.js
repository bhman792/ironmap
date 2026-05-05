// ============================================================
//  routes/equipment.js — Phase 2: Equipment database
//
//  GET    /api/equipment/library          — search global library
//  POST   /api/equipment/library          — add to global library
//  GET    /api/equipment/gym/:gymId       — equipment at a gym
//  POST   /api/equipment/gym/:gymId       — add equipment to gym
//  PUT    /api/equipment/gym/:gymId/:id   — update gym equipment
//  DELETE /api/equipment/gym/:gymId/:id   — remove from gym
//  POST   /api/equipment/oos/:id          — report out of service
//  POST   /api/equipment/flag/:type/:id   — flag inappropriate content
//  GET    /api/equipment/types            — equipment types list
//  GET    /api/equipment/categories       — equipment categories list
// ============================================================

import { Router } from 'express';
import { pool }   from '../db.js';

const router = Router();

// ── Profanity filter ──────────────────────────────────────────
const BAD_WORDS = [
  'fuck','shit','ass','bitch','dick','cock','pussy','cunt','bastard',
  'asshole','bullshit','damn','crap','piss','whore','slut','nigger',
  'faggot','retard','nazi','hitler'
];

function containsProfanity(text) {
  if (!text) return false;
  const lower = text.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  return BAD_WORDS.some(w => lower.split(/\s+/).includes(w) || lower.includes(w));
}

function checkText(...fields) {
  return fields.filter(Boolean).some(containsProfanity);
}

// ── Equipment types & categories ─────────────────────────────
router.get('/types', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM equipment_types ORDER BY name');
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/categories', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM equipment_categories ORDER BY name');
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Global equipment library ──────────────────────────────────
router.get('/library', async (req, res, next) => {
  try {
    const { q, type, category } = req.query;
    let sql = 'SELECT * FROM v_equipment_library WHERE 1=1';
    const params = [];
    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (LOWER(name) LIKE LOWER($${params.length}) OR LOWER(brand) LIKE LOWER($${params.length}))`;
    }
    if (type)     { params.push(type);     sql += ` AND type = $${params.length}`; }
    if (category) { params.push(category); sql += ` AND category = $${params.length}`; }
    sql += ' ORDER BY gym_count DESC, name LIMIT 50';
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/library', async (req, res, next) => {
  try {
    const { name, brand, type, category } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (checkText(name, brand, category)) {
      return res.status(400).json({ error: 'Content flagged — please review your entry.' });
    }
    const { rows: [eq] } = await pool.query(`
      INSERT INTO equipment_library (name, brand, type, category)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (name, brand) DO NOTHING
      RETURNING *
    `, [name.trim(), brand?.trim() || null, type || 'other', category || 'Other']);
    if (!eq) return res.status(409).json({ error: 'Equipment already exists in library' });
    res.status(201).json(eq);
  } catch (err) { next(err); }
});

// ── Gym equipment list ────────────────────────────────────────
router.get('/gym/:gymId', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM v_gym_equipment WHERE gym_id = $1',
      [req.params.gymId]
    );
    // Auto-clear expired OOS flags
    const expired = rows.filter(r => r.is_out_of_service && r.oos_auto_clear_at && new Date(r.oos_auto_clear_at) < new Date());
    if (expired.length) {
      await pool.query(
        `UPDATE gym_equipment SET is_out_of_service=FALSE, oos_reported_at=NULL, oos_auto_clear_at=NULL
         WHERE id = ANY($1)`,
        [expired.map(r => r.id)]
      );
    }
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/gym/:gymId', async (req, res, next) => {
  try {
    const { equipment_id, condition, weight_min_lbs, weight_max_lbs, notes } = req.body;
    if (!equipment_id) return res.status(400).json({ error: 'equipment_id is required' });
    if (checkText(notes)) {
      return res.status(400).json({ error: 'Content flagged — please review your notes.' });
    }
    const { rows: [ge] } = await pool.query(`
      INSERT INTO gym_equipment (gym_id, equipment_id, condition, weight_min_lbs, weight_max_lbs, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (gym_id, equipment_id) DO NOTHING
      RETURNING *
    `, [req.params.gymId, equipment_id, condition || 'good',
        weight_min_lbs || null, weight_max_lbs || null, notes?.trim() || null]);
    if (!ge) return res.status(409).json({ error: 'Equipment already added to this gym' });
    res.status(201).json(ge);
  } catch (err) { next(err); }
});

router.put('/gym/:gymId/:id', async (req, res, next) => {
  try {
    const { condition, weight_min_lbs, weight_max_lbs, notes } = req.body;
    if (checkText(notes)) {
      return res.status(400).json({ error: 'Content flagged — please review your notes.' });
    }
    const { rows: [ge] } = await pool.query(`
      UPDATE gym_equipment SET
        condition=$1, weight_min_lbs=$2, weight_max_lbs=$3, notes=$4, updated_at=NOW()
      WHERE id=$5 AND gym_id=$6 RETURNING *
    `, [condition||'good', weight_min_lbs||null, weight_max_lbs||null,
        notes?.trim()||null, req.params.id, req.params.gymId]);
    if (!ge) return res.status(404).json({ error: 'Not found' });
    res.json(ge);
  } catch (err) { next(err); }
});

router.delete('/gym/:gymId/:id', async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    await pool.query('DELETE FROM gym_equipment WHERE id=$1 AND gym_id=$2', [req.params.id, req.params.gymId]);
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Report out of service ─────────────────────────────────────
router.post('/oos/:id', async (req, res, next) => {
  try {
    const { notes } = req.body;
    const clearAt = new Date();
    clearAt.setDate(clearAt.getDate() + 30);

    // Record the report
    await pool.query(`
      INSERT INTO equipment_oos_reports (gym_equipment_id, notes)
      VALUES ($1, $2)
    `, [req.params.id, notes?.trim() || null]);

    // Mark the equipment as OOS
    const { rows: [ge] } = await pool.query(`
      UPDATE gym_equipment SET
        is_out_of_service = TRUE,
        condition = 'out_of_service',
        oos_reported_at = NOW(),
        oos_auto_clear_at = $1,
        updated_at = NOW()
      WHERE id = $2 RETURNING *
    `, [clearAt.toISOString(), req.params.id]);

    if (!ge) return res.status(404).json({ error: 'Equipment not found' });
    res.json({ ok: true, auto_clears_at: clearAt });
  } catch (err) { next(err); }
});

// ── Resolve OOS (mark as fixed) ───────────────────────────────
router.post('/oos/:id/resolve', async (req, res, next) => {
  try {
    await pool.query(`
      UPDATE gym_equipment SET
        is_out_of_service = FALSE,
        condition = 'good',
        oos_reported_at = NULL,
        oos_auto_clear_at = NULL,
        updated_at = NOW()
      WHERE id = $1
    `, [req.params.id]);
    await pool.query(`
      UPDATE equipment_oos_reports SET resolved_at = NOW()
      WHERE gym_equipment_id = $1 AND resolved_at IS NULL
    `, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Flag inappropriate content ────────────────────────────────
router.post('/flag/:type/:id', async (req, res, next) => {
  try {
    const { type, id } = req.params;
    const { reason } = req.body;
    if (!['library','gym_equipment'].includes(type)) {
      return res.status(400).json({ error: 'Invalid target type' });
    }
    await pool.query(`
      INSERT INTO equipment_flags (target_type, target_id, reason)
      VALUES ($1, $2, $3)
    `, [type, id, reason?.trim() || null]);

    // Increment flag count
    const table = type === 'library' ? 'equipment_library' : 'gym_equipment';
    await pool.query(`UPDATE ${table} SET flag_count = flag_count + 1 WHERE id = $1`, [id]);

    // Auto-hide if 3+ flags
    await pool.query(`UPDATE ${table} SET is_flagged = TRUE WHERE id = $1 AND flag_count >= 3`, [id]);

    res.json({ ok: true, message: 'Thank you for reporting. We will review this entry.' });
  } catch (err) { next(err); }
});

export default router;
