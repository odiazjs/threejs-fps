-- Per-character face mount: scale + Y/Z offsets (Mixamo cm space after head normalize).
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "face_scale" real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "face_offset_y" real DEFAULT -6 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "face_offset_z" real DEFAULT -2 NOT NULL;--> statement-breakpoint

-- Seed current look as the baseline for existing operators (tweak per-row as needed).
UPDATE "characters" SET
	"face_scale" = 1,
	"face_offset_y" = -6,
	"face_offset_z" = -2,
	"updated_at" = NOW()
WHERE "id" IN ('garla', 'olrick', 'morgana', 'p_anne');
