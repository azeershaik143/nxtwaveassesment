import React from 'react';
import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px 28px',
          borderBottom: '1px solid rgba(31,36,45,0.08)',
          background: 'rgba(255,255,255,0.65)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22 }}>Convoy</span>
        <nav style={{ display: 'flex', gap: 12 }}>
          <Link to="/login" style={{ textDecoration: 'none', color: 'var(--muted)', padding: '8px 12px' }}>
            Sign in
          </Link>
          <Link
            to="/register"
            style={{
              textDecoration: 'none',
              background: 'var(--accent)',
              color: '#fff',
              padding: '8px 14px',
              borderRadius: 999,
              fontWeight: 600,
            }}
          >
            Create account
          </Link>
        </nav>
      </header>

      <main style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 32 }}>
        <section style={{ maxWidth: 560, textAlign: 'center' }}>
          <p style={{ letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', fontSize: 12 }}>
            Small-team realtime chat
          </p>
          <h1
            style={{
              fontFamily: "'DM Serif Display', serif",
              fontSize: 'clamp(2.4rem, 6vw, 3.4rem)',
              lineHeight: 1.12,
              margin: '12px 0 18px',
            }}
          >
            Rooms that stay calm. Messages that stay readable.
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 17, lineHeight: 1.55 }}>
            Convoy keeps public rooms and direct threads in one quiet dashboard — markdown-friendly messages,
            typing cues, and receipts without the noise of larger platforms.
          </p>
          <div style={{ marginTop: 28, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              to="/register"
              style={{
                background: 'var(--accent)',
                color: '#fff',
                padding: '12px 22px',
                borderRadius: 999,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Start free
            </Link>
            <Link
              to="/login"
              style={{
                border: '1px solid rgba(31,36,45,0.14)',
                padding: '12px 22px',
                borderRadius: 999,
                fontWeight: 600,
                textDecoration: 'none',
                color: 'var(--ink)',
              }}
            >
              I already have an account
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
