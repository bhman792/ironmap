// ============================================================
//  IronMap API — server.js
// ============================================================

import express        from 'express';
import cors           from 'cors';
import helmet         from 'helmet';
import morgan         from 'morgan';
import { exec }       from 'child_process';
import { pool }       from './db.js';
import { authMiddleware } from './middleware/auth.js';

import authRouter      from './routes/auth.js';
import workoutsRouter  from './routes/workouts.js';
import cardioRouter    from './routes/cardio.js';
import metricsRouter   from './routes/metrics.js';
import nutritionRouter from './routes/nutrition.js';
import dashboardRouter from './routes/dashboard.js';
import gymsRouter      from './routes/gyms.js';
import settingsRouter  from './routes/settings.js';
import equipmentRouter from './routes/equipment.js';

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(morgan('dev'));

// ── Public routes (no auth) ───────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', ts: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'unreachable', error: err.message });
  }
});

// ── Public waitlist signup ────────────────────────────────────
app.post('/api/waitlist', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    await pool.query(`
      INSERT INTO waitlist (email)
      VALUES ($1)
      ON CONFLICT (email) DO NOTHING
    `, [email.toLowerCase().trim()]);
    res.json({ ok: true, message: "You're on the list! We'll send your invite code soon." });
  } catch (err) {
    res.status(500).json({ error: 'Could not save email' });
  }
});

// ── Admin: view waitlist ──────────────────────────────────────
app.get('/api/waitlist', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { rows } = await pool.query('SELECT * FROM waitlist ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch waitlist' });
  }
});

// ── Admin: activity report ────────────────────────────────────
app.get('/api/admin/stats', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const [users, waitlist, gyms, equipment] = await Promise.all([
      pool.query(`
        SELECT
          u.id, u.email, u.display_name, u.role, u.is_active,
          u.created_at, u.last_login,
          COUNT(DISTINCT ws.id)::INT      AS workout_count,
          COUNT(DISTINCT cs.id)::INT      AS cardio_count,
          COUNT(DISTINCT bm.id)::INT      AS metric_count,
          MAX(ws.session_date)::TEXT       AS last_workout,
          MAX(cs.session_date)::TEXT       AS last_cardio
        FROM users u
        LEFT JOIN workout_sessions ws ON ws.user_id = u.id
        LEFT JOIN cardio_sessions   cs ON cs.user_id = u.id
        LEFT JOIN body_metrics      bm ON bm.user_id = u.id
        GROUP BY u.id
        ORDER BY u.created_at
      `),
      pool.query(`SELECT COUNT(*)::INT AS total, COUNT(invited_at)::INT AS invited FROM waitlist`),
      pool.query(`SELECT COUNT(*)::INT AS total FROM gyms`),
      pool.query(`SELECT COUNT(*)::INT AS total FROM gym_equipment`),
    ]);

    res.json({
      users:     users.rows,
      waitlist:  waitlist.rows[0],
      gyms:      gyms.rows[0].total,
      equipment: equipment.rows[0].total,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auth routes — public
app.use('/api/auth', authRouter);

// ── Protected routes (JWT required) ──────────────────────────
app.use('/api/workouts',  authMiddleware, workoutsRouter);
app.use('/api/cardio',    authMiddleware, cardioRouter);
app.use('/api/metrics',   authMiddleware, metricsRouter);
app.use('/api/nutrition', authMiddleware, nutritionRouter);
app.use('/api/dashboard', authMiddleware, dashboardRouter);
app.use('/api/settings',  authMiddleware, settingsRouter);

// Renpho sync — admin only in future, auth for now
app.use('/api/sync',      authMiddleware, (req, res, next) => next());

// Gyms and equipment — auth required to modify, public to read
app.use('/api/gyms',      gymsRouter);
app.use('/api/equipment', equipmentRouter);

// ── Renpho manual sync ────────────────────────────────────────
let syncRunning = false;
app.post('/api/sync/renpho', authMiddleware, (req, res) => {
  if (syncRunning) return res.status(409).json({ error: 'Sync already in progress' });
  syncRunning = true;
  res.json({ status: 'started', message: 'Sync started — check metrics in a few seconds.' });
  exec('docker exec fittrack-renpho python /app/sync.py', { timeout: 120000 }, (err, stdout, stderr) => {
    syncRunning = false;
    if (err) console.error('Renpho sync error:', err.message);
    else console.log('Renpho sync complete:', stdout.trim());
  });
});

// ── 404 ──────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => console.log(`IronMap API running on port ${PORT}`));
