import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { apiRouter } from './src/routes/api.ts';
import { rateLimiter } from './src/middleware/auth.ts';
import { isPostgresConfigured, runPostgresMigrations } from './src/db/postgres.ts';
import { recoverPendingJobs } from './src/services/jobQueue.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  // Apply JSON parser with raw body retention for HMAC verification
  app.use(
    express.json({
      limit: '10mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Root & API Health checks
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      service: 'Nayeem AI Desk',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // General API rate limiter
  app.use('/api', rateLimiter(120, 60 * 1000));

  // Mount API Router
  app.use('/api', apiRouter);

  // If PostgreSQL is configured, attempt migrations on startup lazily
  if (isPostgresConfigured()) {
    runPostgresMigrations().then(async (res) => {
      if (res.success) {
        console.log('[PostgreSQL]: Migration check complete.');
      } else {
        console.warn('[PostgreSQL Warning]:', res.message);
      }
      await recoverPendingJobs();
    }).catch((err) => {
      console.warn('[PostgreSQL Warning]:', err.message);
    });
  } else {
    recoverPendingJobs().catch(() => {});
  }

  // Vite middleware in dev or static files in production
  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    } else {
      console.warn('[Server]: dist directory not found. Please run "npm run build".');
    }
  }

  // Global error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[Unhandled Server Error]:', err);
    res.status(500).json({
      error: 'An unexpected internal server error occurred.',
    });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Nayeem AI Desk]: Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Fatal Server Startup Error]:', err);
  process.exit(1);
});
