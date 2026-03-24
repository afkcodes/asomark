CREATE TABLE "apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_name" text,
	"bundle_id" text,
	"name" text NOT NULL,
	"platform" text NOT NULL,
	"is_ours" boolean DEFAULT false NOT NULL,
	"category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term" text NOT NULL,
	"platform" text,
	"search_volume_est" real,
	"difficulty_est" real,
	"last_updated" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rank_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid,
	"keyword_id" uuid,
	"platform" text,
	"rank" integer,
	"date" date,
	"category_rank" integer
);
--> statement-breakpoint
CREATE TABLE "listing_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid,
	"title" text,
	"subtitle" text,
	"short_desc" text,
	"long_desc" text,
	"icon_url" text,
	"screenshot_urls" json,
	"video_url" text,
	"rating" real,
	"review_count" integer,
	"installs_text" text,
	"version" text,
	"app_size" text,
	"snapshot_date" date,
	"diff_from_previous" text
);
--> statement-breakpoint
CREATE TABLE "experiment_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid,
	"field_changed" text,
	"old_value" text,
	"new_value" text,
	"change_date" text,
	"impact_metrics_json" json
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid,
	"platform" text,
	"type" text,
	"status" text,
	"variants_json" json,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"results_json" json,
	"winner" text,
	"applied" boolean,
	"confidence" real
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid,
	"platform" text,
	"author" text,
	"rating" integer,
	"text" text,
	"date" date,
	"sentiment_score" real,
	"topics_json" json,
	"language" text
);
--> statement-breakpoint
CREATE TABLE "keyword_opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keyword_id" uuid,
	"app_id" uuid,
	"current_rank" integer,
	"potential_rank" integer,
	"opportunity_score" real,
	"suggested_action" text,
	"created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "health_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid,
	"overall_score" integer,
	"breakdown_json" json,
	"date" date
);
--> statement-breakpoint
CREATE TABLE "change_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid,
	"change_type" text,
	"field" text,
	"old_value" text,
	"new_value" text,
	"source" text,
	"metadata_json" json,
	"timestamp" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rank_correlations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"change_log_id" uuid,
	"keyword_id" uuid,
	"rank_before" integer,
	"rank_after" integer,
	"cvr_before" real,
	"cvr_after" real,
	"days_to_effect" integer,
	"confidence" real,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "strategy_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid,
	"action_type" text,
	"reasoning" text,
	"suggested_change" text,
	"authority_level" text,
	"status" text,
	"created_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"executed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scrape_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text,
	"target" text,
	"status" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"records_scraped" integer,
	"errors" text
);
--> statement-breakpoint
ALTER TABLE "rank_snapshots" ADD CONSTRAINT "rank_snapshots_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_snapshots" ADD CONSTRAINT "rank_snapshots_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_snapshots" ADD CONSTRAINT "listing_snapshots_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_changes" ADD CONSTRAINT "experiment_changes_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_opportunities" ADD CONSTRAINT "keyword_opportunities_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_opportunities" ADD CONSTRAINT "keyword_opportunities_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_scores" ADD CONSTRAINT "health_scores_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_log" ADD CONSTRAINT "change_log_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_correlations" ADD CONSTRAINT "rank_correlations_change_log_id_change_log_id_fk" FOREIGN KEY ("change_log_id") REFERENCES "public"."change_log"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_correlations" ADD CONSTRAINT "rank_correlations_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_log" ADD CONSTRAINT "strategy_log_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;