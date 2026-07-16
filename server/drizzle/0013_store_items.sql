CREATE TABLE IF NOT EXISTS "store_items" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"name" varchar(64) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL,
	"default_unlocked" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"asset_file" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_store_unlocks" (
	"user_id" text NOT NULL,
	"item_id" text NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_store_unlocks_pkey" PRIMARY KEY("user_id","item_id")
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_store_unlocks" ADD CONSTRAINT "user_store_unlocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_store_unlocks" ADD CONSTRAINT "user_store_unlocks_item_id_store_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."store_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "store_items_type_idx" ON "store_items" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_store_unlocks_user_id_idx" ON "user_store_unlocks" USING btree ("user_id");--> statement-breakpoint
INSERT INTO "store_items" ("id", "type", "name", "description", "cost", "default_unlocked", "enabled", "sort_order", "asset_file")
VALUES
	('basic', 'new_character', 'Basic Operator', 'Standard issue field suit. Unlocked by default.', 0, true, true, 10, 'character_basic_tpose.fbx'),
	('silver', 'new_character', 'Silver Operator', 'Chrome-finished combat chassis. Prestige cosmetics unlock.', 1000, false, true, 20, 'character_silver_tpose.fbx')
ON CONFLICT ("id") DO UPDATE SET
	"type" = EXCLUDED."type",
	"name" = EXCLUDED."name",
	"description" = EXCLUDED."description",
	"cost" = EXCLUDED."cost",
	"default_unlocked" = EXCLUDED."default_unlocked",
	"enabled" = EXCLUDED."enabled",
	"sort_order" = EXCLUDED."sort_order",
	"asset_file" = EXCLUDED."asset_file",
	"updated_at" = now();--> statement-breakpoint
INSERT INTO "user_store_unlocks" ("user_id", "item_id", "unlocked_at")
SELECT "user_id", "character_id", "unlocked_at"
FROM "user_character_unlocks"
WHERE EXISTS (SELECT 1 FROM "store_items" si WHERE si."id" = "user_character_unlocks"."character_id")
ON CONFLICT DO NOTHING;--> statement-breakpoint
DROP TABLE IF EXISTS "user_character_unlocks";
