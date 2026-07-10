ALTER TABLE "users" ADD COLUMN "plasma_minerals" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "users" SET "plasma_minerals" = 200 WHERE "plasma_minerals" = 0;
