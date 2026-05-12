function parseMentions(body, db) {
  const re = /@\{(\d+)\}/g;
  const ids = new Set();
  let m;
  while ((m = re.exec(body)) !== null) ids.add(Number(m[1]));
  const users = [];
  for (const id of ids) {
    const u = db.prepare(`SELECT id FROM users WHERE id = ?`).get(id);
    if (u) users.push(id);
  }
  return users;
}

function insertMentions(db, messageId, mentionedUserIds) {
  const stmt = db.prepare(`INSERT OR IGNORE INTO mentions (message_id, mentioned_user_id) VALUES (?, ?)`);
  for (const uid of mentionedUserIds) stmt.run(messageId, uid);
}

module.exports = { parseMentions, insertMentions };
