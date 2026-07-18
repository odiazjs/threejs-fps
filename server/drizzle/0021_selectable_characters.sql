-- Selectable characters: face head mesh + single perk (body chassis shared for now).
ALTER TABLE "store_items" ADD COLUMN IF NOT EXISTS "face_model_file" text;--> statement-breakpoint
ALTER TABLE "store_items" ADD COLUMN IF NOT EXISTS "perk_key" text;--> statement-breakpoint
ALTER TABLE "store_items" ADD COLUMN IF NOT EXISTS "perk_value" integer;--> statement-breakpoint
ALTER TABLE "store_items" ADD COLUMN IF NOT EXISTS "perk_label" text;--> statement-breakpoint

-- Default equipped character is Garla.
ALTER TABLE "users" ALTER COLUMN "selected_character_id" SET DEFAULT 'garla';--> statement-breakpoint

-- Retire legacy body-mesh "characters" from the selectable catalog (keep rows for history).
UPDATE "store_items"
SET
	"enabled" = false,
	"default_unlocked" = false,
	"updated_at" = NOW()
WHERE "id" IN ('basic', 'silver', 'tech_nature', 'magma_fire', 'pink_butterfly', 'bumblebee')
	AND "type" = 'new_character';--> statement-breakpoint

INSERT INTO "store_items" (
	"id",
	"type",
	"name",
	"description",
	"cost",
	"default_unlocked",
	"enabled",
	"sort_order",
	"asset_file",
	"face_model_file",
	"perk_key",
	"perk_value",
	"perk_label"
)
VALUES
	(
		'garla',
		'new_character',
		'Garla',
		'Scarred operator with a digital combat visage.',
		0,
		true,
		true,
		10,
		'character_basic_tpose.fbx',
		'characters/character_garla.fbx',
		'weapon_damage_flat',
		1,
		'+1 damage with all weapons'
	),
	(
		'olrick',
		'new_character',
		'Olrick',
		'Stoic heavy — face module pending.',
		1500,
		false,
		true,
		20,
		'character_basic_tpose.fbx',
		'characters/character_garla.fbx',
		'weapon_damage_flat',
		0,
		'Perk coming soon'
	),
	(
		'morgana',
		'new_character',
		'Morgana',
		'Shadow specialist — face module pending.',
		2500,
		false,
		true,
		30,
		'character_basic_tpose.fbx',
		'characters/character_garla.fbx',
		'weapon_damage_flat',
		0,
		'Perk coming soon'
	),
	(
		'p_anne',
		'new_character',
		'P. Anne',
		'Precision striker — face module pending.',
		3500,
		false,
		true,
		40,
		'character_basic_tpose.fbx',
		'characters/character_garla.fbx',
		'weapon_damage_flat',
		0,
		'Perk coming soon'
	)
ON CONFLICT ("id") DO UPDATE SET
	"type" = EXCLUDED."type",
	"name" = EXCLUDED."name",
	"description" = EXCLUDED."description",
	"cost" = EXCLUDED."cost",
	"default_unlocked" = EXCLUDED."default_unlocked",
	"enabled" = EXCLUDED."enabled",
	"sort_order" = EXCLUDED."sort_order",
	"asset_file" = EXCLUDED."asset_file",
	"face_model_file" = EXCLUDED."face_model_file",
	"perk_key" = EXCLUDED."perk_key",
	"perk_value" = EXCLUDED."perk_value",
	"perk_label" = EXCLUDED."perk_label",
	"updated_at" = NOW();--> statement-breakpoint

-- Point existing players at a valid selectable character.
UPDATE "users"
SET
	"selected_character_id" = 'garla',
	"updated_at" = NOW()
WHERE "selected_character_id" IS NULL
	OR "selected_character_id" NOT IN ('garla', 'olrick', 'morgana', 'p_anne');
