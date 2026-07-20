-- Per-weapon equipped sights (survives reload; independent of loadout rows).
CREATE TABLE IF NOT EXISTS "user_weapon_sights" (
	"user_id" text NOT NULL,
	"weapon_id" text NOT NULL,
	"sight_id" text NOT NULL,
	"equipped_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_weapon_sights_user_id_weapon_id_pk" PRIMARY KEY("user_id","weapon_id")
);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "user_weapon_sights" ADD CONSTRAINT "user_weapon_sights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "user_weapon_sights" ADD CONSTRAINT "user_weapon_sights_weapon_id_weapons_id_fk" FOREIGN KEY ("weapon_id") REFERENCES "public"."weapons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "user_weapon_sights" ADD CONSTRAINT "user_weapon_sights_sight_id_weapon_unlockables_id_fk" FOREIGN KEY ("sight_id") REFERENCES "public"."weapon_unlockables"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- Backfill from loadout slot columns (most recently updated loadout wins per weapon).
INSERT INTO "user_weapon_sights" ("user_id", "weapon_id", "sight_id", "equipped_at")
SELECT DISTINCT ON ("user_id", "weapon_id")
	"user_id",
	"weapon_id",
	"sight_id",
	"updated_at"
FROM (
	SELECT
		"user_id",
		"primary_weapon_id" AS "weapon_id",
		"primary_sight_id" AS "sight_id",
		"updated_at"
	FROM "weapon_loadouts"
	WHERE "primary_sight_id" IS NOT NULL
	UNION ALL
	SELECT
		"user_id",
		"secondary_weapon_id" AS "weapon_id",
		"secondary_sight_id" AS "sight_id",
		"updated_at"
	FROM "weapon_loadouts"
	WHERE "secondary_sight_id" IS NOT NULL
) AS "src"
ORDER BY "user_id", "weapon_id", "updated_at" DESC
ON CONFLICT ("user_id", "weapon_id") DO NOTHING;
