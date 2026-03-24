import { pgTable, uuid, text, boolean, integer, timestamp, unique, json } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';

export const seoKeywords = pgTable(
  'seo_keywords',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    keyword: text('keyword').notNull(),
    source: text('source').notNull(), // google_suggest, alphabet_soup, deep_soup, question, comparison, modifier, youtube, related
    searchIntent: text('search_intent'), // informational, transactional, navigational, commercial
    contentType: text('content_type'), // blog_post, landing_page, faq, video, comparison, tutorial
    cluster: text('cluster'), // topic cluster name (set by SEO agent)
    priority: text('priority'), // high, medium, low (set by SEO agent)
    contentIdea: text('content_idea'), // suggested content title/angle (set by SEO agent)
    estimatedVolume: text('estimated_volume'), // high, medium, low (from suggestion frequency)
    isTracking: boolean('is_tracking').notNull().default(false),
    discoveredAt: timestamp('discovered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.projectId, table.keyword)],
);

export const seoContentPlans = pgTable('seo_content_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  contentType: text('content_type').notNull(), // blog_post, landing_page, faq, video, comparison
  cluster: text('cluster'),
  targetKeywords: json('target_keywords').$type<string[]>(),
  outline: text('outline'),
  priority: text('priority').notNull().default('medium'),
  status: text('status').notNull().default('planned'), // planned, in_progress, published
  metadata: json('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
