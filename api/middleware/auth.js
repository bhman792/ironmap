// ============================================================
//  middleware/auth.js
//  JWT verification middleware for IronMap API
// ============================================================

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'ironmap-dev-secret-change-in-production';

// ── Require valid JWT ─────────────────────────────────────────
export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired — please log in again' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ── Require admin role ────────────────────────────────────────
export function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ── Optional auth (attaches user if token present, doesn't fail if not) ──
export function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
  } catch {
    req.user = null;
  }
  next();
}
