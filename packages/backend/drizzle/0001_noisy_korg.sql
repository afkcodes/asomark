CREATE TABLE "discovered_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"source_app_id" uuid,
	"keyword" text NOT NULL,
	"rank" integer,
	"my_rank" integer,
	"total_results" integer,
	"source" text,
	"is_tracking" boolean DEFAULT false NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovered_keywords_project_id_keyword_unique" UNIQUE("project_id","keyword")
);
--> statement-breakpoint
CREATE TABLE "project_competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"competitor_app_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_competitors_project_id_competitor_app_id_unique" UNIQUE("project_id","competitor_app_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"name" text NOT NULL,
	"region" text DEFAULT 'us' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "keywords" ADD COLUMN "region" text DEFAULT 'us';--> statement-breakpoint
ALTER TABLE "keywords" ADD COLUMN "trend_direction" text;--> statement-breakpoint
ALTER TABLE "keywords" ADD COLUMN "suggest_position" integer;--> statement-breakpoint
ALTER TABLE "keywords" ADD COLUMN "title_opt_rate" real;--> statement-breakpoint
ALTER TABLE "rank_snapshots" ADD COLUMN "region" text DEFAULT 'us';--> statement-breakpoint
ALTER TABLE "discovered_keywords" ADD CONSTRAINT "discovered_keywords_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovered_keywords" ADD CONSTRAINT "discovered_keywords_source_app_id_apps_id_fk" FOREIGN KEY ("source_app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_competitors" ADD CONSTRAINT "project_competitors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_competitors" ADD CONSTRAINT "project_competitors_competitor_app_id_apps_id_fk" FOREIGN KEY ("competitor_app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;