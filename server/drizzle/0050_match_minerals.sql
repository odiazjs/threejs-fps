ALTER TABLE "match_participants"
	ADD COLUMN IF NOT EXISTS "minerals_gained" integer DEFAULT 0 NOT NULL;
