const express = require('express');
const { mapPublicUser } = require('./auth');

function createMeRouter({ db, authJwt }) {
  const router = express.Router();

  router.use(authJwt);

  router.get('/', (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: mapPublicUser(user) });
  });

  router.patch('/', express.json(), (req, res) => {
    const { statusMessage, displayName, avatarUrl } = req.body || {};
    const updates = [];
    const values = [];
    if (typeof statusMessage === 'string' && statusMessage.length <= 200) {
      updates.push('status_message = ?');
      values.push(statusMessage);
    }
    if (typeof displayName === 'string' && displayName.trim().length >= 2 && displayName.length <= 64) {
      updates.push('display_name = ?');
      values.push(displayName.trim());
    }
    if (typeof avatarUrl === 'string' && avatarUrl.length <= 500) {
      updates.push('avatar_url = ?');
      values.push(avatarUrl || null);
    }
    if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });
    values.push(req.user.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({ user: mapPublicUser(user) });
  });

  return router;
}

module.exports = { createMeRouter };
