import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import CreateRoomModal from '../components/CreateRoomModal.jsx';
import './Dashboard.css';

function formatTime(iso) {
  if (!iso) return '';
  try {
    const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
    const d = new Date(normalized);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function Dashboard() {
  const { token, user, logout } = useAuth();
  const { socket, connected } = useSocket();

  const [myRooms, setMyRooms] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [conversations, setConversations] = useState([]);
  const [peerReadMap, setPeerReadMap] = useState({});

  const [mode, setMode] = useState('room');
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [activeConversationId, setActiveConversationId] = useState(null);

  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [composer, setComposer] = useState('');
  const [typingUsers, setTypingUsers] = useState({});
  const [onlineUsers, setOnlineUsers] = useState(() => new Set());
  const [toast, setToast] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');

  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [busyAction, setBusyAction] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState('');
  const [peopleHits, setPeopleHits] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const typingTimerRef = useRef(null);
  const threadEndRef = useRef(null);

  const activePeer = useMemo(() => {
    if (!activeConversationId) return null;
    return conversations.find((c) => c.conversationId === activeConversationId) || null;
  }, [conversations, activeConversationId]);

  const refreshSidebar = useCallback(async () => {
    const [r, c] = await Promise.all([
      apiFetch('/rooms', {}, token),
      apiFetch('/conversations', {}, token),
    ]);
    setMyRooms(r.rooms || []);
    const convs = c.conversations || [];
    setConversations(convs);
    const map = {};
    for (const row of convs) {
      map[row.conversationId] = row.peerLastReadMessageId ?? null;
    }
    setPeerReadMap(map);
  }, [token]);

  useEffect(() => {
    refreshSidebar().catch(() => {});
  }, [refreshSidebar]);

  useEffect(() => {
    const q = catalogQuery.trim();
    const h = setTimeout(() => {
      apiFetch(`/rooms/public-catalog${q ? `?q=${encodeURIComponent(q)}` : ''}`, {}, token)
        .then((d) => setCatalog(d.rooms || []))
        .catch(() => setCatalog([]));
    }, 220);
    return () => clearTimeout(h);
  }, [catalogQuery, token]);

  useEffect(() => {
    const q = peopleQuery.trim();
    if (q.length < 2) {
      setPeopleHits([]);
      return undefined;
    }
    const h = setTimeout(() => {
      apiFetch(`/users/search?q=${encodeURIComponent(q)}`, {}, token)
        .then((d) => setPeopleHits(d.users || []))
        .catch(() => setPeopleHits([]));
    }, 280);
    return () => clearTimeout(h);
  }, [peopleQuery, token]);

  useEffect(() => {
    if (!socket) return undefined;

    const onPresenceSelf = ({ onlineUsers: ids }) => {
      setOnlineUsers(new Set(ids || []));
    };
    const onPresenceChange = ({ userId, online }) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        if (online) next.add(userId);
        else next.delete(userId);
        return next;
      });
    };

    const onMessageNew = ({ message }) => {
      const matchesRoom =
        mode === 'room' && activeRoomId && message.roomId === activeRoomId && !message.conversationId;
      const matchesDm =
        mode === 'dm' &&
        activeConversationId &&
        message.conversationId === activeConversationId &&
        !message.roomId;
      if (matchesRoom || matchesDm) {
        setMessages((prev) => [...prev, message]);
      }
      refreshSidebar().catch(() => {});
    };

    const onMessageUpdated = ({ message }) => {
      setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
    };

    const onMessageDeleted = ({ messageId }) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    };

    const onTyping = (payload) => {
      const key =
        payload.roomId != null ? `r:${payload.roomId}` : `c:${payload.conversationId}`;
      setTypingUsers((prev) => {
        const next = { ...prev };
        const set = new Set(next[key] || []);
        if (payload.userId === user.id) return prev;
        if (payload.typing) set.add(payload.userId);
        else set.delete(payload.userId);
        next[key] = set;
        return next;
      });
    };

    const onReceipt = ({ conversationId, readerUserId, lastReadMessageId }) => {
      if (readerUserId === user.id) return;
      setPeerReadMap((prev) => ({ ...prev, [conversationId]: lastReadMessageId }));
    };

    const onMention = ({ message, fromUserId }) => {
      if (fromUserId === user.id) return;
      setToast(`You were mentioned in a ${message.roomId ? 'room' : 'conversation'}`);
      setTimeout(() => setToast(null), 4200);
    };

    socket.on('presence:self', onPresenceSelf);
    socket.on('presence:change', onPresenceChange);
    socket.on('message:new', onMessageNew);
    socket.on('message:updated', onMessageUpdated);
    socket.on('message:deleted', onMessageDeleted);
    socket.on('typing:update', onTyping);
    socket.on('receipt:update', onReceipt);
    socket.on('mention:notify', onMention);

    return () => {
      socket.off('presence:self', onPresenceSelf);
      socket.off('presence:change', onPresenceChange);
      socket.off('message:new', onMessageNew);
      socket.off('message:updated', onMessageUpdated);
      socket.off('message:deleted', onMessageDeleted);
      socket.off('typing:update', onTyping);
      socket.off('receipt:update', onReceipt);
      socket.off('mention:notify', onMention);
    };
  }, [socket, mode, activeRoomId, activeConversationId, user.id, refreshSidebar]);

  useEffect(() => {
    if (!socket || !activeRoomId || mode !== 'room') return undefined;
    socket.emit('room:join', { roomId: activeRoomId }, () => {});
    return () => socket.emit('room:leave', { roomId: activeRoomId });
  }, [socket, activeRoomId, mode]);

  useEffect(() => {
    if (!socket || !activeConversationId || mode !== 'dm') return undefined;
    socket.emit('conversation:join', { conversationId: activeConversationId }, () => {});
    return () => socket.emit('conversation:leave', { conversationId: activeConversationId });
  }, [socket, activeConversationId, mode]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setMessages([]);
      setMembers([]);
      setTypingUsers({});
      if (!token) return;
      try {
        if (mode === 'room' && activeRoomId) {
          const [hist, mem] = await Promise.all([
            apiFetch(`/messages?roomId=${activeRoomId}&limit=80`, {}, token),
            apiFetch(`/rooms/${activeRoomId}/members`, {}, token),
          ]);
          if (cancelled) return;
          setMessages(hist.messages || []);
          setMembers(mem.members || []);
        } else if (mode === 'dm' && activeConversationId) {
          const hist = await apiFetch(`/messages?conversationId=${activeConversationId}&limit=80`, {}, token);
          if (cancelled) return;
          setMessages(hist.messages || []);
          const parts = await apiFetch(`/conversations/${activeConversationId}/participants`, {}, token);
          if (cancelled) return;
          setMembers(parts.participants || []);
        }
      } catch {
        if (!cancelled) setMessages([]);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token, mode, activeRoomId, activeConversationId]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (!socket || mode !== 'dm' || !activeConversationId || !messages.length) return;
    const last = messages[messages.length - 1];
    if (!last) return;
    socket.emit('read:update', {
      conversationId: activeConversationId,
      lastReadMessageId: last.id,
    });
  }, [socket, mode, activeConversationId, messages]);

  function emitTypingStart() {
    if (!socket) return;
    if (mode === 'room' && activeRoomId) socket.emit('typing:start', { roomId: activeRoomId });
    if (mode === 'dm' && activeConversationId) {
      socket.emit('typing:start', { conversationId: activeConversationId });
    }
  }

  function emitTypingStop() {
    if (!socket) return;
    if (mode === 'room' && activeRoomId) socket.emit('typing:stop', { roomId: activeRoomId });
    if (mode === 'dm' && activeConversationId) {
      socket.emit('typing:stop', { conversationId: activeConversationId });
    }
  }

  function onComposerChange(value) {
    setComposer(value);
    emitTypingStart();
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => emitTypingStop(), 1600);
  }

  function sendMessage() {
    const body = composer.trim();
    if (!body || !socket) return;
    const payload =
      mode === 'room'
        ? { body, roomId: activeRoomId }
        : { body, conversationId: activeConversationId };
    socket.emit('message:send', payload, () => {});
    setComposer('');
    emitTypingStop();
  }

  async function createRoom(e) {
    e.preventDefault();
    const name = newRoomName.trim();
    if (!name || busyAction) return;
    setBusyAction(true);
    try {
      await apiFetch('/rooms', { method: 'POST', body: JSON.stringify({ name }) }, token);
      setCreateRoomOpen(false);
      setNewRoomName('');
      await refreshSidebar();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyAction(false);
    }
  }

  async function joinRoom(roomId) {
    try {
      await apiFetch(`/rooms/${roomId}/join`, { method: 'POST' }, token);
      await refreshSidebar();
    } catch (err) {
      alert(err.message);
    }
  }

  async function startDm(peerUserId) {
    try {
      const data = await apiFetch(
        '/conversations',
        {
          method: 'POST',
          body: JSON.stringify({ peerUserId }),
        },
        token
      );
      await refreshSidebar();
      setMode('dm');
      setActiveConversationId(data.conversationId);
      setActiveRoomId(null);
      setSidebarOpen(false);
    } catch (err) {
      alert(err.message);
    }
  }

  function headerTitle() {
    if (mode === 'room' && activeRoomId) {
      const room = myRooms.find((r) => r.id === activeRoomId);
      return room?.name || 'Room';
    }
    if (mode === 'dm' && activePeer) return activePeer.peerDisplayName;
    return 'Select a conversation';
  }

  const typingKey =
    mode === 'room' && activeRoomId
      ? `r:${activeRoomId}`
      : mode === 'dm' && activeConversationId
        ? `c:${activeConversationId}`
        : null;

  const typingLabel =
    typingKey && typingUsers[typingKey]?.size
      ? `${[...typingUsers[typingKey]].length} typing…`
      : '';

  const hasChatTarget =
    (mode === 'room' && Boolean(activeRoomId)) || (mode === 'dm' && Boolean(activeConversationId));

  function previewDm(text) {
    if (!text) return 'Say hello';
    const s = String(text);
    return s.length > 44 ? s.slice(0, 42) + '\u2026' : s;
  }

  return (
    <div className="dash-shell">
      <div
        className={'dash-backdrop ' + (sidebarOpen ? 'dash-backdrop--visible' : '')}
        onClick={() => setSidebarOpen(false)}
        aria-hidden={!sidebarOpen}
      />

      <aside className={'dash-sidebar ' + (sidebarOpen ? 'dash-sidebar--open' : '')}>
        <div className="dash-sidebar-inner">
          <div className="dash-sidebar-head">
            <div>
              <div className="dash-brand">Convoy</div>
              <div className="dash-user-line">
                {user.displayName}
                <span className={connected ? 'dash-status-live' : 'dash-status-off'}>
                  {' '}
                  · {connected ? 'Connected' : 'Reconnecting…'}
                </span>
              </div>
            </div>
            <button type="button" className="btn btn-ghost-light" onClick={() => logout()}>
              Log out
            </button>
          </div>

          <button type="button" className="btn-primary-sidebar" onClick={() => setCreateRoomOpen(true)}>
            New room
          </button>

          <input
            className="dash-search"
            placeholder="Search rooms…"
            value={catalogQuery}
            onChange={(e) => setCatalogQuery(e.target.value)}
          />

          <div className="dash-sidebar-scroll">
            <section>
              <div className="dash-section-title">Your rooms</div>
              <div className="dash-list">
                {myRooms.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={
                      'dash-item ' + (mode === 'room' && activeRoomId === r.id ? 'dash-item-active' : '')
                    }
                    onClick={() => {
                      setMode('room');
                      setActiveRoomId(r.id);
                      setActiveConversationId(null);
                      setSidebarOpen(false);
                    }}
                  >
                    <span className="dash-item-title">#{r.name}</span>
                    <span className="dash-item-meta">{r.member_count} members</span>
                  </button>
                ))}
                {!myRooms.length ? (
                  <p className="dash-muted-small" style={{ padding: '4px 10px', margin: 0 }}>
                    Join one from Discover.
                  </p>
                ) : null}
              </div>
            </section>

            <section>
              <div className="dash-section-title">Discover</div>
              <div className="dash-list dash-list--compact">
                {catalog.map((r) => (
                  <div key={r.id} className="dash-discover-row">
                    <div style={{ minWidth: 0 }}>
                      <div className="dash-item-title">#{r.name}</div>
                      <div className="dash-item-meta">{r.member_count} members</div>
                    </div>
                    {!r.is_member ? (
                      <button type="button" className="pill-btn btn-sm" onClick={() => joinRoom(r.id)}>
                        Join
                      </button>
                    ) : (
                      <span className="dash-muted-small">In</span>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="dash-section-title">Direct</div>
              <div className="dash-list">
                {conversations.map((c) => (
                  <button
                    key={c.conversationId}
                    type="button"
                    className={
                      'dash-item ' +
                      (mode === 'dm' && activeConversationId === c.conversationId ? 'dash-item-active' : '')
                    }
                    onClick={() => {
                      setMode('dm');
                      setActiveConversationId(c.conversationId);
                      setActiveRoomId(null);
                      setSidebarOpen(false);
                    }}
                  >
                    <span className="dash-item-title">{c.peerDisplayName}</span>
                    <span className="dash-item-meta">{previewDm(c.lastMessagePreview)}</span>
                  </button>
                ))}
                {!conversations.length ? (
                  <p className="dash-muted-small" style={{ padding: '4px 10px', margin: 0 }}>
                    Start from People (desktop) or search.
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        </div>

        <div className="dash-foot-link">
          <Link to="/">About Convoy</Link>
        </div>
      </aside>

      <main className="dash-main">
        <header className="dash-header">
          <div className="dash-mobile-bar">
            <button
              type="button"
              className="btn-icon"
              aria-label="Open rooms menu"
              onClick={() => setSidebarOpen(true)}
            >
              ☰
            </button>
          </div>
          <div className="dash-header-main">
            <h1 className="dash-title">{headerTitle()}</h1>
            <div className="dash-subtitle">
              Markdown · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to send
              {typingLabel ? (
                <>
                  {' '}
                  · <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{typingLabel}</span>
                </>
              ) : null}
            </div>
          </div>
        </header>

        <div className="dash-thread">
          {!hasChatTarget ? (
            <div className="dash-empty-thread">
              <strong>Choose where to chat</strong>
              <span>
                Pick a room or direct message from the left. On small screens, tap the menu icon first.
              </span>
            </div>
          ) : null}
          {hasChatTarget && !messages.length ? (
            <div className="dash-empty-thread">
              <strong>No messages yet</strong>
              <span>Say something below — this thread is yours to open.</span>
            </div>
          ) : null}
          {messages.map((m) => {
            const mine = m.authorId === user.id;
            const receiptOk =
              mine &&
              mode === 'dm' &&
              activeConversationId &&
              (peerReadMap[activeConversationId] ?? 0) >= m.id;

            return (
              <div key={m.id} className={'bubble-row ' + (mine ? 'me' : '')}>
                <div className={'bubble ' + (mine ? 'me' : 'them')}>
                  <div className="bubble-meta">
                    <strong>{m.authorDisplayName}</strong>
                    <span>{formatTime(m.createdAt)}</span>
                    {m.editedAt ? <span>(edited)</span> : null}
                    {receiptOk ? <span title="Read">Read</span> : null}
                  </div>
                  <div className="markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.body || '_deleted_'}</ReactMarkdown>
                  </div>
                  {mine ? (
                    <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="pill-btn"
                        onClick={() => {
                          setEditingId(m.id);
                          setEditDraft(m.body);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="pill-btn"
                        onClick={() => {
                          if (!confirm('Remove this message?')) return;
                          socket?.emit('message:delete', { messageId: m.id });
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                  {editingId === m.id ? (
                    <div style={{ marginTop: 10 }}>
                      <textarea
                        className="dash-composer--inline"
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button
                          type="button"
                          className="pill-btn primary"
                          onClick={() => {
                            socket?.emit('message:edit', { messageId: m.id, body: editDraft }, () => {});
                            setEditingId(null);
                          }}
                        >
                          Save
                        </button>
                        <button type="button" className="pill-btn" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
          <div ref={threadEndRef} />
        </div>

        <footer className="dash-composer-wrap">
          <div className="dash-composer-hint">
            Mentions: <code>{'@{userId}'}</code> · People list shows numeric ids (desktop).
          </div>
          <div className="dash-composer-box">
            <textarea
              className="dash-composer"
              placeholder={
                mode === 'room'
                  ? 'Write to #' + headerTitle() + '…'
                  : mode === 'dm'
                    ? 'Message ' + headerTitle() + '…'
                    : 'Select a room or DM first…'
              }
              value={composer}
              disabled={mode === 'room' ? !activeRoomId : !activeConversationId}
              onChange={(e) => onComposerChange(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            <button type="button" className="dash-send" onClick={sendMessage} disabled={!hasChatTarget}>
              Send
            </button>
          </div>
        </footer>
      </main>

      <aside className="dash-rail">
        <div className="dash-section-title dash-section-title--rail">People</div>
        <input
          className="dash-rail-search"
          value={peopleQuery}
          onChange={(e) => setPeopleQuery(e.target.value)}
          placeholder="Search name or email…"
        />
        {peopleHits.length ? (
          <div className="dash-list" style={{ marginBottom: 8 }}>
            {peopleHits.map((p) => (
              <div key={p.id} className="dash-person-row">
                <div style={{ minWidth: 0 }}>
                  <div className="dash-item-title">{p.display_name}</div>
                  <div className="dash-item-meta">id {p.id}</div>
                </div>
                <button type="button" className="pill-btn btn-sm" onClick={() => startDm(p.id)}>
                  Message
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="dash-section-title dash-section-title--rail">In this chat</div>
        <div className="dash-list">
          {members.map((m) => {
            const online = onlineUsers.has(m.id);
            return (
              <div key={String(m.id) + '-' + mode} className="dash-person-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span className={'presence-dot ' + (online ? '' : 'offline')} title={online ? 'Online' : 'Away'} />
                  <div style={{ minWidth: 0 }}>
                    <div className="dash-item-title">{m.display_name}</div>
                    <div className="dash-item-meta">
                      {online ? 'Online' : 'Away'} · id {m.id}
                    </div>
                  </div>
                </div>
                {m.id !== user.id ? (
                  <button type="button" className="pill-btn btn-sm" onClick={() => startDm(m.id)}>
                    DM
                  </button>
                ) : null}
              </div>
            );
          })}
          {!members.length ? (
            <p className="dash-muted-small" style={{ margin: '8px 0 0', padding: '0 6px' }}>
              Join a room or open a DM to see members.
            </p>
          ) : null}
        </div>
      </aside>

      <CreateRoomModal
        open={createRoomOpen}
        busy={busyAction}
        name={newRoomName}
        onNameChange={setNewRoomName}
        onSubmit={createRoom}
        onClose={() => setCreateRoomOpen(false)}
      />

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
