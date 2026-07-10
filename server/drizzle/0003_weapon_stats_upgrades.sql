CREATE TABLE "user_weapon_upgrades" (
	"user_id" text NOT NULL,
	"weapon_id" text NOT NULL,
	"damage_level" integer DEFAULT 0 NOT NULL,
	"recoil_level" integer DEFAULT 0 NOT NULL,
	"range_level" integer DEFAULT 0 NOT NULL,
	"magazine_level" integer DEFAULT 0 NOT NULL,
	"reload_level" integer DEFAULT 0 NOT NULL,
	"ads_level" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_weapon_upgrades_user_id_weapon_id_pk" PRIMARY KEY("user_id","weapon_id")
);
--> statement-breakpoint
ALTER TABLE "weapons" ADD COLUMN "base_damage" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "weapons" ADD COLUMN "base_recoil" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "weapons" ADD COLUMN "base_range" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "weapons" ADD COLUMN "base_magazine_size" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "weapons" ADD COLUMN "base_reload_sec" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "weapons" ADD COLUMN "base_ads_sec" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "weapons" SET
	"base_damage" = 11, "base_recoil" = 55, "base_range" = 75,
	"base_magazine_size" = 12, "base_reload_sec" = 1.5, "base_ads_sec" = 0.18
WHERE "id" = 'pistol';--> statement-breakpoint
UPDATE "weapons" SET
	"base_damage" = 7, "base_recoil" = 35, "base_range" = 75,
	"base_magazine_size" = 30, "base_reload_sec" = 2.0, "base_ads_sec" = 0.2
WHERE "id" = 'plasma_rifle';--> statement-breakpoint
UPDATE "weapons" SET
	"base_damage" = 90, "base_recoil" = 85, "base_range" = 220,
	"base_magazine_size" = 1, "base_reload_sec" = 2.75, "base_ads_sec" = 0.35
WHERE "id" = 'sniper_rifle';--> statement-breakpoint
UPDATE "weapons" SET
	"base_damage" = 44, "base_recoil" = 0, "base_range" = 2.8,
	"base_magazine_size" = 1, "base_reload_sec" = 0, "base_ads_sec" = 0
WHERE "id" = 'katana';--> statement-breakpoint
ALTER TABLE "user_weapon_upgrades" ADD CONSTRAINT "user_weapon_upgrades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_weapon_upgrades" ADD CONSTRAINT "user_weapon_upgrades_weapon_id_weapons_id_fk" FOREIGN KEY ("weapon_id") REFERENCES "public"."weapons"("id") ON DELETE cascade ON UPDATE no action;
