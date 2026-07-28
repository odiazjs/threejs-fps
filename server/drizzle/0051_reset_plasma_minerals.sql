-- Reset spendable plasma minerals for every registered player.
UPDATE "users" SET "plasma_minerals" = 0, "updated_at" = NOW();
