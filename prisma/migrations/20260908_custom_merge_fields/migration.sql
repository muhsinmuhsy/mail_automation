-- Custom merge fields (Path C hybrid model). See docs/CUSTOM_MERGE_FIELDS.md.

-- Field type enum: text | number | date | boolean (§11.3).
CREATE TYPE "FieldType" AS ENUM ('text', 'number', 'date', 'boolean');

-- User-defined custom merge field definitions.
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
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "contact_fields_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "unique_contact_fields_user_id_name" ON "contact_fields"("user_id", "name");
CREATE INDEX "idx_contact_fields_user_id" ON "contact_fields"("user_id");

ALTER TABLE "contact_fields"
  ADD CONSTRAINT "contact_fields_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

-- Per-contact values for custom merge fields.
CREATE TABLE "contact_field_values" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contact_id" UUID NOT NULL,
    "field_id" UUID NOT NULL,
    "value" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "contact_field_values_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "unique_contact_field_values_contact_id_field_id"
  ON "contact_field_values"("contact_id", "field_id");
CREATE INDEX "idx_contact_field_values_field_id"
  ON "contact_field_values"("field_id");

ALTER TABLE "contact_field_values"
  ADD CONSTRAINT "contact_field_values_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE;

ALTER TABLE "contact_field_values"
  ADD CONSTRAINT "contact_field_values_field_id_fkey"
  FOREIGN KEY ("field_id") REFERENCES "contact_fields"("id") ON DELETE CASCADE;

-- Import session id for idempotent CSV retry (§11.27). Nullable; no backfill.
ALTER TABLE "contacts" ADD COLUMN "import_session_id" UUID;
CREATE INDEX "idx_contacts_user_id_import_session_id"
  ON "contacts"("user_id", "import_session_id");
