import express from 'express';
import cors from 'cors';
import { ensureDir, exists, writeJSON } from './services/fileService.js';
import { errorHandler } from './middleware/errorHandler.js';

import worksRouter from './routes/works.js';
import chaptersRouter from './routes/chapters.js';
import codexRouter from './routes/codex.js';
import catchesRouter from './routes/catches.js';
import mapRouter from './routes/map.js';
import sessionsRouter from './routes/sessions.js';
import exportRouter from './routes/export.js';
import aiRouter from './routes/ai.js';
import settingsRouter from './routes/settings.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'scriptorium-backend', time: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/works', worksRouter);
app.use('/api/works/:workId/chapters', chaptersRouter);
app.use('/api/works/:workId/codex', codexRouter);
app.use('/api/works/:workId/catches', catchesRouter);
app.use('/api/works/:workId/map', mapRouter);
app.use('/api/works/:workId/sessions', sessionsRouter);
app.use('/api/works/:workId/export', exportRouter);
app.use('/api/ai', aiRouter);
app.use('/api/settings', settingsRouter);

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Startup: ensure required data files exist ────────────────────────────────
function initDataDir() {
  ensureDir('settings');
  ensureDir('works');
  if (!exists('works.json')) {
    writeJSON('works.json', []);
  }
}

try {
  initDataDir();
} catch (err) {
  console.error('Failed to initialise data directory:', err.message);
}

app.listen(PORT, () => {
  console.log(`Scriptorium backend listening on http://localhost:${PORT}`);
});
