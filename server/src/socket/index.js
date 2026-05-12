const jwt = require('jsonwebtoken');
const { parseMentions, insertMentions } = require('../lib/mentions');
const { rowToMessage } = require('../lib/messageDto');

function attachSocketServer(io, { db, jwtSecret }) {
  const socketsByUser = new Map();

  function markOnline(userId) {
    if (!socketsByUser.has(userId)) socketsByUser.set(userId, new Set());
  }

  function addSocket(userId, socketId) {
    markOnline(userId);
    socketsByUser.get(userId).add(socketId);
    io.emit('presence:change', { userId, online: true });
    db.prepare(`UPDATE users SET last_seen_at = datetime('now') WHERE id = ?`).run(userId);
  }

  function removeSocket(userId, socketId) {
    const set = socketsByUser.get(userId);
    if (!set) return;
    set.delete(socketId);
    if (!set.size) {
      socketsByUser.delete(userId);
      db.prepare(`UPDATE users SET last_seen_at = datetime('now') WHERE id = ?`).run(userId);
      io.emit('presence:change', { userId, online: false });
    }
  }

  function isUserOnline(userId) {
    return (socketsByUser.get(userId)?.size ?? 0) > 0;
  }

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Unauthorized'));
      const payload = jwt.verify(token, jwtSecret);
      socket.userId = payload.sub;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    addSocket(userId, socket.id);

    socket.emit('presence:self', { onlineUsers: [...socketsByUser.keys()] });

    socket.on('disconnect', () => {
      removeSocket(userId, socket.id);
    });

    socket.on('room:join', ({ roomId }, cb) => {
      const rid = Number(roomId);
      const ok = db
        .prepare(`SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?`)
        .get(rid, userId);
      if (!ok) return cb?.({ error: 'Forbidden' });
      socket.join(`room:${rid}`);
      socket.to(`room:${rid}`).emit('room:member_joined', { roomId: rid, userId });
      cb?.({ ok: true });
    });

    socket.on('room:leave', ({ roomId }) => {
      const rid = Number(roomId);
      socket.leave(`room:${rid}`);
      socket.to(`room:${rid}`).emit('room:member_left', { roomId: rid, userId });
    });

    socket.on('conversation:join', ({ conversationId }, cb) => {
      const cid = Number(conversationId);
      const ok = db
        .prepare(`SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?`)
        .get(cid, userId);
      if (!ok) return cb?.({ error: 'Forbidden' });
      socket.join(`conv:${cid}`);
      cb?.({ ok: true });
    });

    socket.on('conversation:leave', ({ conversationId }) => {
      socket.leave(`conv:${Number(conversationId)}`);
    });

    socket.on('message:send', (payload, cb) => {
      try {
        const body = String(payload?.body || '').trim();
        const roomId = payload?.roomId != null ? Number(payload.roomId) : null;
        const conversationId = payload?.conversationId != null ? Number(payload.conversationId) : null;
        const hasR = roomId != null && !Number.isNaN(roomId);
        const hasC = conversationId != null && !Number.isNaN(conversationId);
        if (!body || body.length > 16000) return cb?.({ error: 'Invalid body' });
        if (hasR === hasC) return cb?.({ error: 'Specify room or conversation' });

        let insert;
        if (hasR) {
          const member = db
            .prepare(`SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?`)
            .get(roomId, userId);
          if (!member) return cb?.({ error: 'Forbidden' });
          insert = db.prepare(`INSERT INTO messages (author_id, body, room_id) VALUES (?, ?, ?)`);
        } else {
          const member = db
            .prepare(`SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?`)
            .get(conversationId, userId);
          if (!member) return cb?.({ error: 'Forbidden' });
          insert = db.prepare(
            `INSERT INTO messages (author_id, body, conversation_id) VALUES (?, ?, ?)`
          );
        }

        const info = hasR
          ? insert.run(userId, body, roomId)
          : insert.run(userId, body, conversationId);
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
        const message = rowToMessage(row);

        if (hasR) {
          io.to(`room:${roomId}`).emit('message:new', { scope: 'room', message });
        } else {
          io.to(`conv:${conversationId}`).emit('message:new', { scope: 'dm', message });
        }

        for (const uid of mentionedUserIds) {
          if (uid !== userId && isUserOnline(uid)) {
            io.to(`user:${uid}`).emit('mention:notify', {
              message,
              fromUserId: userId,
            });
          }
        }

        cb?.({ ok: true, message, mentionedUserIds });
      } catch (e) {
        console.error(e);
        cb?.({ error: 'Failed to send' });
      }
    });

    socket.on('message:edit', ({ messageId, body }, cb) => {
      try {
        const mid = Number(messageId);
        const text = String(body || '').trim();
        if (!text || text.length > 16000) return cb?.({ error: 'Invalid body' });
        const msg = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(mid);
        if (!msg || msg.deleted_at) return cb?.({ error: 'Not found' });
        if (msg.author_id !== userId) return cb?.({ error: 'Forbidden' });

        if (msg.room_id) {
          const member = db
            .prepare(`SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?`)
            .get(msg.room_id, userId);
          if (!member) return cb?.({ error: 'Forbidden' });
        } else {
          const member = db
            .prepare(`SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?`)
            .get(msg.conversation_id, userId);
          if (!member) return cb?.({ error: 'Forbidden' });
        }

        db.prepare(`UPDATE messages SET body = ?, edited_at = datetime('now') WHERE id = ?`).run(text, mid);
        db.prepare(`DELETE FROM mentions WHERE message_id = ?`).run(mid);
        const mentionedUserIds = parseMentions(text, db);
        if (mentionedUserIds.length) {
          db.transaction(() => insertMentions(db, mid, mentionedUserIds))();
        }

        const row = db
          .prepare(
            `SELECT m.*, u.display_name AS author_display_name
             FROM messages m
             JOIN users u ON u.id = m.author_id
             WHERE m.id = ?`
          )
          .get(mid);
        const message = rowToMessage(row);

        if (msg.room_id) {
          io.to(`room:${msg.room_id}`).emit('message:updated', { scope: 'room', message });
        } else {
          io.to(`conv:${msg.conversation_id}`).emit('message:updated', { scope: 'dm', message });
        }

        cb?.({ ok: true, message, mentionedUserIds });
      } catch (e) {
        console.error(e);
        cb?.({ error: 'Failed' });
      }
    });

    socket.on('message:delete', ({ messageId }, cb) => {
      try {
        const mid = Number(messageId);
        const msg = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(mid);
        if (!msg || msg.deleted_at) return cb?.({ error: 'Not found' });
        if (msg.author_id !== userId) return cb?.({ error: 'Forbidden' });

        if (msg.room_id) {
          const member = db
            .prepare(`SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?`)
            .get(msg.room_id, userId);
          if (!member) return cb?.({ error: 'Forbidden' });
        } else {
          const member = db
            .prepare(`SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?`)
            .get(msg.conversation_id, userId);
          if (!member) return cb?.({ error: 'Forbidden' });
        }

        db.prepare(`UPDATE messages SET deleted_at = datetime('now'), body = '' WHERE id = ?`).run(mid);

        if (msg.room_id) {
          io.to(`room:${msg.room_id}`).emit('message:deleted', {
            scope: 'room',
            messageId: mid,
            roomId: msg.room_id,
          });
        } else {
          io.to(`conv:${msg.conversation_id}`).emit('message:deleted', {
            scope: 'dm',
            messageId: mid,
            conversationId: msg.conversation_id,
          });
        }

        cb?.({ ok: true });
      } catch (e) {
        console.error(e);
        cb?.({ error: 'Failed' });
      }
    });

    socket.on('typing:start', ({ roomId, conversationId }) => {
      const payload = { userId, typing: true };
      if (roomId != null) {
        socket.to(`room:${Number(roomId)}`).emit('typing:update', { ...payload, roomId });
      }
      if (conversationId != null) {
        socket.to(`conv:${Number(conversationId)}`).emit('typing:update', {
          ...payload,
          conversationId,
        });
      }
    });

    socket.on('typing:stop', ({ roomId, conversationId }) => {
      const payload = { userId, typing: false };
      if (roomId != null) socket.to(`room:${Number(roomId)}`).emit('typing:update', { ...payload, roomId });
      if (conversationId != null) {
        socket.to(`conv:${Number(conversationId)}`).emit('typing:update', {
          ...payload,
          conversationId,
        });
      }
    });

    socket.on('read:update', ({ conversationId, lastReadMessageId }) => {
      const cid = Number(conversationId);
      const lid = Number(lastReadMessageId);
      if (!cid || !lid) return;
      const ok = db
        .prepare(`SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?`)
        .get(cid, userId);
      if (!ok) return;

      const msg = db
        .prepare(`SELECT id FROM messages WHERE id = ? AND conversation_id = ? AND deleted_at IS NULL`)
        .get(lid, cid);
      if (!msg) return;

      const cur = db
        .prepare(`SELECT last_read_message_id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?`)
        .get(cid, userId);
      const prev = cur?.last_read_message_id ?? 0;
      if (lid <= prev) return;

      db.prepare(
        `UPDATE conversation_participants SET last_read_message_id = ?, last_read_at = datetime('now')
         WHERE conversation_id = ? AND user_id = ?`
      ).run(lid, cid, userId);

      socket.to(`conv:${cid}`).emit('receipt:update', {
        conversationId: cid,
        readerUserId: userId,
        lastReadMessageId: lid,
      });
    });

    socket.join(`user:${userId}`);
  });

  return { socketsByUser, isUserOnline };
}

module.exports = { attachSocketServer };
