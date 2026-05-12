const express = require('express');
const { z } = require('zod');
const { validateQuery } = require('../middleware/validate');

function createUsersRouter({ db, authJwt }) {
  const router = express.Router();
  router.use(authJwt);

  router.get(
    '/search',
    validateQuery(z.object({ q: z.string().min(1).max(64) })),
    (req, res) => {
      const q = req.validatedQuery.q.trim();
      const like = `%${q.replace('%', '\\%')}%`;
      const rows = db
        .prepare(
          `SELECT id, display_name, avatar_url, last_seen_at, status_message
           FROM users
           WHERE id != ? AND (display_name LIKE ? COLLATE NOCASE OR email LIKE ? COLLATE NOCASE)
           ORDER BY display_name COLLATE NOCASE
           LIMIT 30`
        )
        .all(req.user.id, like, like);
      res.json({ users: rows });
    }
  );

  return router;
}

module.exports = { createUsersRouter };
