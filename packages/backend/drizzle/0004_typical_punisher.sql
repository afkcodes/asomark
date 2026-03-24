CREATE TABLE "listing_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"variant_index" integer DEFAULT 0 NOT NULL,
	"strategy_name" text DEFAULT 'manual' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"short_description" text DEFAULT '' NOT NULL,
	"full_description" text DEFAULT '' NOT NULL,
	"keywords_used" json,
	"keyword_placement_map" json,
	"scores" json,
	"rationale" text,
	"warnings" json,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"generation_method" text DEFAULT 'manual' NOT NULL,
	"keywords_used_json" json,
	"competitors_analyzed_json" json,
	"metadata" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing_drafts" ADD COLUMN "active_variant_id" uuid;--> statement-breakpoint
ALTER TABLE "listing_drafts" ADD COLUMN "source_version_id" uuid;--> statement-breakpoint
ALTER TABLE "listing_variants" ADD CONSTRAINT "listing_variants_version_id_listing_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."listing_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_variants" ADD CONSTRAINT "listing_variants_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_versions" ADD CONSTRAINT "listing_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;