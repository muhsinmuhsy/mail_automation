-- Domain CHECK constraints that Prisma Schema Language cannot express.
--
-- Prisma has no PSL syntax for arbitrary CHECK constraints, so they are added
-- here as custom SQL inside a version-controlled migration. These enforce the
-- numeric invariants the quota service and scheduler rely on:
--   * a campaign must have a positive send interval and (when set) a positive
--     daily cap,
--   * the per-user / per-campaign / system-wide daily counters (sent and
--     reserved) must never be negative.

-- Campaigns: send interval and optional daily cap must be positive.
ALTER TABLE "campaigns"
  ADD CONSTRAINT "campaigns_interval_minutes_check"
    CHECK ("interval_minutes" > 0),
  ADD CONSTRAINT "campaigns_daily_limit_check"
    CHECK ("daily_limit" IS NULL OR "daily_limit" > 0);

-- Per-user daily usage counters must never go negative.
ALTER TABLE "email_usage_daily"
  ADD CONSTRAINT "email_usage_daily_sent_count_check"
    CHECK ("sent_count" >= 0),
  ADD CONSTRAINT "email_usage_daily_reserved_count_check"
    CHECK ("reserved_count" >= 0);

-- Per-campaign daily usage counters must never go negative.
ALTER TABLE "campaign_usage_daily"
  ADD CONSTRAINT "campaign_usage_daily_sent_count_check"
    CHECK ("sent_count" >= 0),
  ADD CONSTRAINT "campaign_usage_daily_reserved_count_check"
    CHECK ("reserved_count" >= 0);

-- System-wide daily usage counters must never go negative.
ALTER TABLE "system_usage_daily"
  ADD CONSTRAINT "system_usage_daily_sent_count_check"
    CHECK ("sent_count" >= 0),
  ADD CONSTRAINT "system_usage_daily_reserved_count_check"
    CHECK ("reserved_count" >= 0);
