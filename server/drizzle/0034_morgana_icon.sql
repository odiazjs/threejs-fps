-- Morgana catalog portrait icon.
UPDATE "characters" SET
	"icon_file" = 'characters/morgana_icon.png',
	"updated_at" = NOW()
WHERE "id" = 'morgana';
