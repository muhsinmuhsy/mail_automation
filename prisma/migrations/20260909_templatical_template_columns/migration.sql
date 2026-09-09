-- Templatical email builder columns. See docs/TEMPLATICAL_EMAIL_BUILDER.md §3.
--
-- Template: add editor content columns alongside the existing plain-text `body`.
--   body_json  — Templatical editor JSON (source of truth). Null for legacy templates.
--   body_mjml  — Server-rendered MJML (derived cache from body_json).
--   body_html  — Server-compiled HTML (derived cache from body_mjml).
--   body_text  — Plain-text fallback (derived from body_html). Legacy `body` migrates here.
--
-- All four are nullable so existing plain-text templates remain valid without backfill.
ALTER TABLE "templates"
  ADD COLUMN "body_json" TEXT,
  ADD COLUMN "body_mjml" TEXT,
  ADD COLUMN "body_html" TEXT,
  ADD COLUMN "body_text" TEXT;

-- Backfill body_text from the existing plain-text body so legacy templates
-- have a populated text fallback column from the start.
UPDATE "templates" SET "body_text" = "body" WHERE "body_text" IS NULL;

-- EmailJob: snapshot resolved HTML alongside the existing plain-text body.
-- Null for legacy text-only jobs (no multipart/alternative).
ALTER TABLE "email_jobs"
  ADD COLUMN "body_html" TEXT;
