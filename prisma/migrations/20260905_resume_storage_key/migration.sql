-- Older installations used r2_key before storage moved to Backblaze B2.
-- Fresh installations already create storage_key in the initial migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'resumes' AND column_name = 'r2_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'resumes' AND column_name = 'storage_key'
  ) THEN
    ALTER TABLE "resumes" RENAME COLUMN "r2_key" TO "storage_key";
  END IF;
END $$;
