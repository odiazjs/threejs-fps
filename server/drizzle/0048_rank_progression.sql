-- Rank progression: seasons, season stats, matches, season reward track.
-- Also extends career player_stats with account XP / level.

ALTER TABLE "player_stats"
	ADD COLUMN IF NOT EXISTS "xp" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "player_stats"
	ADD COLUMN IF NOT EXISTS "level" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_stats_level_idx" ON "player_stats" USING btree ("level");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "seasons" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seasons_active_idx" ON "seasons" USING btree ("is_active");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "season_player_stats" (
	"user_id" text NOT NULL,
	"season_id" text NOT NULL,
	"rp" integer DEFAULT 0 NOT NULL,
	"peak_rp" integer DEFAULT 0 NOT NULL,
	"total_rp_earned" integer DEFAULT 0 NOT NULL,
	"matches_played" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"current_win_streak" integer DEFAULT 0 NOT NULL,
	"longest_win_streak" integer DEFAULT 0 NOT NULL,
	"mvp_awards" integer DEFAULT 0 NOT NULL,
	"season_xp" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_player_stats_user_id_season_id_pk" PRIMARY KEY("user_id","season_id")
);
--> statement-breakpoint
ALTER TABLE "season_player_stats"
	ADD CONSTRAINT "season_player_stats_user_id_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "season_player_stats"
	ADD CONSTRAINT "season_player_stats_season_id_seasons_id_fk"
	FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "season_player_stats_rp_idx" ON "season_player_stats" USING btree ("season_id","rp");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"season_id" text,
	"map_id" text NOT NULL,
	"mode" text DEFAULT 'tdm' NOT NULL,
	"room_id" text,
	"winning_team_id" integer DEFAULT -1 NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matches"
	ADD CONSTRAINT "matches_season_id_seasons_id_fk"
	FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_season_ended_idx" ON "matches" USING btree ("season_id","ended_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_ended_idx" ON "matches" USING btree ("ended_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "match_participants" (
	"match_id" text NOT NULL,
	"user_id" text NOT NULL,
	"team_id" integer DEFAULT 0 NOT NULL,
	"kills" integer DEFAULT 0 NOT NULL,
	"deaths" integer DEFAULT 0 NOT NULL,
	"won" boolean DEFAULT false NOT NULL,
	"tied" boolean DEFAULT false NOT NULL,
	"rp_delta" integer DEFAULT 0 NOT NULL,
	"xp_gained" integer DEFAULT 0 NOT NULL,
	"season_xp_gained" integer DEFAULT 0 NOT NULL,
	"was_mvp" boolean DEFAULT false NOT NULL,
	CONSTRAINT "match_participants_match_id_user_id_pk" PRIMARY KEY("match_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "match_participants"
	ADD CONSTRAINT "match_participants_match_id_matches_id_fk"
	FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "match_participants"
	ADD CONSTRAINT "match_participants_user_id_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "match_participants_user_idx" ON "match_participants" USING btree ("user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "season_rewards" (
	"id" text PRIMARY KEY NOT NULL,
	"season_id" text NOT NULL,
	"level" integer NOT NULL,
	"reward_type" text NOT NULL,
	"reward_label" text NOT NULL,
	"reward_amount" integer,
	"reward_item_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "season_rewards"
	ADD CONSTRAINT "season_rewards_season_id_seasons_id_fk"
	FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "season_rewards_season_level_uidx" ON "season_rewards" USING btree ("season_id","level");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "season_rewards_season_idx" ON "season_rewards" USING btree ("season_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_season_reward_claims" (
	"user_id" text NOT NULL,
	"season_id" text NOT NULL,
	"level" integer NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_season_reward_claims_user_id_season_id_level_pk" PRIMARY KEY("user_id","season_id","level")
);
--> statement-breakpoint
ALTER TABLE "user_season_reward_claims"
	ADD CONSTRAINT "user_season_reward_claims_user_id_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_season_reward_claims"
	ADD CONSTRAINT "user_season_reward_claims_season_id_seasons_id_fk"
	FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Seed Season 01 (~30 days from migration time).
INSERT INTO "seasons" ("id", "name", "starts_at", "ends_at", "is_active", "sort_order")
VALUES (
	'season_01',
	'Season 01',
	NOW() - INTERVAL '5 days',
	NOW() + INTERVAL '25 days',
	true,
	1
)
ON CONFLICT ("id") DO UPDATE SET
	"name" = EXCLUDED."name",
	"is_active" = EXCLUDED."is_active",
	"sort_order" = EXCLUDED."sort_order";
--> statement-breakpoint

-- Placeholder season reward track (levels 1–40) for UI strip.
INSERT INTO "season_rewards" ("id", "season_id", "level", "reward_type", "reward_label", "reward_amount", "reward_item_id", "sort_order")
VALUES
	('season_01_lv_01', 'season_01', 1, 'credits', '500 Credits', 500, NULL, 1),
	('season_01_lv_02', 'season_01', 2, 'item', 'Weapon Mod', NULL, NULL, 2),
	('season_01_lv_03', 'season_01', 3, 'credits', '750 Credits', 750, NULL, 3),
	('season_01_lv_04', 'season_01', 4, 'item', 'Plasma Charge', NULL, NULL, 4),
	('season_01_lv_05', 'season_01', 5, 'credits', '1,000 Credits', 1000, NULL, 5),
	('season_01_lv_06', 'season_01', 6, 'item', 'Player Card', NULL, NULL, 6),
	('season_01_lv_07', 'season_01', 7, 'credits', '1,000 Credits', 1000, NULL, 7),
	('season_01_lv_08', 'season_01', 8, 'item', 'Weapon Skin', NULL, NULL, 8),
	('season_01_lv_09', 'season_01', 9, 'credits', '1,250 Credits', 1250, NULL, 9),
	('season_01_lv_10', 'season_01', 10, 'item', 'Loading Frame', NULL, NULL, 10),
	('season_01_lv_11', 'season_01', 11, 'credits', '1,000 Credits', 1000, NULL, 11),
	('season_01_lv_12', 'season_01', 12, 'item', 'Weapon Mod', NULL, NULL, 12),
	('season_01_lv_13', 'season_01', 13, 'credits', '1,000 Credits', 1000, NULL, 13),
	('season_01_lv_14', 'season_01', 14, 'item', 'Plasma Charge', NULL, NULL, 14),
	('season_01_lv_15', 'season_01', 15, 'credits', '1,500 Credits', 1500, NULL, 15),
	('season_01_lv_16', 'season_01', 16, 'item', 'Player Card', NULL, NULL, 16),
	('season_01_lv_17', 'season_01', 17, 'credits', '1,000 Credits', 1000, NULL, 17),
	('season_01_lv_18', 'season_01', 18, 'item', 'Weapon Skin', NULL, NULL, 18),
	('season_01_lv_19', 'season_01', 19, 'credits', '1,250 Credits', 1250, NULL, 19),
	('season_01_lv_20', 'season_01', 20, 'item', 'Loading Frame', NULL, NULL, 20),
	('season_01_lv_21', 'season_01', 21, 'credits', '1,000 Credits', 1000, NULL, 21),
	('season_01_lv_22', 'season_01', 22, 'item', 'Weapon Mod', NULL, NULL, 22),
	('season_01_lv_23', 'season_01', 23, 'credits', '1,000 Credits', 1000, NULL, 23),
	('season_01_lv_24', 'season_01', 24, 'item', 'Plasma Charge', NULL, NULL, 24),
	('season_01_lv_25', 'season_01', 25, 'credits', '2,000 Credits', 2000, NULL, 25),
	('season_01_lv_26', 'season_01', 26, 'item', 'Player Card', NULL, NULL, 26),
	('season_01_lv_27', 'season_01', 27, 'credits', '1,000 Credits', 1000, NULL, 27),
	('season_01_lv_28', 'season_01', 28, 'item', 'Weapon Skin', NULL, NULL, 28),
	('season_01_lv_29', 'season_01', 29, 'credits', '1,250 Credits', 1250, NULL, 29),
	('season_01_lv_30', 'season_01', 30, 'item', 'Loading Frame', NULL, NULL, 30),
	('season_01_lv_31', 'season_01', 31, 'credits', '1,000 Credits', 1000, NULL, 31),
	('season_01_lv_32', 'season_01', 32, 'item', 'Weapon Mod', NULL, NULL, 32),
	('season_01_lv_33', 'season_01', 33, 'credits', '1,000 Credits', 1000, NULL, 33),
	('season_01_lv_34', 'season_01', 34, 'item', 'Plasma Charge', NULL, NULL, 34),
	('season_01_lv_35', 'season_01', 35, 'credits', '1,000 Credits', 1000, NULL, 35),
	('season_01_lv_36', 'season_01', 36, 'item', 'Player Card', NULL, NULL, 36),
	('season_01_lv_37', 'season_01', 37, 'credits', '1,000 Credits', 1000, NULL, 37),
	('season_01_lv_38', 'season_01', 38, 'item', 'Weapon Skin', NULL, NULL, 38),
	('season_01_lv_39', 'season_01', 39, 'credits', '1,500 Credits', 1500, NULL, 39),
	('season_01_lv_40', 'season_01', 40, 'item', 'Loading Frame', NULL, NULL, 40)
ON CONFLICT ("id") DO UPDATE SET
	"reward_type" = EXCLUDED."reward_type",
	"reward_label" = EXCLUDED."reward_label",
	"reward_amount" = EXCLUDED."reward_amount",
	"reward_item_id" = EXCLUDED."reward_item_id",
	"sort_order" = EXCLUDED."sort_order";
