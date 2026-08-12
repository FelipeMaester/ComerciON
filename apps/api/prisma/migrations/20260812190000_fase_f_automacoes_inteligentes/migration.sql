-- CreateEnum
CREATE TYPE "AutomationSuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DISMISSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AutomationEntityType" ADD VALUE 'CUSTOMER';
ALTER TYPE "AutomationEntityType" ADD VALUE 'PRODUCT';
ALTER TYPE "AutomationEntityType" ADD VALUE 'FINANCIAL_ENTRY';
ALTER TYPE "AutomationEntityType" ADD VALUE 'SERVICE_ORDER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AutomationTrigger" ADD VALUE 'CUSTOMER_INACTIVE_DAYS';
ALTER TYPE "AutomationTrigger" ADD VALUE 'LOW_STOCK';
ALTER TYPE "AutomationTrigger" ADD VALUE 'RECEIVABLE_OVERDUE_DAYS';
ALTER TYPE "AutomationTrigger" ADD VALUE 'SERVICE_ORDER_STALE_DAYS';

-- DropIndex
DROP INDEX "automation_run_logs_ruleId_entityType_entityId_key";

-- AlterTable
ALTER TABLE "automation_rules" ADD COLUMN     "cooldownDays" INTEGER;

-- CreateTable
CREATE TABLE "automation_suggestions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "trigger" "AutomationTrigger" NOT NULL,
    "triggerConfig" JSONB,
    "action" "AutomationAction" NOT NULL,
    "actionConfig" JSONB NOT NULL,
    "status" "AutomationSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "createdRuleId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_suggestions_tenantId_status_idx" ON "automation_suggestions"("tenantId", "status");

-- CreateIndex
CREATE INDEX "automation_run_logs_ruleId_entityType_entityId_firedAt_idx" ON "automation_run_logs"("ruleId", "entityType", "entityId", "firedAt");

-- CreateIndex
CREATE INDEX "automation_run_logs_tenantId_firedAt_idx" ON "automation_run_logs"("tenantId", "firedAt");

-- AddForeignKey
ALTER TABLE "automation_suggestions" ADD CONSTRAINT "automation_suggestions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_suggestions" ADD CONSTRAINT "automation_suggestions_createdRuleId_fkey" FOREIGN KEY ("createdRuleId") REFERENCES "automation_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
