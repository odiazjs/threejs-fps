-- P. Anne catalog portrait + face head mesh.
UPDATE "characters" SET
	"face_model_file" = 'characters/panne_face.fbx',
	"icon_file" = 'characters/panne_icon.png',
	"updated_at" = NOW()
WHERE "id" = 'p_anne';
