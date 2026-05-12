import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register({ displayName: displayName.trim(), email: email.trim(), password });
      navigate('/app');
    } catch (err) {
      const detail =
        err.details &&
        typeof err.details === 'object' &&
        Object.values(err.details).flat?.()?.[0];
      setError(detail || err.message || 'Could not register');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div
        style={{
          width: 'min(440px, 100%)',
          background: '#fff',
          padding: 28,
          borderRadius: 16,
          boxShadow: 'var(--shadow)',
        }}
      >
        <h1 style={{ fontFamily: "'DM Serif Display', serif", marginTop: 0 }}>Create your workspace</h1>
        <p style={{ color: 'var(--muted)', marginTop: -6 }}>
          One account unlocks every public room you join and every direct thread you open.
        </p>

        <form onSubmit={onSubmit} style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
            Display name
            <input
              type="text"
              autoComplete="nickname"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              minLength={2}
              style={{
                padding: '11px 12px',
                borderRadius: 10,
                border: '1px solid rgba(31,36,45,0.14)',
                background: '#fdfcfa',
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                padding: '11px 12px',
                borderRadius: 10,
                border: '1px solid rgba(31,36,45,0.14)',
                background: '#fdfcfa',
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
            Password (min 8 characters)
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              style={{
                padding: '11px 12px',
                borderRadius: 10,
                border: '1px solid rgba(31,36,45,0.14)',
                background: '#fdfcfa',
              }}
            />
          </label>

          {error ? (
            <p role="alert" style={{ color: '#b42318', margin: 0, fontSize: 14 }}>
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            style={{
              marginTop: 6,
              padding: '12px 16px',
              borderRadius: 12,
              border: 'none',
              background: busy ? 'rgba(192,84,56,0.35)' : 'var(--accent)',
              color: '#fff',
              fontWeight: 650,
            }}
          >
            {busy ? 'Creating account…' : 'Register'}
          </button>
        </form>

        <p style={{ marginTop: 18, color: 'var(--muted)', fontSize: 14 }}>
          Already registered?{' '}
          <Link to="/login" style={{ fontWeight: 600 }}>
            Sign in
          </Link>
        </p>
        <p style={{ marginTop: 8 }}>
          <Link to="/" style={{ color: 'var(--muted)', fontSize: 14 }}>
            ← Back home
          </Link>
        </p>
      </div>
    </div>
  );
}
