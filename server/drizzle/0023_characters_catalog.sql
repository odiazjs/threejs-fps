-- Operator characters are their own catalog + per-user selection (not store_items).

CREATE TABLE IF NOT EXISTS "characters" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"face_model_file" text NOT NULL,
	"body_asset_file" text,
	"perk_key" text NOT NULL,
	"perk_value" integer DEFAULT 0 NOT NULL,
	"perk_label" text DEFAULT '' NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL,
	"default_unlocked" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_character" (
	"user_id" text PRIMARY KEY NOT NULL,
	"character_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "user_character" ADD CONSTRAINT "user_character_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "user_character" ADD CONSTRAINT "user_character_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "user_character_character_id_idx" ON "user_character" USING btree ("character_id");--> statement-breakpoint

INSERT INTO "characters" (
	"id",
	"name",
	"description",
	"face_model_file",
	"body_asset_file",
	"perk_key",
	"perk_value",
	"perk_label",
	"cost",
	"default_unlocked",
	"enabled",
	"sort_order"
)
VALUES
	(
		'garla',
		'Garla',
		'Scarred operator with a digital combat visage.',
		'characters/character_garla.fbx',
		'character_basic_tpose.fbx',
		'weapon_damage_flat',
		1,
		'+1 damage with all weapons',
		0,
		true,
		true,
		10
	),
	(
		'olrick',
		'Olrick',
		'Stoic heavy — face module pending.',
		'characters/character_garla.fbx',
		'character_basic_tpose.fbx',
		'weapon_damage_flat',
		0,
		'Perk coming soon',
		1500,
		false,
		true,
		20
	),
	(
		'morgana',
		'Morgana',
		'Shadow specialist — face module pending.',
		'characters/character_garla.fbx',
		'character_basic_tpose.fbx',
		'weapon_damage_flat',
		0,
		'Perk coming soon',
		2500,
		false,
		true,
		30
	),
	(
		'p_anne',
		'P. Anne',
		'Precision striker — face module pending.',
		'characters/character_garla.fbx',
		'character_basic_tpose.fbx',
		'weapon_damage_flat',
		0,
		'Perk coming soon',
		3500,
		false,
		true,
		40
	)
ON CONFLICT ("id") DO UPDATE SET
	"name" = EXCLUDED."name",
	"description" = EXCLUDED."description",
	"face_model_file" = EXCLUDED."face_model_file",
	"body_asset_file" = EXCLUDED."body_asset_file",
	"perk_key" = EXCLUDED."perk_key",
	"perk_value" = EXCLUDED."perk_value",
	"perk_label" = EXCLUDED."perk_label",
	"cost" = EXCLUDED."cost",
	"default_unlocked" = EXCLUDED."default_unlocked",
	"enabled" = EXCLUDED."enabled",
	"sort_order" = EXCLUDED."sort_order",
	"updated_at" = NOW();--> statement-breakpoint

-- Default selected operator for every existing user.
INSERT INTO "user_character" ("user_id", "character_id", "updated_at")
SELECT "id", 'garla', NOW()
FROM "users"
ON CONFLICT ("user_id") DO NOTHING;--> statement-breakpoint

-- Operators are not store catalog rows.
DELETE FROM "user_store_unlocks"
WHERE "item_id" IN ('garla', 'olrick', 'morgana', 'p_anne');--> statement-breakpoint

DELETE FROM "store_items"
WHERE "id" IN ('garla', 'olrick', 'morgana', 'p_anne');--> statement-breakpoint

ALTER TABLE "store_items" DROP COLUMN IF EXISTS "face_model_file";--> statement-breakpoint
ALTER TABLE "store_items" DROP COLUMN IF EXISTS "perk_key";--> statement-breakpoint
ALTER TABLE "store_items" DROP COLUMN IF EXISTS "perk_value";--> statement-breakpoint
ALTER TABLE "store_items" DROP COLUMN IF EXISTS "perk_label";
