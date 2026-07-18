-- Store sells body skins again. Face+perk operators are not store items (separate page later).

UPDATE "store_items"
SET
	"type" = 'character_skin',
	"enabled" = true,
	"default_unlocked" = CASE WHEN "id" = 'basic' THEN true ELSE "default_unlocked" END,
	"description" = CASE "id"
		WHEN 'basic' THEN 'Standard issue field suit. Unlocked by default.'
		WHEN 'silver' THEN 'Chrome-finished combat chassis. Prestige cosmetics unlock.'
		WHEN 'tech_nature' THEN 'Bio-circuit overgrowth chassis. Living tech meets field ops.'
		WHEN 'magma_fire' THEN 'Volcanic-core combat suit. Heat-scarred plates for elite operators.'
		WHEN 'pink_butterfly' THEN 'Iridescent parade armor. Soft palette, hard edges.'
		WHEN 'bumblebee' THEN 'Striped strike chassis. Bold yellow-black field kit for high-visibility operators.'
		ELSE "description"
	END,
	"sort_order" = CASE "id"
		WHEN 'basic' THEN 10
		WHEN 'silver' THEN 20
		WHEN 'tech_nature' THEN 30
		WHEN 'magma_fire' THEN 40
		WHEN 'pink_butterfly' THEN 50
		WHEN 'bumblebee' THEN 60
		ELSE "sort_order"
	END,
	"face_model_file" = NULL,
	"perk_key" = NULL,
	"perk_value" = NULL,
	"perk_label" = NULL,
	"updated_at" = NOW()
WHERE "id" IN ('basic', 'silver', 'tech_nature', 'magma_fire', 'pink_butterfly', 'bumblebee');--> statement-breakpoint

-- Hide operator characters from the store catalog.
UPDATE "store_items"
SET
	"type" = 'new_character',
	"enabled" = false,
	"default_unlocked" = false,
	"updated_at" = NOW()
WHERE "id" IN ('garla', 'olrick', 'morgana', 'p_anne');--> statement-breakpoint

ALTER TABLE "users" ALTER COLUMN "selected_character_id" SET DEFAULT 'basic';--> statement-breakpoint

-- Equipped store selection is a skin id again.
UPDATE "users"
SET
	"selected_character_id" = 'basic',
	"updated_at" = NOW()
WHERE "selected_character_id" IN ('garla', 'olrick', 'morgana', 'p_anne')
	OR "selected_character_id" IS NULL
	OR "selected_character_id" NOT IN (
		'basic', 'silver', 'tech_nature', 'magma_fire', 'pink_butterfly', 'bumblebee'
	);
