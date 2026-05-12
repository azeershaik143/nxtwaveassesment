import React from 'react';

export default function CreateRoomModal({ open, busy, name, onNameChange, onSubmit, onClose }) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,18,24,0.38)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 50,
      }}
      onMouseDown={onClose}
    >
      <div
        style={{
          width: 'min(420px, 92vw)',
          background: '#fff',
          borderRadius: 16,
          padding: 22,
          boxShadow: 'var(--shadow)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontFamily: "'DM Serif Display', serif", marginTop: 0 }}>Name your room</h2>
        <form onSubmit={onSubmit}>
          <input
            autoFocus
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. weekend-build"
            style={{
              width: '100%',
              padding: '11px 12px',
              borderRadius: 10,
              border: '1px solid rgba(31,36,45,0.14)',
            }}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button type="submit" disabled={busy} className="pill-btn primary">
              Create
            </button>
            <button type="button" className="pill-btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
