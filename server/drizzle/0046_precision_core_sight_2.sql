-- Precision Core uses the second physical optic (sight_2).
-- Rether Pulse remains sight_1.

UPDATE "weapon_unlockables"
SET
	"description" = 'Compact precision rail optic. Mounts the sight_2 physical model on compatible weapons.',
	"asset_key" = 'sight_2',
	"icon_file" = 'weapons/red_dot_2.png',
	"updated_at" = NOW()
WHERE "id" = 'precision_core';

UPDATE "weapon_unlockables"
SET
	"description" = 'Starter rail optic. Mounts the sight_1 physical holographic model on compatible weapons.',
	"asset_key" = 'sight_1',
	"updated_at" = NOW()
WHERE "id" = 'rether_pulse';
