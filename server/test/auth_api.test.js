const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const path = require('path');
const Database = require('better-sqlite3');
const { createApp } = require('../src/app');

const jwtSecret = 'test-secret';

function bootstrapDb() {
  const dbPath = path.join(__dirname, `temp_auth_api_${Date.now()}_${Math.random().toString(36).slice(2)}.sqlite`);
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      status_message TEXT DEFAULT '',
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return { db, dbPath };
}

test('POST /auth/register validates email', async () => {
  const { db, dbPath } = bootstrapDb();
  const app = createApp({ db, jwtSecret, jwtExpiresIn: '1h', clientOrigin: '*' });
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'not-an-email', password: 'longenough', displayName: 'Ada' });
  assert.strictEqual(res.status, 400);
  db.close();
  require('fs').unlinkSync(dbPath);
});

test('POST /auth/register creates user', async () => {
  const { db, dbPath } = bootstrapDb();
  const app = createApp({ db, jwtSecret, jwtExpiresIn: '1h', clientOrigin: '*' });
  const email = `Ada_${Date.now()}_${Math.random().toString(36).slice(2)}@test.dev`;
  const res = await request(app).post('/auth/register').send({
    email,
    password: 'longenough',
    displayName: 'Ada Lovelace',
  });
  assert.strictEqual(res.status, 201);
  assert.ok(res.body.token);
  assert.strictEqual(res.body.user.displayName, 'Ada Lovelace');
  db.close();
  require('fs').unlinkSync(dbPath);
});
