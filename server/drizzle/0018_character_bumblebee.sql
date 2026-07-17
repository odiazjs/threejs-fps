INSERT INTO "store_items" ("id", "type", "name", "description", "cost", "default_unlocked", "enabled", "sort_order", "asset_file")
VALUES
	('bumblebee', 'new_character', 'Bumblebee', 'Striped strike chassis. Bold yellow-black field kit for high-visibility operators.', 10000, false, true, 60, 'character_bumblebee.fbx')
ON CONFLICT ("id") DO UPDATE SET
	"type" = EXCLUDED."type",
	"name" = EXCLUDED."name",
	"description" = EXCLUDED."description",
	"cost" = EXCLUDED."cost",
	"default_unlocked" = EXCLUDED."default_unlocked",
	"enabled" = EXCLUDED."enabled",
	"sort_order" = EXCLUDED."sort_order",
	"asset_file" = EXCLUDED."asset_file",
	"updated_at" = now();
