-- Canonical rank ladder + RP thresholds (source of truth for Rank UI panel).
CREATE TABLE IF NOT EXISTS "ranks" (
	"id" text PRIMARY KEY NOT NULL,
	"tier" text NOT NULL,
	"division" integer NOT NULL,
	"name" text NOT NULL,
	"min_rp" integer NOT NULL,
	"sort_order" integer NOT NULL,
	"icon_key" text,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ranks_tier_division_uidx" ON "ranks" USING btree ("tier","division");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ranks_sort_idx" ON "ranks" USING btree ("sort_order");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ranks_min_rp_idx" ON "ranks" USING btree ("min_rp");
--> statement-breakpoint

INSERT INTO "ranks" ("id", "tier", "division", "name", "min_rp", "sort_order", "icon_key", "enabled")
VALUES
	('bronze_1', 'bronze', 1, 'Bronze I', 0, 0, 'bronze', true),
	('bronze_2', 'bronze', 2, 'Bronze II', 300, 1, 'bronze', true),
	('bronze_3', 'bronze', 3, 'Bronze III', 600, 2, 'bronze', true),
	('silver_1', 'silver', 1, 'Silver I', 900, 3, 'silver', true),
	('silver_2', 'silver', 2, 'Silver II', 1200, 4, 'silver', true),
	('silver_3', 'silver', 3, 'Silver III', 1500, 5, 'silver', true),
	('gold_1', 'gold', 1, 'Gold I', 1800, 6, 'gold', true),
	('gold_2', 'gold', 2, 'Gold II', 2100, 7, 'gold', true),
	('gold_3', 'gold', 3, 'Gold III', 2500, 8, 'gold', true),
	('titanium_1', 'titanium', 1, 'Titanium I', 3000, 9, 'titanium', true),
	('titanium_2', 'titanium', 2, 'Titanium II', 3500, 10, 'titanium', true),
	('titanium_3', 'titanium', 3, 'Titanium III', 4000, 11, 'titanium', true),
	('crystal_1', 'crystal', 1, 'Crystal I', 4500, 12, 'crystal', true),
	('crystal_2', 'crystal', 2, 'Crystal II', 5000, 13, 'crystal', true),
	('crystal_3', 'crystal', 3, 'Crystal III', 5500, 14, 'crystal', true),
	('magmaster_1', 'magmaster', 1, 'Magmaster I', 6000, 15, 'magmaster', true),
	('magmaster_2', 'magmaster', 2, 'Magmaster II', 6750, 16, 'magmaster', true),
	('magmaster_3', 'magmaster', 3, 'Magmaster III', 7500, 17, 'magmaster', true)
ON CONFLICT ("id") DO UPDATE SET
	"tier" = EXCLUDED."tier",
	"division" = EXCLUDED."division",
	"name" = EXCLUDED."name",
	"min_rp" = EXCLUDED."min_rp",
	"sort_order" = EXCLUDED."sort_order",
	"icon_key" = EXCLUDED."icon_key",
	"enabled" = EXCLUDED."enabled";
