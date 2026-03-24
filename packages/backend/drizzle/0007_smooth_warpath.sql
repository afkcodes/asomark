CREATE INDEX "idx_rank_snapshots_app_date" ON "rank_snapshots" USING btree ("app_id","date");--> statement-breakpoint
CREATE INDEX "idx_rank_snapshots_keyword_date" ON "rank_snapshots" USING btree ("keyword_id","date");--> statement-breakpoint
CREATE INDEX "idx_rank_snapshots_app_keyword" ON "rank_snapshots" USING btree ("app_id","keyword_id");--> statement-breakpoint
CREATE INDEX "idx_listing_snapshots_app_date" ON "listing_snapshots" USING btree ("app_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "idx_changelog_app_timestamp" ON "change_log" USING btree ("app_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_discovered_kw_project" ON "discovered_keywords" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_discovered_kw_source_app" ON "discovered_keywords" USING btree ("source_app_id");