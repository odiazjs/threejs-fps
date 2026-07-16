ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "selected_character_id" text DEFAULT 'basic' NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_character_unlocks" (
	"user_id" text NOT NULL,
	"character_id" text NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_character_unlocks_pkey" PRIMARY KEY("user_id","character_id")
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_character_unlocks" ADD CONSTRAINT "user_character_unlocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_character_unlocks_user_id_idx" ON "user_character_unlocks" USING btree ("user_id");