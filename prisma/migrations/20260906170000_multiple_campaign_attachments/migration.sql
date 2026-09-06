ALTER TABLE campaigns ALTER COLUMN attachment_id DROP NOT NULL;
ALTER TABLE email_jobs ALTER COLUMN attachment_id DROP NOT NULL;
ALTER TABLE campaigns ADD COLUMN attachment_ids UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE email_jobs ADD COLUMN attachment_ids UUID[] NOT NULL DEFAULT '{}';
UPDATE campaigns SET attachment_ids = ARRAY[attachment_id] WHERE attachment_id IS NOT NULL;
UPDATE email_jobs SET attachment_ids = ARRAY[attachment_id] WHERE attachment_id IS NOT NULL;
