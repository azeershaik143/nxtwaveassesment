import React, { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';
import { apiFetch } from '../api/client.js';

const AuthContext = createContext(null);
const STORAGE_KEY = 'convoy_token';

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => localStorage.getItem(STORAGE_KEY));
  const [user, setUser] = useState(null);
  const [bootstrapping, setBootstrapping] = useState(!!localStorage.getItem(STORAGE_KEY));

  useEffect(() => {
    if (!token) {
      setUser(null);
      setBootstrapping(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch('/me', {}, token);
        if (!cancelled) setUser(data.user);
      } catch {
        if (!cancelled) {
          localStorage.removeItem(STORAGE_KEY);
          setTokenState(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const setToken = useCallback((next) => {
    if (next) localStorage.setItem(STORAGE_KEY, next);
    else localStorage.removeItem(STORAGE_KEY);
    setTokenState(next);
  }, []);

  const login = useCallback(
    async (email, password) => {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setToken(data.token);
      setUser(data.user);
      return data.user;
    },
    [setToken]
  );

  const register = useCallback(
    async ({ email, password, displayName }) => {
      const data = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, displayName }),
      });
      setToken(data.token);
      setUser(data.user);
      return data.user;
    },
    [setToken]
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, [setToken]);

  const refreshProfile = useCallback(async () => {
    if (!token) return;
    const data = await apiFetch('/me', {}, token);
    setUser(data.user);
  }, [token]);

  const value = useMemo(
    () => ({
      token,
      user,
      bootstrapping,
      login,
      register,
      logout,
      refreshProfile,
    }),
    [token, user, bootstrapping, login, register, logout, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
