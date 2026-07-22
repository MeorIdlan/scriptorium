import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { connectMongo } from './db.js';
import { errorHandler } from './middleware/errorHandler.js';

import authRouter from './routes/auth.js';
import { requireAuth } from './middleware/requireAuth.js';

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
app.use(cookieParser());
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'scriptorium-backend', time: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);

const auth = requireAuth();
app.use('/api/works', auth, worksRouter);
app.use('/api/works/:workId/chapters', auth, chaptersRouter);
app.use('/api/works/:workId/codex', auth, codexRouter);
app.use('/api/works/:workId/catches', auth, catchesRouter);
app.use('/api/works/:workId/map', auth, mapRouter);
app.use('/api/works/:workId/sessions', auth, sessionsRouter);
app.use('/api/works/:workId/export', auth, exportRouter);
app.use('/api/ai', auth, aiRouter);
app.use('/api/settings', auth, settingsRouter);

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

async function start() {
  await connectMongo();
  app.listen(PORT, () => {
    console.log(`Scriptorium backend listening on http://localhost:${PORT}`);
  });
}

start();
