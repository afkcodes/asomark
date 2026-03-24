import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env.js';
import { routes } from './routes/index.js';
import { startWorkers, stopWorkers } from './workers/index.js';
import { eventBus } from './lib/events.js';

const app = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
});

await app.register(cors, {
  origin: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
});

// Allow DELETE requests with empty body (browsers sometimes send Content-Type without body)
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
  if (!body || (typeof body === 'string' && body.trim() === '')) {
    done(null, undefined);
    return;
  }
  try {
    done(null, JSON.parse(body as string));
  } catch (err) {
    done(err as Error, undefined);
  }
});

await app.register(routes);

const shutdown = async (signal: string) => {
  app.log.info(`Received ${signal}, shutting down gracefully...`);
  await stopWorkers();
  await app.close();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

try {
  await app.listen({ port: env.BACKEND_PORT, host: '0.0.0.0' });
  app.log.info(`Server listening on http://0.0.0.0:${env.BACKEND_PORT}`);

  // Register event bus listeners
  eventBus.on('project:setup_complete', (data) => {
    app.log.info(`Project setup complete: ${data.competitors} competitors, ${data.keywords} keywords`);
  });
  eventBus.on('listing:change_detected', (data) => {
    app.log.info(`Listing change: ${data.field} for app ${data.appId}`);
  });
  eventBus.on('health:score_updated', (data) => {
    app.log.info(`Health score: ${data.score} for app ${data.appId}`);
  });

  // Start background workers and scheduled jobs
  await startWorkers();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
