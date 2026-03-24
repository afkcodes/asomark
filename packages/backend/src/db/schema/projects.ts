import { pgTable, uuid, text, boolean, integer, timestamp, unique, json, index } from 'drizzle-orm/pg-core';
import { apps } from './apps.js';

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  appId: uuid('app_id').references(() => apps.id).notNull(),
  name: text('name').notNull(),
  region: text('region').notNull().default('us'),
  mode: text('mode', { enum: ['live', 'pre_launch'] }).notNull().default('live'),
  seedKeywords: json('seed_keywords').$type<string[]>(),
  category: text('category'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const projectCompetitors = pgTable(
  'project_competitors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    competitorAppId: uuid('competitor_app_id')
      .references(() => apps.id)
      .notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.projectId, table.competitorAppId)],
);

export const discoveredKeywords = pgTable(
  'discovered_keywords',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    sourceAppId: uuid('source_app_id').references(() => apps.id),
    keyword: text('keyword').notNull(),
    rank: integer('rank'),
    myRank: integer('my_rank'),
    bestCompRank: integer('best_comp_rank'),
    bestCompPackage: text('best_comp_package'),
    totalResults: integer('total_results'),
    source: text('source'), // 'title', 'description', 'autocomplete', 'ngram', 'common'
    difficulty: integer('difficulty'),
    volume: integer('volume'),
    isTracking: boolean('is_tracking').notNull().default(false),
    discoveredAt: timestamp('discovered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.projectId, table.keyword),
    index('idx_discovered_kw_project').on(table.projectId),
    index('idx_discovered_kw_source_app').on(table.sourceAppId),
  ],
);
