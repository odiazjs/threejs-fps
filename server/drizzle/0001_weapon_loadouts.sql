CREATE TABLE "weapon_loadouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar(24) NOT NULL,
	"primary_weapon_id" text NOT NULL,
	"secondary_weapon_id" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "weapon_loadouts" ADD CONSTRAINT "weapon_loadouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "weapon_loadouts_user_id_idx" ON "weapon_loadouts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weapon_loadouts_user_name_uidx" ON "weapon_loadouts" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "weapon_loadouts_user_default_uidx" ON "weapon_loadouts" USING btree ("user_id") WHERE "weapon_loadouts"."is_default" = true;