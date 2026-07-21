-- Switch shared store character body to the quads Meshy FBX.
UPDATE "store_items"
SET "asset_file" = 'meshy_character_idle_quads.fbx'
WHERE "type" = 'character_skin';
