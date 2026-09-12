-- AlterEnum
ALTER TYPE "FieldType" ADD VALUE 'dropdown';

-- AlterTable
ALTER TABLE "contact_fields" ADD COLUMN     "options" JSONB;
