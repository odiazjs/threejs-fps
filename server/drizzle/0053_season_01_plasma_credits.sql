-- Convert Season 01 track rewards (except levels 5 & 10) to plasma mineral credits.
UPDATE "season_rewards"
SET
	"reward_type" = 'credits',
	"reward_item_id" = NULL,
	"preview_image_url" = NULL,
	"reward_amount" = CASE "level"
		WHEN 1 THEN 500
		WHEN 2 THEN 500
		WHEN 3 THEN 750
		WHEN 4 THEN 750
		WHEN 6 THEN 1000
		WHEN 7 THEN 1000
		WHEN 8 THEN 1000
		WHEN 9 THEN 1250
		WHEN 11 THEN 1000
		WHEN 12 THEN 1000
		WHEN 13 THEN 1000
		WHEN 14 THEN 1000
		WHEN 15 THEN 1500
		WHEN 16 THEN 1250
		WHEN 17 THEN 1000
		WHEN 18 THEN 1000
		WHEN 19 THEN 1250
		WHEN 20 THEN 1250
		WHEN 21 THEN 1000
		WHEN 22 THEN 1000
		WHEN 23 THEN 1000
		WHEN 24 THEN 1000
		WHEN 25 THEN 2000
		WHEN 26 THEN 1500
		WHEN 27 THEN 1000
		WHEN 28 THEN 1000
		WHEN 29 THEN 1250
		WHEN 30 THEN 1250
		WHEN 31 THEN 1000
		WHEN 32 THEN 1000
		WHEN 33 THEN 1000
		WHEN 34 THEN 1000
		WHEN 35 THEN 1000
		WHEN 36 THEN 1000
		WHEN 37 THEN 1000
		WHEN 38 THEN 1000
		WHEN 39 THEN 1500
		WHEN 40 THEN 1500
		ELSE COALESCE("reward_amount", 500)
	END
WHERE "season_id" = 'season_01'
	AND "level" NOT IN (5, 10);
--> statement-breakpoint

UPDATE "season_rewards"
SET
	"reward_label" = TRIM(TO_CHAR("reward_amount", 'FM999,999')) || ' Plasma Minerals'
WHERE "season_id" = 'season_01'
	AND "level" NOT IN (5, 10)
	AND "reward_type" = 'credits'
	AND "reward_amount" IS NOT NULL;
