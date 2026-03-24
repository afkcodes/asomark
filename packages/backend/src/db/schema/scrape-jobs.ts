import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const scrapeJobs = pgTable('scrape_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  source: text('source'),
  target: text('target'),
  status: text('status'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  recordsScraped: integer('records_scraped'),
  errors: text('errors'),
});
