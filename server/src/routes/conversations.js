const express = require('express');
const { z } = require('zod');
const { validateBody } = require('../middleware/validate');
const { notFound, forbidden } = require('../lib/httpErrors');

function findDirectConversation(db, userIdA, userIdB) {
  return db
    .prepare(
      `SELECT c.id FROM conversations c
       JOIN conversation_participants p1 ON p1.conversation_id = c.id AND p1.user_id = ?
       JOIN conversation_participants p2 ON p2.conversation_id = c.id AND p2.user_id = ?
       WHERE (SELECT COUNT(*) FROM conversation_participants WHERE conversation_id = c.id) = 2
       LIMIT 1`
    )
    .get(userIdA, userIdB);
}

function createOrGetDirectConversation(db, userIdA, userIdB) {
  const existing = findDirectConversation(db, userIdA, userIdB);
  if (existing) return existing.id;
  const tx = db.transaction(() => {
    const info = db.prepare(`INSERT INTO conversations DEFAULT VALUES`).run();
    const cid = info.lastInsertRowid;
    db.prepare(`INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)`).run(cid, userIdA);
    db.prepare(`INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)`).run(cid, userIdB);
    return cid;
  });
  return tx();
}

const createDmSchema = z.object({
  peerUserId: z.number().int().positive(),
});

function createConversationsRouter({ db, authJwt }) {
  const router = express.Router();
  router.use(authJwt);

  router.get('/', (req, res) => {
    const rows = db
      .prepare(
        `SELECT 
           c.id AS conversationId,
           other.id AS peerId,
           other.display_name AS peerDisplayName,
           other.avatar_url AS peerAvatarUrl,
           other.last_seen_at AS peerLastSeenAt,
           lm.body AS lastMessagePreview,
           lm.created_at AS lastMessageAt,
           cp_me.last_read_message_id AS myLastReadMessageId,
           cp_other.last_read_message_id AS peerLastReadMessageId
         FROM conversations c
         JOIN conversation_participants cp_me ON cp_me.conversation_id = c.id AND cp_me.user_id = ?
         JOIN conversation_participants cp_other ON cp_other.conversation_id = c.id AND cp_other.user_id != ?
         JOIN users other ON other.id = cp_other.user_id
         LEFT JOIN messages lm ON lm.id = (
           SELECT id FROM messages 
           WHERE conversation_id = c.id AND deleted_at IS NULL 
           ORDER BY id DESC LIMIT 1
         )
         WHERE (
           SELECT COUNT(*) FROM conversation_participants WHERE conversation_id = c.id
         ) = 2
         ORDER BY COALESCE(lm.created_at, c.created_at) DESC`
      )
      .all(req.user.id, req.user.id);

    res.json({ conversations: rows });
  });

  router.post('/', validateBody(createDmSchema), (req, res) => {
    const peerUserId = req.body.peerUserId;
    if (peerUserId === req.user.id) {
      return res.status(400).json({ error: 'Cannot message yourself' });
    }
    const peer = db.prepare(`SELECT id FROM users WHERE id = ?`).get(peerUserId);
    if (!peer) return notFound(res, 'User not found');
    const conversationId = createOrGetDirectConversation(db, req.user.id, peerUserId);
    res.status(201).json({ conversationId, peerUserId });
  });

  router.get('/:conversationId/participants', (req, res) => {
    const conversationId = Number(req.params.conversationId);
    const ok = db
      .prepare(`SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?`)
      .get(conversationId, req.user.id);
    if (!ok) return forbidden(res);
    const rows = db
      .prepare(
        `SELECT u.id, u.display_name, u.avatar_url, u.last_seen_at,
                cp.last_read_message_id AS lastReadMessageId
         FROM conversation_participants cp
         JOIN users u ON u.id = cp.user_id
         WHERE cp.conversation_id = ?
         ORDER BY u.display_name COLLATE NOCASE`
      )
      .all(conversationId);
    res.json({ participants: rows });
  });

  return router;
}

module.exports = {
  createConversationsRouter,
  findDirectConversation,
  createOrGetDirectConversation,
};
