-- Add CHECK constraints so the singleton system_settings row can never hold
-- invalid values. These guard the daily-limit math used by the quota service.
ALTER TABLE "system_settings"
  ADD CONSTRAINT "system_settings_default_limit_check"
    CHECK ("default_daily_email_limit" >= 1),
  ADD CONSTRAINT "system_settings_global_limit_check"
    CHECK ("global_daily_email_limit" >= 1),
  ADD CONSTRAINT "system_settings_limits_order_check"
    CHECK ("default_daily_email_limit" <= "global_daily_email_limit");

-- Ensure the singleton settings row (id = 1) always exists.
INSERT INTO "system_settings" (
  "id",
  "default_daily_email_limit",
  "global_daily_email_limit",
  "email_sending_enabled",
  "updated_at"
)
SELECT 1, 20, 500, true, now()
WHERE NOT EXISTS (
  SELECT 1 FROM "system_settings" WHERE "id" = 1
);
