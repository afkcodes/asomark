CREATE TABLE "site_audit_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"url" text NOT NULL,
	"status_code" integer,
	"load_time_ms" integer,
	"title" text,
	"title_length" integer,
	"meta_description" text,
	"meta_description_length" integer,
	"h1_count" integer,
	"h1_text" text,
	"image_count" integer,
	"images_without_alt" integer,
	"internal_links" integer,
	"external_links" integer,
	"broken_links" json,
	"word_count" integer,
	"has_canonical" integer,
	"canonical_url" text,
	"has_robots_meta" integer,
	"schema_types" json,
	"issues" json,
	"score" integer
);
--> statement-breakpoint
CREATE TABLE "site_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"site_url" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"pages_crawled" integer DEFAULT 0 NOT NULL,
	"issues_found" integer DEFAULT 0 NOT NULL,
	"score" integer,
	"summary" json,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "site_audit_pages" ADD CONSTRAINT "site_audit_pages_audit_id_site_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."site_audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_audits" ADD CONSTRAINT "site_audits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_pages_audit" ON "site_audit_pages" USING btree ("audit_id");