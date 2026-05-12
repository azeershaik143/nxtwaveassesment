const express = require('express');
const { z } = require('zod');
const { db } = require('../db');
const { validateBody, validateQuery } = require('../middleware/validate');
const { notFound, forbidden } = require('../lib/httpErrors');

const createRoomSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(48)
    .regex(/^[\w\- ]+$/, 'Letters, numbers, spaces, and hyphens only'),
});

function createRoomsRouter({ authJwt }) {
  const router = express.Router();
  router.use(authJwt);

  router.get('/', (req, res) => {
    const rows = db
      .prepare(
        `SELECT r.id, r.name, r.created_at, rm.joined_at,
                (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) AS member_count
         FROM rooms r
         INNER JOIN room_members rm ON rm.room_id = r.id AND rm.user_id = ?
         ORDER BY r.name COLLATE NOCASE`
      )
      .all(req.user.id);
    res.json({ rooms: rows });
  });

  router.get('/public-catalog', validateQuery(z.object({ q: z.string().optional() })), (req, res) => {
    const q = (req.validatedQuery.q || '').trim();
    let rows;
    if (q) {
      rows = db
        .prepare(
          `SELECT r.id, r.name, r.created_at,
                  (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) AS member_count,
                  EXISTS (SELECT 1 FROM room_members rm WHERE rm.room_id = r.id AND rm.user_id = ?) AS is_member
           FROM rooms r
           WHERE r.name LIKE ?
           ORDER BY r.name COLLATE NOCASE
           LIMIT 50`
        )
        .all(req.user.id, `%${q.replace('%', '\\%')}%`);
    } else {
      rows = db
        .prepare(
          `SELECT r.id, r.name, r.created_at,
                  (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) AS member_count,
                  EXISTS (SELECT 1 FROM room_members rm WHERE rm.room_id = r.id AND rm.user_id = ?) AS is_member
           FROM rooms r
           ORDER BY r.created_at DESC
           LIMIT 50`
        )
        .all(req.user.id);
    }
    res.json({ rooms: rows });
  });

  router.post('/', validateBody(createRoomSchema), (req, res) => {
    const { name } = req.body;
    const trimmed = name.trim();
    try {
      const info = db
        .prepare(`INSERT INTO rooms (name, created_by) VALUES (?, ?)`)
        .run(trimmed, req.user.id);
      const roomId = info.lastInsertRowid;
      db.prepare(`INSERT INTO room_members (room_id, user_id) VALUES (?, ?)`).run(roomId, req.user.id);
      const room = db.prepare(`SELECT * FROM rooms WHERE id = ?`).get(roomId);
      res.status(201).json({ room });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'A room with this name already exists' });
      }
      throw e;
    }
  });

  router.post('/:roomId/join', (req, res) => {
    const roomId = Number(req.params.roomId);
    const room = db.prepare(`SELECT id FROM rooms WHERE id = ?`).get(roomId);
    if (!room) return notFound(res, 'Room not found');
    try {
      db.prepare(`INSERT INTO room_members (room_id, user_id) VALUES (?, ?)`).run(roomId, req.user.id);
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
        return res.json({ ok: true, alreadyMember: true });
      }
      throw e;
    }
    res.status(201).json({ ok: true });
  });

  router.get('/:roomId/members', (req, res) => {
    const roomId = Number(req.params.roomId);
    const member = db
      .prepare(`SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?`)
      .get(roomId, req.user.id);
    if (!member) return forbidden(res, 'You are not a member of this room');
    const rows = db
      .prepare(
        `SELECT u.id, u.display_name, u.avatar_url, u.last_seen_at
         FROM room_members rm
         JOIN users u ON u.id = rm.user_id
         WHERE rm.room_id = ?
         ORDER BY u.display_name COLLATE NOCASE`
      )
      .all(roomId);
    res.json({ members: rows });
  });

  return router;
}

module.exports = { createRoomsRouter };
