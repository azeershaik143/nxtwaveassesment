/**
 * Dev helper (macOS/Linux): stops whatever is listening on PORT so `npm run dev` can bind.
 * Set SKIP_FREE_PORT=1 to disable.
 */
const { execSync } = require('child_process');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (process.env.SKIP_FREE_PORT === '1') {
  process.exit(0);
}

const port = String(Number(process.env.PORT) || 4000);

try {
  const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pids = [...new Set(out.trim().split(/\s+/).filter(Boolean))];
  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGTERM');
    } catch {
      /* ignore */
    }
  }
  if (pids.length) {
    console.log(`[dev] Freed port ${port} (stopped PID(s): ${pids.join(', ')})`);
    const deadline = Date.now() + 400;
    while (Date.now() < deadline) {
      /* allow TCP stack to release port after SIGTERM */
    }
  }
} catch {
  /* lsof exits 1 when nothing listens — OK */
}
