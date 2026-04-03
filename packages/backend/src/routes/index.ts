import type { FastifyInstance } from 'fastify';
import { appsRoutes } from './apps.js';
import { keywordsRoutes } from './keywords.js';
import { experimentsRoutes } from './experiments.js';
import { rankingsRoutes } from './rankings.js';
import { listingsRoutes } from './listings.js';
import { reviewsRoutes } from './reviews.js';
import { strategyRoutes } from './strategy.js';
import { healthRoutes } from './health.js';
import { opportunitiesRoutes } from './opportunities.js';
import { changelogRoutes } from './changelog.js';
import { scrapeJobsRoutes } from './scrape-jobs.js';
import { agentRoutes } from './agents.js';
import { projectRoutes } from './projects.js';
import { streamRoutes } from './stream.js';
import { seoRoutes } from './seo.js';
import { settingsRoutes } from './settings.js';
import { gscRoutes } from './gsc.js';
import { siteAuditRoutes } from './site-audit.js';
import { aiVisibilityRoutes } from './ai-visibility.js';
import { contentRoutes } from './content.js';

export async function routes(app: FastifyInstance) {
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  await app.register(appsRoutes);
  await app.register(keywordsRoutes);
  await app.register(experimentsRoutes);
  await app.register(rankingsRoutes);
  await app.register(listingsRoutes);
  await app.register(reviewsRoutes);
  await app.register(strategyRoutes);
  await app.register(healthRoutes);
  await app.register(opportunitiesRoutes);
  await app.register(changelogRoutes);
  await app.register(scrapeJobsRoutes);
  await app.register(agentRoutes);
  await app.register(projectRoutes);
  await app.register(streamRoutes);
  await app.register(seoRoutes);
  await app.register(settingsRoutes);
  await app.register(gscRoutes);
  await app.register(siteAuditRoutes);
  await app.register(aiVisibilityRoutes);
  await app.register(contentRoutes);
}
