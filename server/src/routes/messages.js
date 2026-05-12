const express = require('express');
const { z } = require('zod');
const { validateQuery, validateBody } = require('../middleware/validate');
const { notFound, forbidden } = require('../lib/httpErrors');
const { parseMentions, insertMentions } = require('../lib/mentions');
const { rowToMessage } = require('../lib/messageDto');

const listSchema = z.object({
  roomId: z.coerce.number().int().positive().optional(),
  conversationId: z.coerce.number().int().positive().optional(),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const createSchema = z.object({
  body: z.string().min(1).max(16000),
  roomId: z.number().int().positive().optional(),
  conversationId: z.number().int().positive().optional(),
});

const patchSchema = z.object({
  body: z.string().min(1).max(16000),
});

function assertExclusiveTarget(roomId, conversationId) {
  const hasR = roomId != null;
  const hasC = conversationId != null;
  if (hasR === hasC) return 'Specify exactly one of roomId or conversationId';
  return null;
}

function createMessagesRouter({ db, authJwt }) {
  const router = express.Router();
  router.use(authJwt);

  router.get('/', validateQuery(listSchema), (req, res) => {
    const { roomId, conversationId, before, limit = 40 } = req.validatedQuery;
    const err = assertExclusiveTarget(roomId, conversationId);
    if (err) return res.status(400).json({ error: err });

    if (roomId) {
      const member = db
        .prepare(`SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?`)
        .get(roomId, req.user.id);
      if (!member) return forbidden(res);
    } else {
      const member = db
        .prepare(`SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?`)
        .get(conversationId, req.user.id);
      if (!member) return forbidden(res);
    }

    const lim = limit;
    const rows = roomId
      ? db
          .prepare(
            `SELECT m.*, u.display_name AS author_display_name
             FROM messages m
             JOIN users u ON u.id = m.author_id
             WHERE m.room_id = ? AND m.deleted_at IS NULL AND (? IS NULL OR m.id < ?)
             ORDER BY m.id DESC
             LIMIT ?`
          )
          .all(roomId, before ?? null, before ?? null, lim)
      : db
          .prepare(
            `SELECT m.*, u.display_name AS author_display_name
             FROM messages m
             JOIN users u ON u.id = m.author_id
             WHERE m.conversation_id = ? AND m.deleted_at IS NULL AND (? IS NULL OR m.id < ?)
             ORDER BY m.id DESC
             LIMIT ?`
          )
          .all(conversationId, before ?? null, before ?? null, lim);

    const chronological = rows.reverse().map(rowToMessage);
    res.json({ messages: chronological });
  });

  router.post('/', express.json(), validateBody(createSchema), (req, res) => {
    const { body, roomId, conversationId } = req.body;
    const err = assertExclusiveTarget(roomId, conversationId);
    if (err) return res.status(400).json({ error: err });

    let insert;
    if (roomId) {
      const member = db
        .prepare(`SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?`)
        .get(roomId, req.user.id);
      if (!member) return forbidden(res);
      insert = db.prepare(
        `INSERT INTO messages (author_id, body, room_id) VALUES (?, ?, ?)`
      );
    } else {
      const member = db
        .prepare(`SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?`)
        .get(conversationId, req.user.id);
      if (!member) return forbidden(res);
      insert = db.prepare(
        `INSERT INTO messages (author_id, body, conversation_id) VALUES (?, ?, ?)`
      );
    }

    const info = roomId
      ? insert.run(req.user.id, body, roomId)
      : insert.run(req.user.id, body, conversationId);

    const messageId = info.lastInsertRowid;
    const mentionedUserIds = parseMentions(body, db);
    if (mentionedUserIds.length) {
      db.transaction(() => insertMentions(db, messageId, mentionedUserIds))();
    }

    const row = db
      .prepare(
        `SELECT m.*, u.display_name AS author_display_name
         FROM messages m
         JOIN users u ON u.id = m.author_id
         WHERE m.id = ?`
      )
      .get(messageId);

    res.status(201).json({ message: rowToMessage(row), mentionedUserIds });
  });

  router.patch('/:messageId', express.json(), validateBody(patchSchema), (req, res) => {
    const messageId = Number(req.params.messageId);
    const msg = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(messageId);
    if (!msg || msg.deleted_at) return notFound(res, 'Message not found');
    if (msg.author_id !== req.user.id) return forbidden(res);

    if (msg.room_id) {
      const member = db
        .prepare(`SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?`)
        .get(msg.room_id, req.user.id);
      if (!member) return forbidden(res);
    } else {
      const member = db
        .prepare(`SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?`)
        .get(msg.conversation_id, req.user.id);
      if (!member) return forbidden(res);
    }

    db.prepare(
      `UPDATE messages SET body = ?, edited_at = datetime('now') WHERE id = ?`
    ).run(req.body.body, messageId);

    db.prepare(`DELETE FROM mentions WHERE message_id = ?`).run(messageId);
    const mentionedUserIds = parseMentions(req.body.body, db);
    if (mentionedUserIds.length) {
      db.transaction(() => insertMentions(db, messageId, mentionedUserIds))();
    }

    const row = db
      .prepare(
        `SELECT m.*, u.display_name AS author_display_name
         FROM messages m
         JOIN users u ON u.id = m.author_id
         WHERE m.id = ?`
      )
      .get(messageId);
    res.json({ message: rowToMessage(row), mentionedUserIds });
  });

  router.delete('/:messageId', (req, res) => {
    const messageId = Number(req.params.messageId);
    const msg = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(messageId);
    if (!msg || msg.deleted_at) return notFound(res, 'Message not found');
    if (msg.author_id !== req.user.id) return forbidden(res);

    if (msg.room_id) {
      const member = db
        .prepare(`SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?`)
        .get(msg.room_id, req.user.id);
      if (!member) return forbidden(res);
    } else {
      const member = db
        .prepare(`SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?`)
        .get(msg.conversation_id, req.user.id);
      if (!member) return forbidden(res);
    }

    db.prepare(`UPDATE messages SET deleted_at = datetime('now'), body = '' WHERE id = ?`).run(messageId);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createMessagesRouter };
