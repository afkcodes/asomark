import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  json,
} from 'drizzle-orm/pg-core';
import { projects } from './projects.js';

// ─── Listing Versions ───
// Each generation run creates a version containing multiple variants.

export const listingVersions = pgTable('listing_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  versionNumber: integer('version_number').notNull().default(1),
  generationMethod: text('generation_method', {
    enum: ['manual', 'agent'],
  })
    .notNull()
    .default('manual'),
  keywordsUsedJson: json('keywords_used_json').$type<
    Array<{ term: string; score: number; placement: string }>
  >(),
  competitorsAnalyzedJson: json('competitors_analyzed_json').$type<
    Array<{ packageName: string; title: string }>
  >(),
  metadata: json('metadata').$type<{
    tokensUsed?: { input: number; output: number };
    model?: string;
    durationMs?: number;
    valueProposition?: string;
  }>(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Listing Variants ───
// Each variant within a version represents a different strategic approach.

export const listingVariants = pgTable('listing_variants', {
  id: uuid('id').primaryKey().defaultRandom(),
  versionId: uuid('version_id')
    .references(() => listingVersions.id, { onDelete: 'cascade' })
    .notNull(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  variantIndex: integer('variant_index').notNull().default(0),
  strategyName: text('strategy_name').notNull().default('manual'),
  title: text('title').notNull().default(''),
  shortDescription: text('short_description').notNull().default(''),
  fullDescription: text('full_description').notNull().default(''),
  keywordsUsed: json('keywords_used').$type<string[]>(),
  keywordPlacementMap: json('keyword_placement_map').$type<
    Record<string, 'title' | 'short_description' | 'description'>
  >(),
  scores: json('scores').$type<{
    overall: number;
    title: number;
    shortDesc: number;
    fullDesc: number;
    coverage: number;
    densities?: Array<{ keyword: string; density: number; count: number }>;
  }>(),
  rationale: text('rationale'),
  warnings: json('warnings').$type<string[]>(),
  isActive: boolean('is_active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Listing Drafts ───
// The working draft — single source of truth for the editor and simulator.

export const listingDrafts = pgTable('listing_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull().default(''),
  shortDescription: text('short_description').notNull().default(''),
  fullDescription: text('full_description').notNull().default(''),
  appName: text('app_name'),
  developerName: text('developer_name'),
  version: integer('version').notNull().default(1),
  activeVariantId: uuid('active_variant_id'),
  sourceVersionId: uuid('source_version_id'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
