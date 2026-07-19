-- Switch Garla's face head to the authored GLB.
UPDATE "characters" SET
	"face_model_file" = 'characters/garla_face.glb',
	"updated_at" = NOW()
WHERE "id" = 'garla';
