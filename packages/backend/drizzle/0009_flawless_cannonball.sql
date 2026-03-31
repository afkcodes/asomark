ALTER TABLE "projects" ADD COLUMN "app_description" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "key_features" json;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "target_audience" text;