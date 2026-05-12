function rowToMessage(row) {
  return {
    id: row.id,
    authorId: row.author_id,
    authorDisplayName: row.author_display_name,
    body: row.body,
    roomId: row.room_id,
    conversationId: row.conversation_id,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
  };
}

module.exports = { rowToMessage };
