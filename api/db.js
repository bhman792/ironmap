// ============================================================
//  db.js — PostgreSQL connection pool
// ============================================================

import pg from 'pg';
const { Pool } = pg;

export const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'fittrack',
  user:     process.env.DB_USER     || 'fittrack',
  password: process.env.DB_PASSWORD || 'changeme',
  max:      10,           // max connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err);
});
