-- Seed: Sniper Precision physical rail scope (sniper_sight_1).
INSERT INTO "weapon_unlockables" (
	"id",
	"type",
	"name",
	"description",
	"cost",
	"default_unlocked",
	"enabled",
	"sort_order",
	"icon_file",
	"asset_key",
	"compatible_weapon_ids",
	"updated_at"
)
VALUES (
	'sniper_precision',
	'sight',
	'SNIPER PRECISION',
	'Long-range rail scope. Mounts the sniper_sight_1 physical optic on compatible weapons.',
	2000,
	false,
	true,
	30,
	'weapons/red_dot_2.png',
	'sniper_sight_1',
	NULL,
	NOW()
)
ON CONFLICT ("id") DO UPDATE SET
	"type" = EXCLUDED."type",
	"name" = EXCLUDED."name",
	"description" = EXCLUDED."description",
	"cost" = EXCLUDED."cost",
	"default_unlocked" = EXCLUDED."default_unlocked",
	"enabled" = EXCLUDED."enabled",
	"sort_order" = EXCLUDED."sort_order",
	"icon_file" = EXCLUDED."icon_file",
	"asset_key" = EXCLUDED."asset_key",
	"compatible_weapon_ids" = EXCLUDED."compatible_weapon_ids",
	"updated_at" = NOW();
