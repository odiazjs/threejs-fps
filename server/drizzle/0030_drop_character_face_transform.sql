-- Face mount scale/offsets live in client `characterFaces.ts`, not the DB.
ALTER TABLE "characters" DROP COLUMN IF EXISTS "face_scale";--> statement-breakpoint
ALTER TABLE "characters" DROP COLUMN IF EXISTS "face_offset_y";--> statement-breakpoint
ALTER TABLE "characters" DROP COLUMN IF EXISTS "face_offset_z";
