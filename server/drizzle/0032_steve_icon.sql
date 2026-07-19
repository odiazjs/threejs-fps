-- Steve catalog portrait icon.
UPDATE "characters" SET
	"icon_file" = 'characters/steve_icon.png',
	"updated_at" = NOW()
WHERE "id" = 'steve';
