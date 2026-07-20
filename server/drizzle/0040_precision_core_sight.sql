-- Seed: Precision Core digital sight.
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
	'precision_core',
	'sight',
	'PRECISION CORE',
	'Compact precision reticle. Crisp aim point when aiming down sights.',
	1500,
	false,
	true,
	20,
	'weapons/red_dot_2.png',
	'red_dot_2',
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
