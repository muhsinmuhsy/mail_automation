-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('gmail', 'microsoft', 'yahoo', 'custom_smtp');

-- CreateEnum
CREATE TYPE "AuthMethod" AS ENUM ('app_password', 'oauth2', 'password');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmailJobStatus" AS ENUM ('SCHEDULED', 'QUEUED', 'PROCESSING', 'RETRY_WAIT', 'SENT', 'FAILED', 'CANCELLED', 'DELIVERY_UNKNOWN');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('RESERVED', 'COMMITTED', 'RELEASED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('text', 'number', 'date', 'boolean');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255),
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "daily_email_limit_override" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" "EmailProvider" NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "auth_method" "AuthMethod" NOT NULL,
    "encrypted_secret" TEXT,
    "encrypted_refresh_token" TEXT,
    "access_token_expires_at" TIMESTAMPTZ,
    "provider_account_id" TEXT,
    "granted_scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "connection_error" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_oauth_attempts" (
    "state_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "EmailProvider" NOT NULL,
    "account_id" UUID,
    "encrypted_verifier" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "email_oauth_attempts_pkey" PRIMARY KEY ("state_hash")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "storage_key" VARCHAR(1024) NOT NULL,
    "size_bytes" INTEGER,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" VARCHAR(100),
    "email" VARCHAR(255) NOT NULL,
    "import_session_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_fields" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "field_type" "FieldType" NOT NULL DEFAULT 'text',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_field_values" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contact_id" UUID NOT NULL,
    "field_id" UUID NOT NULL,
    "value" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "body_json" TEXT,
    "body_mjml" TEXT,
    "body_html" TEXT,
    "body_text" TEXT,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "email_account_id" UUID NOT NULL,
    "attachment_id" UUID,
    "attachment_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "template_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "start_at" TIMESTAMPTZ NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "interval_minutes" INTEGER NOT NULL DEFAULT 5,
    "daily_limit" INTEGER,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "campaign_id" UUID,
    "contact_id" UUID NOT NULL,
    "email_account_id" UUID NOT NULL,
    "attachment_id" UUID,
    "attachment_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "template_id" UUID NOT NULL,
    "to_email" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "body_html" TEXT,
    "scheduled_at" TIMESTAMPTZ NOT NULL,
    "status" "EmailJobStatus" NOT NULL DEFAULT 'SCHEDULED',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "processing_started_at" TIMESTAMPTZ,
    "next_attempt_at" TIMESTAMPTZ,
    "sent_at" TIMESTAMPTZ,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email_job_id" UUID NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "smtp_response" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "default_daily_email_limit" INTEGER NOT NULL DEFAULT 20,
    "global_daily_email_limit" INTEGER NOT NULL DEFAULT 500,
    "email_sending_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_usage_daily" (
    "user_id" UUID NOT NULL,
    "usage_date" DATE NOT NULL,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "reserved_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "email_usage_daily_pkey" PRIMARY KEY ("user_id","usage_date")
);

-- CreateTable
CREATE TABLE "campaign_usage_daily" (
    "campaign_id" UUID NOT NULL,
    "usage_date" DATE NOT NULL,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "reserved_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "campaign_usage_daily_pkey" PRIMARY KEY ("campaign_id","usage_date")
);

-- CreateTable
CREATE TABLE "email_send_reservations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email_job_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "user_id" UUID NOT NULL,
    "campaign_id" UUID,
    "usage_date" DATE NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,

    CONSTRAINT "email_send_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_usage_daily" (
    "usage_date" DATE NOT NULL,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "reserved_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "system_usage_daily_pkey" PRIMARY KEY ("usage_date")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "unique_email_accounts_user_provider_email" ON "email_accounts"("user_id", "provider", "email");

-- CreateIndex
CREATE INDEX "email_oauth_attempts_expires_at_idx" ON "email_oauth_attempts"("expires_at");

-- CreateIndex
CREATE INDEX "idx_attachments_user_id" ON "attachments"("user_id");

-- CreateIndex
CREATE INDEX "idx_contacts_user_id_email" ON "contacts"("user_id", "email");

-- CreateIndex
CREATE INDEX "idx_contacts_user_id_import_session_id" ON "contacts"("user_id", "import_session_id");

-- CreateIndex
CREATE INDEX "idx_contact_fields_user_id" ON "contact_fields"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "unique_contact_fields_user_id_name" ON "contact_fields"("user_id", "name");

-- CreateIndex
CREATE INDEX "idx_contact_field_values_field_id" ON "contact_field_values"("field_id");

-- CreateIndex
CREATE UNIQUE INDEX "unique_contact_field_values_contact_id_field_id" ON "contact_field_values"("contact_id", "field_id");

-- CreateIndex
CREATE INDEX "idx_templates_user_id" ON "templates"("user_id");

-- CreateIndex
CREATE INDEX "idx_campaigns_user_id_status" ON "campaigns"("user_id", "status");

-- CreateIndex
CREATE INDEX "idx_email_jobs_status_scheduled_at" ON "email_jobs"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "idx_email_jobs_user_id_status" ON "email_jobs"("user_id", "status");

-- CreateIndex
CREATE INDEX "idx_email_jobs_campaign_id" ON "email_jobs"("campaign_id");

-- CreateIndex
CREATE INDEX "idx_email_jobs_email_account_id" ON "email_jobs"("email_account_id");

-- CreateIndex
CREATE INDEX "idx_email_jobs_next_attempt_at" ON "email_jobs"("next_attempt_at");

-- CreateIndex
CREATE INDEX "idx_email_logs_email_job_id" ON "email_logs"("email_job_id");

-- CreateIndex
CREATE INDEX "idx_reservations_email_job_id" ON "email_send_reservations"("email_job_id");

-- CreateIndex
CREATE INDEX "idx_reservations_user_id_usage_date" ON "email_send_reservations"("user_id", "usage_date");

-- CreateIndex
CREATE INDEX "idx_reservations_campaign_id" ON "email_send_reservations"("campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "unique_reservations_job_attempt" ON "email_send_reservations"("email_job_id", "attempt_number");

-- AddForeignKey
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_fields" ADD CONSTRAINT "contact_fields_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_field_values" ADD CONSTRAINT "contact_field_values_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_field_values" ADD CONSTRAINT "contact_field_values_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "contact_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_email_account_id_fkey" FOREIGN KEY ("email_account_id") REFERENCES "email_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_email_account_id_fkey" FOREIGN KEY ("email_account_id") REFERENCES "email_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_email_job_id_fkey" FOREIGN KEY ("email_job_id") REFERENCES "email_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_usage_daily" ADD CONSTRAINT "email_usage_daily_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_usage_daily" ADD CONSTRAINT "campaign_usage_daily_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_send_reservations" ADD CONSTRAINT "email_send_reservations_email_job_id_fkey" FOREIGN KEY ("email_job_id") REFERENCES "email_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_send_reservations" ADD CONSTRAINT "email_send_reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_send_reservations" ADD CONSTRAINT "email_send_reservations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheckConstraints
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_interval_minutes_check" CHECK ("interval_minutes" > 0);
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_daily_limit_check" CHECK ("daily_limit" IS NULL OR "daily_limit" > 0);
ALTER TABLE "email_usage_daily" ADD CONSTRAINT "email_usage_daily_sent_count_check" CHECK ("sent_count" >= 0);
ALTER TABLE "email_usage_daily" ADD CONSTRAINT "email_usage_daily_reserved_count_check" CHECK ("reserved_count" >= 0);
ALTER TABLE "campaign_usage_daily" ADD CONSTRAINT "campaign_usage_daily_sent_count_check" CHECK ("sent_count" >= 0);
ALTER TABLE "campaign_usage_daily" ADD CONSTRAINT "campaign_usage_daily_reserved_count_check" CHECK ("reserved_count" >= 0);
ALTER TABLE "system_usage_daily" ADD CONSTRAINT "system_usage_daily_sent_count_check" CHECK ("sent_count" >= 0);
ALTER TABLE "system_usage_daily" ADD CONSTRAINT "system_usage_daily_reserved_count_check" CHECK ("reserved_count" >= 0);
