-- Catalog of unlockable weapon attachments (sights, etc.).
CREATE TABLE IF NOT EXISTS "weapon_unlockables" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"name" varchar(64) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL,
	"default_unlocked" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"icon_file" text,
	"asset_key" text,
	"compatible_weapon_ids" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_weapon_unlockables" (
	"user_id" text NOT NULL,
	"unlockable_id" text NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_weapon_unlockables_user_id_unlockable_id_pk" PRIMARY KEY("user_id","unlockable_id")
);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "user_weapon_unlockables" ADD CONSTRAINT "user_weapon_unlockables_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "user_weapon_unlockables" ADD CONSTRAINT "user_weapon_unlockables_unlockable_id_weapon_unlockables_id_fk" FOREIGN KEY ("unlockable_id") REFERENCES "public"."weapon_unlockables"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

ALTER TABLE "weapon_loadouts" ADD COLUMN IF NOT EXISTS "primary_sight_id" text;--> statement-breakpoint
ALTER TABLE "weapon_loadouts" ADD COLUMN IF NOT EXISTS "secondary_sight_id" text;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "weapon_loadouts" ADD CONSTRAINT "weapon_loadouts_primary_sight_id_weapon_unlockables_id_fk" FOREIGN KEY ("primary_sight_id") REFERENCES "public"."weapon_unlockables"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "weapon_loadouts" ADD CONSTRAINT "weapon_loadouts_secondary_sight_id_weapon_unlockables_id_fk" FOREIGN KEY ("secondary_sight_id") REFERENCES "public"."weapon_unlockables"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- Seed: Rether Pulse digital sight (pistol).
INSERT INTO "weapon_unlockables" (
	"id",
	"type",
	"name",
	"description",
	"cost",
	"default_unlocked",
	"enabled",
	"sort_order",
	"icon_file",
	"asset_key",
	"compatible_weapon_ids",
	"updated_at"
)
VALUES (
	'rether_pulse',
	'sight',
	'RETHER PULSE',
	'Neon holographic ring optic. Projects a cyan aim point when aiming down sights.',
	1500,
	false,
	true,
	10,
	'weapons/red_dot_1.png',
	'red_dot_1',
	NULL,
	NOW()
)
ON CONFLICT ("id") DO UPDATE SET
	"type" = EXCLUDED."type",
	"name" = EXCLUDED."name",
	"description" = EXCLUDED."description",
	"cost" = EXCLUDED."cost",
	"default_unlocked" = EXCLUDED."default_unlocked",
	"enabled" = EXCLUDED."enabled",
	"sort_order" = EXCLUDED."sort_order",
	"icon_file" = EXCLUDED."icon_file",
	"asset_key" = EXCLUDED."asset_key",
	"compatible_weapon_ids" = EXCLUDED."compatible_weapon_ids",
	"updated_at" = NOW();
