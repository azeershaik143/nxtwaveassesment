import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext.jsx';

const SocketContext = createContext(null);

function socketOrigin() {
  const sock = (import.meta.env.VITE_SOCKET_URL || '').trim();
  if (sock) return sock.replace(/\/$/, '');
  if (import.meta.env.DEV) return window.location.origin;
  const api = (import.meta.env.VITE_API_URL || '').trim();
  return (api ? api.replace(/\/$/, '') : '') || window.location.origin;
}

export function SocketProvider({ children }) {
  const { token } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) {
      setSocket((prev) => {
        prev?.disconnect();
        return null;
      });
      setConnected(false);
      return undefined;
    }

    const s = io(socketOrigin(), {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: { token },
    });

    setSocket(s);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [token]);

  const value = useMemo(() => ({ socket, connected }), [socket, connected]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
