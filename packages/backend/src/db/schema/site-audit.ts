import { pgTable, uuid, text, integer, real, timestamp, json, index } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';

/** A site audit run — crawls the user's website and checks for SEO issues */
export const siteAudits = pgTable('site_audits', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  siteUrl: text('site_url').notNull(),
  status: text('status', { enum: ['running', 'completed', 'failed'] }).notNull().default('running'),
  pagesCrawled: integer('pages_crawled').notNull().default(0),
  issuesFound: integer('issues_found').notNull().default(0),
  score: integer('score'), // 0-100 overall SEO health
  summary: json('summary').$type<{
    critical: number;
    warning: number;
    info: number;
    passed: number;
  }>(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

/** Individual page results from a site audit */
export const siteAuditPages = pgTable(
  'site_audit_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    auditId: uuid('audit_id')
      .references(() => siteAudits.id, { onDelete: 'cascade' })
      .notNull(),
    url: text('url').notNull(),
    statusCode: integer('status_code'),
    loadTimeMs: integer('load_time_ms'),
    title: text('title'),
    titleLength: integer('title_length'),
    metaDescription: text('meta_description'),
    metaDescriptionLength: integer('meta_description_length'),
    h1Count: integer('h1_count'),
    h1Text: text('h1_text'),
    imageCount: integer('image_count'),
    imagesWithoutAlt: integer('images_without_alt'),
    internalLinks: integer('internal_links'),
    externalLinks: integer('external_links'),
    brokenLinks: json('broken_links').$type<string[]>(),
    wordCount: integer('word_count'),
    hasCanonical: integer('has_canonical'), // 0 or 1
    canonicalUrl: text('canonical_url'),
    hasRobotsMeta: integer('has_robots_meta'),
    schemaTypes: json('schema_types').$type<string[]>(),
    issues: json('issues').$type<Array<{
      type: 'critical' | 'warning' | 'info';
      code: string;
      message: string;
    }>>(),
    score: integer('score'), // 0-100 page score
  },
  (table) => [
    index('idx_audit_pages_audit').on(table.auditId),
  ],
);
