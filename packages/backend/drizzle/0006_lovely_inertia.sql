CREATE TABLE "seo_content_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content_type" text NOT NULL,
	"cluster" text,
	"target_keywords" json,
	"outline" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"metadata" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"source" text NOT NULL,
	"search_intent" text,
	"content_type" text,
	"cluster" text,
	"priority" text,
	"content_idea" text,
	"estimated_volume" text,
	"is_tracking" boolean DEFAULT false NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seo_keywords_project_id_keyword_unique" UNIQUE("project_id","keyword")
);
--> statement-breakpoint
ALTER TABLE "seo_content_plans" ADD CONSTRAINT "seo_content_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_keywords" ADD CONSTRAINT "seo_keywords_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;