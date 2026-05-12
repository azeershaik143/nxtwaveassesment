const express = require('express');
const { z } = require('zod');
const { hashPassword, verifyPassword, signToken } = require('../lib/auth');
const { db } = require('../db');
const { validationError, serverError } = require('../lib/httpErrors');
const { validateBody } = require('../middleware/validate');

const registerSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
  displayName: z.string().min(2).max(64).trim(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function mapPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    statusMessage: row.status_message || '',
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
  };
}

function createAuthRouter({ jwtSecret, jwtExpiresIn }) {
  const router = express.Router();

  router.post('/register', validateBody(registerSchema), async (req, res) => {
    try {
      const { email, password, displayName } = req.body;
      const existing = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(email);
      if (existing) {
        return res.status(409).json({ error: 'Email already registered' });
      }
      const password_hash = await hashPassword(password);
      const info = db
        .prepare(
          `INSERT INTO users (email, password_hash, display_name)
           VALUES (?, ?, ?)`
        )
        .run(email, password_hash, displayName);

      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
      const token = signToken({ sub: user.id, email: user.email }, jwtSecret, jwtExpiresIn);
      return res.status(201).json({ token, user: mapPublicUser(user) });
    } catch (err) {
      return serverError(res, err, true);
    }
  });

  router.post('/login', validateBody(loginSchema), async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email);
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      db.prepare(`UPDATE users SET last_seen_at = datetime('now') WHERE id = ?`).run(user.id);
      const token = signToken({ sub: user.id, email: user.email }, jwtSecret, jwtExpiresIn);
      return res.json({ token, user: mapPublicUser(user) });
    } catch (err) {
      return serverError(res, err, true);
    }
  });

  return router;
}

module.exports = { createAuthRouter, mapPublicUser };
