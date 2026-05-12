const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { authJwt } = require('./middleware/authJwt');
const { createAuthRouter } = require('./routes/auth');
const { createMeRouter } = require('./routes/me');
const { createRoomsRouter } = require('./routes/rooms');
const { createUsersRouter } = require('./routes/users');
const { createConversationsRouter } = require('./routes/conversations');
const { createMessagesRouter } = require('./routes/messages');

function createApp({ db, jwtSecret, jwtExpiresIn, clientOrigin }) {
  const app = express();
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: clientOrigin || '*',
      credentials: true,
    })
  );
  app.use(express.json({ limit: '512kb' }));

  const authenticate = authJwt(jwtSecret);

  app.get('/', (_req, res) => {
    res.type('html').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Convoy API</title></head>
<body style="font-family:system-ui,sans-serif;max-width:36rem;margin:2rem auto;line-height:1.5">
  <h1>Convoy API</h1>
  <p>This is the backend only. Open the app UI at <strong>http://localhost:5173</strong> (run <code>npm run dev</code> in <code>client/</code>).</p>
  <p><a href="/health">GET /health</a> — quick readiness check.</p>
</body></html>`);
  });

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/auth', createAuthRouter({ jwtSecret, jwtExpiresIn }));
  app.use('/me', createMeRouter({ db, authJwt: authenticate }));
  app.use('/rooms', createRoomsRouter({ authJwt: authenticate }));
  app.use('/users', createUsersRouter({ db, authJwt: authenticate }));
  app.use('/conversations', createConversationsRouter({ db, authJwt: authenticate }));
  app.use('/messages', createMessagesRouter({ db, authJwt: authenticate }));

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
