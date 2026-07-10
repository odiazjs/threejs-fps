ALTER TABLE "weapons" ADD COLUMN "base_fire_rate" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_weapon_upgrades" ADD COLUMN "fire_rate_level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "weapons" SET "base_fire_rate" = 5 WHERE "id" = 'pistol';--> statement-breakpoint
UPDATE "weapons" SET "base_fire_rate" = 12 WHERE "id" = 'plasma_rifle';--> statement-breakpoint
UPDATE "weapons" SET "base_fire_rate" = 1.1 WHERE "id" = 'sniper_rifle';--> statement-breakpoint
UPDATE "weapons" SET "base_fire_rate" = 2 WHERE "id" = 'katana';
