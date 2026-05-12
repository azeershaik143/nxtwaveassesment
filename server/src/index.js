const http = require('http');
const path = require('path');
const dotenv = require('dotenv');
const { Server } = require('socket.io');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { db } = require('./db');
const { createApp } = require('./app');
const { attachSocketServer } = require('./socket');

const { parseClientOrigins } = require('./lib/corsOrigins');

const PORT = Number(process.env.PORT) || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const CLIENT_ORIGIN_RAW =
  process.env.CLIENT_ORIGIN ||
  'http://localhost:5173,http://127.0.0.1:5173';
const CLIENT_ORIGIN = parseClientOrigins(CLIENT_ORIGIN_RAW);

const app = createApp({
  db,
  jwtSecret: JWT_SECRET,
  jwtExpiresIn: JWT_EXPIRES_IN,
  clientOrigin: CLIENT_ORIGIN,
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

attachSocketServer(io, { db, jwtSecret: JWT_SECRET });

server.listen(PORT, () => {
  console.log(`Convoy API listening on http://localhost:${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\nPort ${PORT} is already in use (another Convoy server or app?).\n` +
        `Stop it with: lsof -nP -iTCP:${PORT} -sTCP:LISTEN   then   kill <PID>\n` +
        `Or run:    npm run dev    (auto-frees the port first)\n` +
        `Or use:    PORT=4001 npm run dev\n`
    );
    process.exit(1);
  }
  throw err;
});
