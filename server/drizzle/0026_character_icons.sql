-- Catalog portrait icons for the Characters page (under /images/).
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "icon_file" text;--> statement-breakpoint

UPDATE "characters" SET
	"icon_file" = CASE "id"
		WHEN 'garla' THEN 'characters/garla_icon.png'
		ELSE "icon_file"
	END,
	"updated_at" = NOW()
WHERE "id" = 'garla';
