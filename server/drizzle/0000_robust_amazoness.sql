CREATE TYPE "public"."friend_request_status" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "player_stats" (
	"user_id" text PRIMARY KEY NOT NULL,
	"kills" integer DEFAULT 0 NOT NULL,
	"deaths" integer DEFAULT 0 NOT NULL,
	"matches_played" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"user_id" text NOT NULL,
	"friend_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_user_id_friend_id_pk" PRIMARY KEY("user_id","friend_id")
);
--> statement-breakpoint
CREATE TABLE "friend_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"status" "friend_request_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_friend_id_users_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_stats_kills_idx" ON "player_stats" USING btree ("kills");--> statement-breakpoint
CREATE INDEX "player_stats_wins_idx" ON "player_stats" USING btree ("wins");--> statement-breakpoint
CREATE UNIQUE INDEX "friend_requests_pair_uidx" ON "friend_requests" USING btree ("from_user_id","to_user_id");