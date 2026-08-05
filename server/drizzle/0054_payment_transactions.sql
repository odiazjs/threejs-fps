CREATE TABLE IF NOT EXISTS "payment_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"pack_id" text NOT NULL,
	"amount_granted" integer NOT NULL,
	"lemon_order_id" text NOT NULL,
	"lemon_variant_id" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_transactions_lemon_order_id_unique" UNIQUE("lemon_order_id")
);--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
