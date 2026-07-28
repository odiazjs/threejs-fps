-- Season 01 featured rewards + operator unlock ownership for season grants.

ALTER TABLE "season_rewards"
	ADD COLUMN IF NOT EXISTS "preview_image_url" text;

CREATE TABLE IF NOT EXISTS "user_operator_unlocks" (
	"user_id" text NOT NULL,
	"character_id" text NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_operator_unlocks_pkey" PRIMARY KEY("user_id","character_id")
);
--> statement-breakpoint

ALTER TABLE "user_operator_unlocks"
	ADD CONSTRAINT "user_operator_unlocks_user_id_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "user_operator_unlocks"
	ADD CONSTRAINT "user_operator_unlocks_character_id_characters_id_fk"
	FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "user_operator_unlocks_user_id_idx"
	ON "user_operator_unlocks" USING btree ("user_id");
--> statement-breakpoint

-- Level 5: Steve operator character
UPDATE "season_rewards"
SET
	"reward_type" = 'character',
	"reward_label" = 'Steve',
	"reward_amount" = NULL,
	"reward_item_id" = 'steve',
	"preview_image_url" = '/images/characters/steve_icon.png',
	"sort_order" = 5
WHERE "id" = 'season_01_lv_05';
--> statement-breakpoint

-- Level 10: Magma Fire body skin (store)
UPDATE "season_rewards"
SET
	"reward_type" = 'character_skin',
	"reward_label" = 'Magma Fire',
	"reward_amount" = NULL,
	"reward_item_id" = 'magma_fire',
	"preview_image_url" = '/images/store/meshy_character_magma_fire_texture.png',
	"sort_order" = 10
WHERE "id" = 'season_01_lv_10';
