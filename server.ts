import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { handleLogin, requireAdmin } from './server/auth.js';
import { ADMIN_PASSWORD, UPLOADS_DIR, ensureDataDirs } from './server/config.js';
import { createAiRouter } from './server/routes/ai.js';
import { createTreesRouter } from './server/routes/trees.js';
import { createUploadsRouter } from './server/routes/uploads.js';
import { migrateInlineImages } from './server/storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  ensureDataDirs();
  await migrateInlineImages();

  if (!ADMIN_PASSWORD) {
    console.info('[auth] ADMIN_PASSWORD is not set: passwordless admin login enabled.');
  }

  const app = express();
  const PORT = process.env.PORT || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  app.set('trust proxy', 1);

  // Raw binary upload router must be registered before express.json()
  app.use(createUploadsRouter());

  app.use(express.json({ limit: '50mb' }));

  app.use(
    (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (err && (err.type === 'entity.too.large' || err.status === 413)) {
        return res.status(413).json({
          success: false,
          error: 'Розмір файлу перевищує допустимий ліміт сервера (50 МБ)',
        });
      }
      if (err && req.path.startsWith('/api/')) {
        return res.status(err.status || 400).json({
          success: false,
          error: err.message || 'Помилка обробки запиту',
        });
      }
      return next(err);
    }
  );

  // Serve static uploads safely: block inline script/SVG execution via security headers
  app.use(
    '/uploads',
    express.static(UPLOADS_DIR, {
      maxAge: '7d',
      etag: true,
      setHeaders: (res, filePath) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        if (path.extname(filePath).toLowerCase() === '.svg') {
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Content-Disposition', 'attachment');
        }
      },
    })
  );

  // Auth & health routes
  app.get('/api/auth-mode', (_req, res) => {
    res.json({ success: true, passwordRequired: Boolean(ADMIN_PASSWORD) });
  });
  app.post('/api/login', handleLogin);
  app.get('/api/health', (_req, res) => {
    res.json({ success: true, status: 'online', timestamp: Date.now() });
  });
  app.get('/api/session', requireAdmin, (_req, res) => res.json({ success: true }));

  // Domain routers
  app.use(createTreesRouter());
  app.use(createAiRouter());

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ success: false, error: 'API endpoint not found' });
      }
      return res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
