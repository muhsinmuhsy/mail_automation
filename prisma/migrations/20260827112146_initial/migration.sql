/*
  Warnings:

  - You are about to alter the column `email` on the `email_accounts` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `email` on the `users` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `name` on the `users` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.

*/
-- AlterTable
ALTER TABLE "email_accounts" ALTER COLUMN "email" SET DATA TYPE VARCHAR(255);

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "email" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "name" SET DATA TYPE VARCHAR(255);

-- RenameIndex
ALTER INDEX "campaigns_user_id_status_idx" RENAME TO "idx_campaigns_user_id_status";

-- RenameIndex
ALTER INDEX "contacts_user_id_email_idx" RENAME TO "idx_contacts_user_id_email";

-- RenameIndex
ALTER INDEX "email_accounts_user_id_provider_email_key" RENAME TO "unique_email_accounts_user_provider_email";

-- RenameIndex
ALTER INDEX "email_jobs_campaign_id_idx" RENAME TO "idx_email_jobs_campaign_id";

-- RenameIndex
ALTER INDEX "email_jobs_email_account_id_idx" RENAME TO "idx_email_jobs_email_account_id";

-- RenameIndex
ALTER INDEX "email_jobs_next_attempt_at_idx" RENAME TO "idx_email_jobs_next_attempt_at";

-- RenameIndex
ALTER INDEX "email_jobs_status_scheduled_at_idx" RENAME TO "idx_email_jobs_status_scheduled_at";

-- RenameIndex
ALTER INDEX "email_jobs_user_id_status_idx" RENAME TO "idx_email_jobs_user_id_status";

-- RenameIndex
ALTER INDEX "email_logs_email_job_id_idx" RENAME TO "idx_email_logs_email_job_id";

-- RenameIndex
ALTER INDEX "email_send_reservations_email_job_id_attempt_number_key" RENAME TO "unique_reservations_job_attempt";

-- RenameIndex
ALTER INDEX "email_send_reservations_email_job_id_idx" RENAME TO "idx_reservations_email_job_id";

-- RenameIndex
ALTER INDEX "email_send_reservations_user_id_usage_date_idx" RENAME TO "idx_reservations_user_id_usage_date";

-- RenameIndex
ALTER INDEX "idx_email_send_reservations_campaign_id" RENAME TO "idx_reservations_campaign_id";

-- RenameIndex
ALTER INDEX "resumes_user_id_idx" RENAME TO "idx_resumes_user_id";

-- RenameIndex
ALTER INDEX "templates_user_id_idx" RENAME TO "idx_templates_user_id";
