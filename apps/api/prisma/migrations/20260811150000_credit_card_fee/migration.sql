-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "cardFeeRates" JSONB;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "cardFeeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
