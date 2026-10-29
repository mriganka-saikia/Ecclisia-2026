import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { cfg } from './config.js';
import { HttpError } from './errors.js';
import authRoutes from './routes/auth.js';
import apiRoutes from './routes/api.js';

export function buildApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: cfg.isProd ? cfg.clientOrigin.split(',') : true }));
  app.use(express.json({ limit: '100kb' }));
  app.get('/api/health', (_q, res) => res.json({ ok: true }));
  app.use('/api/auth', rateLimit({ windowMs: 15 * 60_000, limit: cfg.demoMode ? 500 : 40, standardHeaders: true, legacyHeaders: false }), authRoutes);
  app.use('/api', apiRoutes);

  // Serve the built React app from the same service when present (one-click Render deploy)
  const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api).*/, (_q, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use('/api', (_q, _r, next) => next(new HttpError(404, 'Not found')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on our side' });
  });
  return app;
}
