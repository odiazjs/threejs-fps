-- Steve face head mesh.
UPDATE "characters" SET
	"face_model_file" = 'characters/steve_face.fbx',
	"updated_at" = NOW()
WHERE "id" = 'steve';
