-- AlterTable: add creation_key to email_jobs (nullable for legacy rows)
ALTER TABLE "email_jobs" ADD COLUMN "creation_key" VARCHAR(321);

-- CreateTable: campaign submission receipts for idempotent creation replay
CREATE TABLE "campaign_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "campaign_id" UUID NOT NULL,
    "recipient_summary" JSONB NOT NULL,
    "resend_recipients" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "campaign_submissions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: campaign_submissions -> users
ALTER TABLE "campaign_submissions" ADD CONSTRAINT "campaign_submissions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: campaign_submissions -> campaigns (Restrict — preserve receipts)
ALTER TABLE "campaign_submissions" ADD CONSTRAINT "campaign_submissions_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex: unique (user_id, idempotency_key)
CREATE UNIQUE INDEX "uq_campaign_submissions_user_key"
    ON "campaign_submissions" ("user_id", "idempotency_key");

-- CreateIndex: unique campaign_id (one receipt per campaign)
CREATE UNIQUE INDEX "uq_campaign_submissions_campaign_id"
    ON "campaign_submissions" ("campaign_id");

-- CreateIndex: user + created_at for receipt listing
CREATE INDEX "idx_campaign_submissions_user_created"
    ON "campaign_submissions" ("user_id", "created_at");

-- CreateIndex: unique creation_key on email_jobs (ordinary unique — multiple nulls allowed)
CREATE UNIQUE INDEX "idx_email_jobs_creation_key_unique"
    ON "email_jobs" ("creation_key");

-- CreateIndex: expression + partial index for recipient history match
-- (user_id, template_id, email_account_id, lower(btrim(to_email))) WHERE status in active/unknown statuses
CREATE INDEX "idx_email_jobs_recipient_history_match"
    ON "email_jobs" ("user_id", "template_id", "email_account_id", lower(btrim("to_email")))
    WHERE status IN ('SENT', 'SCHEDULED', 'QUEUED', 'PROCESSING', 'RETRY_WAIT', 'DELIVERY_UNKNOWN');

-- CreateIndex: contact history for GET /api/contacts/[id]/emails
CREATE INDEX "idx_email_jobs_contact_history"
    ON "email_jobs" ("user_id", "contact_id", "created_at" DESC, "id" DESC);

-- Add CHECK constraint: creation_key must match campaign_id + normalized to_email when non-null
ALTER TABLE "email_jobs"
ADD CONSTRAINT "email_jobs_creation_key_valid"
CHECK (
    creation_key IS NULL
    OR (
        campaign_id IS NOT NULL
        AND creation_key = campaign_id::text || ':' || lower(btrim(to_email))
    )
);
