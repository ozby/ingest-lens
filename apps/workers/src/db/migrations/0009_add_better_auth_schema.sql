CREATE TABLE IF NOT EXISTS "auth_users" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "email_verified" boolean DEFAULT false NOT NULL,
  "image" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "auth_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "auth_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "expires_at" timestamp NOT NULL,
  "token" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "user_id" text NOT NULL,
  "active_organization_id" text,
  CONSTRAINT "auth_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "auth_accounts" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" text NOT NULL,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamp,
  "refresh_token_expires_at" timestamp,
  "scope" text,
  "password" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "auth_verifications" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "auth_organizations" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "logo" text,
  "metadata" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "auth_organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "auth_members" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "user_id" text NOT NULL,
  "role" text DEFAULT 'member' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "auth_invitations" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "email" text NOT NULL,
  "role" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "expires_at" timestamp NOT NULL,
  "inviter_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "auth_jwks" (
  "id" text PRIMARY KEY NOT NULL,
  "public_key" text NOT NULL,
  "private_key" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "auth_device_codes" (
  "id" text PRIMARY KEY NOT NULL,
  "device_code" text NOT NULL,
  "user_code" text NOT NULL,
  "user_id" text,
  "expires_at" timestamp NOT NULL,
  "status" text NOT NULL,
  "last_polled_at" timestamp,
  "polling_interval" integer,
  "client_id" text,
  "scope" text,
  CONSTRAINT "auth_device_codes_device_code_unique" UNIQUE("device_code"),
  CONSTRAINT "auth_device_codes_user_code_unique" UNIQUE("user_code")
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "auth_accounts_provider_account_idx"
ON "auth_accounts" USING btree ("provider_id", "account_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auth_accounts_user_idx"
ON "auth_accounts" USING btree ("user_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auth_sessions_user_idx"
ON "auth_sessions" USING btree ("user_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auth_verifications_identifier_idx"
ON "auth_verifications" USING btree ("identifier");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auth_organizations_slug_idx"
ON "auth_organizations" USING btree ("slug");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auth_members_organization_idx"
ON "auth_members" USING btree ("organization_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auth_members_user_idx"
ON "auth_members" USING btree ("user_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "auth_members_organization_user_idx"
ON "auth_members" USING btree ("organization_id", "user_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auth_invitations_organization_idx"
ON "auth_invitations" USING btree ("organization_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auth_invitations_email_idx"
ON "auth_invitations" USING btree ("email");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auth_device_codes_user_idx"
ON "auth_device_codes" USING btree ("user_id");
--> statement-breakpoint

ALTER TABLE "auth_sessions"
  ADD CONSTRAINT "auth_sessions_user_id_auth_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE cascade;
--> statement-breakpoint

ALTER TABLE "auth_accounts"
  ADD CONSTRAINT "auth_accounts_user_id_auth_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE cascade;
--> statement-breakpoint

ALTER TABLE "auth_members"
  ADD CONSTRAINT "auth_members_organization_id_auth_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "auth_organizations"("id") ON DELETE cascade;
--> statement-breakpoint

ALTER TABLE "auth_members"
  ADD CONSTRAINT "auth_members_user_id_auth_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE cascade;
--> statement-breakpoint

ALTER TABLE "auth_invitations"
  ADD CONSTRAINT "auth_invitations_organization_id_auth_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "auth_organizations"("id") ON DELETE cascade;
--> statement-breakpoint

ALTER TABLE "auth_invitations"
  ADD CONSTRAINT "auth_invitations_inviter_id_auth_users_id_fk"
  FOREIGN KEY ("inviter_id") REFERENCES "auth_users"("id") ON DELETE cascade;
