INSERT INTO "store_items" ("id", "type", "name", "description", "cost", "default_unlocked", "enabled", "sort_order", "asset_file")
VALUES
	('tech_nature', 'new_character', 'Tech Nature', 'Bio-circuit overgrowth chassis. Living tech meets field ops.', 2500, false, true, 30, 'character_tech_nature.fbx'),
	('magma_fire', 'new_character', 'Magma Fire', 'Volcanic-core combat suit. Heat-scarred plates for elite operators.', 3500, false, true, 40, 'character_magma_fire.fbx'),
	('pink_butterfly', 'new_character', 'Pink Butterfly', 'Iridescent parade armor. Soft palette, hard edges.', 4000, false, true, 50, 'character_pink_butterfly.fbx')
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
