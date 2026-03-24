import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const apps = pgTable('apps', {
  id: uuid('id').primaryKey().defaultRandom(),
  packageName: text('package_name'),
  bundleId: text('bundle_id'),
  name: text('name').notNull(),
  platform: text('platform', { enum: ['android', 'ios'] }).notNull(),
  isOurs: boolean('is_ours').notNull().default(false),
  category: text('category'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
