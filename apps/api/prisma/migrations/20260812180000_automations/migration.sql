-- AlterEnum
ALTER TYPE "ModuleKey" ADD VALUE 'AUTOMATIONS';

-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM ('QUOTE_PENDING_DAYS', 'OPPORTUNITY_STALE_DAYS', 'SALE_CONFIRMED', 'OPPORTUNITY_WON', 'OPPORTUNITY_LOST');

-- CreateEnum
CREATE TYPE "AutomationAction" AS ENUM ('SEND_WHATSAPP', 'CREATE_TASK');

-- CreateEnum
CREATE TYPE "AutomationEntityType" AS ENUM ('QUOTE', 'OPPORTUNITY', 'SALE');

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" "AutomationTrigger" NOT NULL,
    "triggerConfig" JSONB,
    "action" "AutomationAction" NOT NULL,
    "actionConfig" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_run_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "entityType" "AutomationEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,

    CONSTRAINT "automation_run_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_rules_tenantId_trigger_isActive_idx" ON "automation_rules"("tenantId", "trigger", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "automation_run_logs_ruleId_entityType_entityId_key" ON "automation_run_logs"("ruleId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_run_logs" ADD CONSTRAINT "automation_run_logs_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
