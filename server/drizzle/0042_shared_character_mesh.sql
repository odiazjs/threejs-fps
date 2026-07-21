-- All store character skins share one body FBX; textures will differentiate skins later.
UPDATE "store_items"
SET "asset_file" = 'meshy_character_idle.fbx'
WHERE "type" = 'character_skin';
