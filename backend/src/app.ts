import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { errorHandler } from './middleware';
import authRoutes from './routes/auth.routes';
import menuRoutes from './routes/menu.routes';
import orderRoutes from './routes/order.routes';
import {
  paymentRoutes,
  inventoryRoutes,
  dashboardRoutes,
  hrRoutes,
  customerRoutes,
  supplierRoutes,
  reportRoutes,
  reviewRoutes,
  branchRoutes,
} from './routes/admin.routes';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin / tools (no Origin header) and listed frontends
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes(origin)) return callback(null, true);
        // Dev: allow any local Next.js port (3000 in use → often 3001+)
        if (
          !env.isProd &&
          /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
        ) {
          return callback(null, true);
        }
        return callback(new Error(`CORS blocked: ${origin}`));
      },
      credentials: true,
    })
  );
  app.use(compression());
  app.use(morgan(env.isProd ? 'combined' : 'dev'));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use(
    rateLimit({
      windowMs: env.rateLimitWindowMs,
      max: env.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: env.appName, time: new Date().toISOString() });
  });

  const api = express.Router();
  api.use('/auth', authRoutes);
  api.use('/menu', menuRoutes);
  api.use('/orders', orderRoutes);
  api.use('/payments', paymentRoutes);
  api.use('/inventory', inventoryRoutes);
  api.use('/dashboard', dashboardRoutes);
  api.use('/hr', hrRoutes);
  api.use('/customers', customerRoutes);
  api.use('/suppliers', supplierRoutes);
  api.use('/reports', reportRoutes);
  api.use('/reviews', reviewRoutes);
  api.use('/branch', branchRoutes);

  app.use('/api/v1', api);
  app.use(errorHandler);
  return app;
}
