ALTER TABLE "email_accounts"
  ADD COLUMN "provider_account_id" TEXT,
  ADD COLUMN "granted_scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "connection_error" TEXT;

CREATE TABLE "email_oauth_attempts" (
  "state_hash" TEXT PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "provider" "EmailProvider" NOT NULL,
  "account_id" UUID,
  "encrypted_verifier" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "email_oauth_attempts_expires_at_idx" ON "email_oauth_attempts"("expires_at");
