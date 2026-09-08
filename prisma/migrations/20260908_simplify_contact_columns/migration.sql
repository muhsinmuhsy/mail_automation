-- Remove company, job_title, notes columns from contacts; make name optional.
-- See user request: built-in fields reduced to name + email only.

ALTER TABLE "contacts" ALTER COLUMN "name" DROP NOT NULL;
ALTER TABLE "contacts" DROP COLUMN "company";
ALTER TABLE "contacts" DROP COLUMN "job_title";
ALTER TABLE "contacts" DROP COLUMN "notes";
