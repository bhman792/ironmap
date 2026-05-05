// ============================================================
//  routes/auth.js
//  POST /api/auth/register  — invite-only registration
//  POST /api/auth/login     — returns JWT
//  POST /api/auth/logout    — clears cookie (stateless JWT)
//  GET  /api/auth/me        — current user info
//  POST /api/auth/setup     — first-run admin setup
// ============================================================

import { Router }   from 'express';
import bcrypt        from 'bcryptjs';
import jwt           from 'jsonwebtoken';
import { pool }      from '../db.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';

const router = Router();
const JWT_SECRET  = process.env.JWT_SECRET || 'ironmap-dev-secret-change-in-production';
const JWT_EXPIRES = '30d';

// ── Helpers ───────────────────────────────────────────────────
function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, display_name: user.display_name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function safeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

// ── First-run setup (sets admin password) ─────────────────────
router.post('/setup', async (req, res, next) => {
  try {
    const { email, password, display_name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    // Only works if admin has placeholder password
    const { rows: [admin] } = await pool.query(
      "SELECT * FROM users WHERE role = 'admin' AND password_hash = 'PLACEHOLDER' LIMIT 1"
    );
    if (!admin) return res.status(409).json({ error: 'Setup already complete or no admin account found' });

    const hash = await bcrypt.hash(password, 12);
    const { rows: [updated] } = await pool.query(`
      UPDATE users SET email=$1, password_hash=$2, display_name=$3, updated_at=NOW()
      WHERE id=$4 RETURNING *
    `, [email.toLowerCase().trim(), hash, display_name || 'Admin', admin.id]);

    const token = signToken(updated);
    res.json({ token, user: safeUser(updated), message: 'Admin account created. Welcome to IronMap!' });
  } catch (err) { next(err); }
});

// ── Register (invite code required) ──────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, display_name, invite_code } = req.body;

    if (!email || !password || !invite_code) {
      return res.status(400).json({ error: 'Email, password, and invite code are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Validate invite code
    const { rows: [invite] } = await pool.query(`
      SELECT * FROM invite_codes
      WHERE code = $1
        AND used_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())
    `, [invite_code.trim().toUpperCase()]);

    if (!invite) return res.status(400).json({ error: 'Invalid or expired invite code' });

    // Check email not taken
    const { rows: existing } = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]
    );
    if (existing.length) return res.status(409).json({ error: 'An account with that email already exists' });

    // Create user
    const hash = await bcrypt.hash(password, 12);
    const { rows: [user] } = await pool.query(`
      INSERT INTO users (email, password_hash, display_name, role)
      VALUES ($1, $2, $3, 'member')
      RETURNING *
    `, [email.toLowerCase().trim(), hash, display_name?.trim() || email.split('@')[0]]);

    // Mark invite as used
    await pool.query(`
      UPDATE invite_codes SET used_by=$1, used_at=NOW() WHERE id=$2
    `, [user.id, invite.id]);

    const token = signToken(user);
    res.status(201).json({ token, user: safeUser(user) });
  } catch (err) { next(err); }
});

// ── Login ─────────────────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const { rows: [user] } = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE', [email]
    );

    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    // Skip bcrypt check for placeholder (setup not complete)
    if (user.password_hash === 'PLACEHOLDER') {
      return res.status(401).json({ error: 'Account setup not complete. Please run /api/auth/setup first.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    // Update last login
    await pool.query('UPDATE users SET last_login=NOW() WHERE id=$1', [user.id]);

    const token = signToken(user);
    res.json({ token, user: safeUser(user) });
  } catch (err) { next(err); }
});

// ── Me ────────────────────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const { rows: [user] } = await pool.query(
      'SELECT * FROM users WHERE id=$1', [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(safeUser(user));
  } catch (err) { next(err); }
});

// ── Logout (client-side — just confirms token is valid) ───────
router.post('/logout', authMiddleware, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

// ── Admin: generate invite code ───────────────────────────────
router.post('/invite', authMiddleware, adminOnly, async (req, res, next) => {
  try {
    const { note, expires_days } = req.body;
    const code = generateCode();
    const expiresAt = expires_days
      ? new Date(Date.now() + expires_days * 86400000).toISOString()
      : null;

    const { rows: [invite] } = await pool.query(`
      INSERT INTO invite_codes (code, created_by, expires_at, note)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [code, req.user.id, expiresAt, note || null]);

    res.status(201).json(invite);
  } catch (err) { next(err); }
});

// ── Admin: list invite codes ──────────────────────────────────
router.get('/invites', authMiddleware, adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT ic.*, 
        u.display_name AS used_by_name,
        u.email        AS used_by_email
      FROM invite_codes ic
      LEFT JOIN users u ON u.id = ic.used_by
      ORDER BY ic.created_at DESC
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Admin: list users ─────────────────────────────────────────
router.get('/users', authMiddleware, adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, email, display_name, role, is_active, created_at, last_login
      FROM users ORDER BY created_at
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Admin: deactivate user ────────────────────────────────────
router.put('/users/:id/deactivate', authMiddleware, adminOnly, async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot deactivate your own account' });
    await pool.query('UPDATE users SET is_active=FALSE WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Helper: generate invite code ─────────────────────────────
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing 0/O 1/I
  let code = '';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code; // e.g. ABCD-EFGH-JKLM
}

export default router;
