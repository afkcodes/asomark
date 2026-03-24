CREATE TABLE "keyword_related_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keyword_snapshot_id" uuid NOT NULL,
	"related_query" text NOT NULL,
	"category" text NOT NULL,
	"value" text NOT NULL,
	"position" integer,
	"snapshot_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "keyword_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keyword_id" uuid NOT NULL,
	"platform" text,
	"region" text DEFAULT 'us',
	"snapshot_date" date NOT NULL,
	"trends_interest_score" real,
	"trend_direction" text,
	"trends_timeline_json" jsonb,
	"top_ten_title_opt_rate" real,
	"top_ten_avg_rating" real,
	"top_ten_avg_installs" real,
	"top_ten_app_ids" jsonb,
	"result_count" integer,
	"difficulty_score" real,
	"difficulty_signals" jsonb,
	"difficulty_mode" text,
	"google_suggest_position" integer,
	"playstore_suggest_position" integer,
	"youtube_suggest_position" integer,
	"search_volume_proxy" real,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "keyword_suggest_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_keyword" text NOT NULL,
	"suggested_keyword" text NOT NULL,
	"source" text NOT NULL,
	"position" integer NOT NULL,
	"region" text DEFAULT 'us',
	"snapshot_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "keywords" ADD COLUMN "difficulty_signals" jsonb;--> statement-breakpoint
ALTER TABLE "keywords" ADD COLUMN "difficulty_mode" text;--> statement-breakpoint
ALTER TABLE "keyword_related_queries" ADD CONSTRAINT "keyword_related_queries_keyword_snapshot_id_keyword_snapshots_id_fk" FOREIGN KEY ("keyword_snapshot_id") REFERENCES "public"."keyword_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_snapshots" ADD CONSTRAINT "keyword_snapshots_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_kw_related_snapshot" ON "keyword_related_queries" USING btree ("keyword_snapshot_id");--> statement-breakpoint
CREATE INDEX "idx_kw_related_date" ON "keyword_related_queries" USING btree ("snapshot_date");--> statement-breakpoint
CREATE INDEX "idx_kw_snapshots_keyword_date" ON "keyword_snapshots" USING btree ("keyword_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "idx_kw_snapshots_date" ON "keyword_snapshots" USING btree ("snapshot_date");--> statement-breakpoint
CREATE INDEX "idx_suggest_parent_date" ON "keyword_suggest_history" USING btree ("parent_keyword","snapshot_date");--> statement-breakpoint
CREATE INDEX "idx_suggest_keyword_source" ON "keyword_suggest_history" USING btree ("suggested_keyword","source");