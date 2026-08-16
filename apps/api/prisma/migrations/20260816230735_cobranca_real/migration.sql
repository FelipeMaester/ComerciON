-- AlterTable
ALTER TABLE "subscription_invoices" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "paymentUrl" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "billingExternalId" TEXT;
