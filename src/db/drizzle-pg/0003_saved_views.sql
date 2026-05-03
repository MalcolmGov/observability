CREATE TABLE IF NOT EXISTS "saved_views" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"page" text NOT NULL,
	"name" text NOT NULL,
	"state_json" text DEFAULT '{}' NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saved_views_tenant_page_name_uidx" ON "saved_views" USING btree ("tenant_id","page","name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saved_views_tenant_page_idx" ON "saved_views" USING btree ("tenant_id","page");
