-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELED');

-- AlterTable
ALTER TABLE "service_orders" ADD COLUMN     "scheduledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "product_equivalences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "equivalentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_equivalences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_counts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stockCountId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "expectedQty" INTEGER NOT NULL,
    "countedQty" INTEGER,

    CONSTRAINT "stock_count_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_equivalences_productId_idx" ON "product_equivalences"("productId");

-- CreateIndex
CREATE INDEX "product_equivalences_equivalentId_idx" ON "product_equivalences"("equivalentId");

-- CreateIndex
CREATE UNIQUE INDEX "product_equivalences_productId_equivalentId_key" ON "product_equivalences"("productId", "equivalentId");

-- CreateIndex
CREATE INDEX "stock_counts_tenantId_status_idx" ON "stock_counts"("tenantId", "status");

-- CreateIndex
CREATE INDEX "stock_count_items_stockCountId_idx" ON "stock_count_items"("stockCountId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_items_stockCountId_productId_key" ON "stock_count_items"("stockCountId", "productId");

-- CreateIndex
CREATE INDEX "service_orders_scheduledAt_idx" ON "service_orders"("scheduledAt");

-- AddForeignKey
ALTER TABLE "product_equivalences" ADD CONSTRAINT "product_equivalences_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_equivalences" ADD CONSTRAINT "product_equivalences_equivalentId_fkey" FOREIGN KEY ("equivalentId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "stock_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
