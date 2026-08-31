-- CHECK constraints that Prisma's schema language does not express inline.
-- These guard the quota math and scheduling invariants used by the email
-- limit service, scheduler, and queue consumer. They are additive and safe
-- to apply to an existing database (existing default/seed values already
-- satisfy every constraint below).

-- Campaign scheduling invariants.
ALTER TABLE "campaigns"
  ADD CONSTRAINT "campaigns_interval_minutes_check"
    CHECK ("interval_minutes" > 0);

ALTER TABLE "campaigns"
  ADD CONSTRAINT "campaigns_daily_limit_check"
    CHECK ("daily_limit" IS NULL OR "daily_limit" > 0);

-- Daily usage counters must never be negative.
ALTER TABLE "email_usage_daily"
  ADD CONSTRAINT "email_usage_daily_sent_count_check"
    CHECK ("sent_count" >= 0),
  ADD CONSTRAINT "email_usage_daily_reserved_count_check"
    CHECK ("reserved_count" >= 0);

ALTER TABLE "campaign_usage_daily"
  ADD CONSTRAINT "campaign_usage_daily_sent_count_check"
    CHECK ("sent_count" >= 0),
  ADD CONSTRAINT "campaign_usage_daily_reserved_count_check"
    CHECK ("reserved_count" >= 0);

ALTER TABLE "system_usage_daily"
  ADD CONSTRAINT "system_usage_daily_sent_count_check"
    CHECK ("sent_count" >= 0),
  ADD CONSTRAINT "system_usage_daily_reserved_count_check"
    CHECK ("reserved_count" >= 0);
