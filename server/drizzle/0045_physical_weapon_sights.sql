-- Sync unlockable sights to physical 3D optic assets (rail-mounted FBX).
-- asset_key maps to /3d/weapons/sights/{asset_key}.fbx on the client.

UPDATE "weapon_unlockables"
SET
	"description" = 'Starter rail optic. Mounts a physical holographic sight on compatible weapons.',
	"default_unlocked" = true,
	"asset_key" = 'sight_1',
	"icon_file" = 'weapons/red_dot_1.png',
	"updated_at" = NOW()
WHERE "id" = 'rether_pulse';

UPDATE "weapon_unlockables"
SET
	"description" = 'Compact precision rail optic. Mounts a physical sight model on compatible weapons.',
	"asset_key" = 'sight_1',
	"icon_file" = 'weapons/red_dot_2.png',
	"updated_at" = NOW()
WHERE "id" = 'precision_core';
