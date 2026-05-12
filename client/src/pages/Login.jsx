import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate('/app');
    } catch (err) {
      setError(err.message || 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div
        style={{
          width: 'min(420px, 100%)',
          background: '#fff',
          padding: 28,
          borderRadius: 16,
          boxShadow: 'var(--shadow)',
        }}
      >
        <h1 style={{ fontFamily: "'DM Serif Display', serif", marginTop: 0 }}>Welcome back</h1>
        <p style={{ color: 'var(--muted)', marginTop: -6 }}>Sign in to pick up where you left off.</p>

        <form onSubmit={onSubmit} style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
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
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
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
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p style={{ marginTop: 18, color: 'var(--muted)', fontSize: 14 }}>
          Need an account?{' '}
          <Link to="/register" style={{ fontWeight: 600 }}>
            Register
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
