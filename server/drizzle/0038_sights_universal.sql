-- Sights equip on any weapon; clear legacy per-weapon compatibility filters.
UPDATE "weapon_unlockables"
SET "compatible_weapon_ids" = NULL,
    "updated_at" = NOW()
WHERE "type" = 'sight';
