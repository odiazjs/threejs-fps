CREATE TYPE "public"."weapon_kind" AS ENUM('gun', 'melee');--> statement-breakpoint
CREATE TABLE "weapons" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" varchar(32) NOT NULL,
	"kind" "weapon_kind" NOT NULL,
	"loadout_eligible" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
INSERT INTO "weapons" ("id", "display_name", "kind", "loadout_eligible", "enabled", "sort_order") VALUES
	('pistol', 'Pistol', 'gun', true, true, 10),
	('plasma_rifle', 'Plasma Rifle', 'gun', true, true, 20),
	('sniper_rifle', 'Sniper Rifle', 'gun', true, true, 30),
	('katana', 'Katana', 'melee', false, true, 100);--> statement-breakpoint
ALTER TABLE "weapon_loadouts" ADD CONSTRAINT "weapon_loadouts_primary_weapon_id_weapons_id_fk" FOREIGN KEY ("primary_weapon_id") REFERENCES "public"."weapons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weapon_loadouts" ADD CONSTRAINT "weapon_loadouts_secondary_weapon_id_weapons_id_fk" FOREIGN KEY ("secondary_weapon_id") REFERENCES "public"."weapons"("id") ON DELETE restrict ON UPDATE no action;
