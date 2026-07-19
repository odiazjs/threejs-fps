-- Olrick face mesh + catalog icon (asset filenames use "orlick").
UPDATE "characters" SET
	"face_model_file" = 'characters/orlick_face.fbx',
	"icon_file" = 'characters/orlick_icon.png',
	"updated_at" = NOW()
WHERE "id" = 'olrick';
