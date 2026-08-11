-- SaleItem: productId vira opcional (itens sem produto, ex.: mão de obra vinda de uma ordem de serviço)
ALTER TABLE "sale_items" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "sale_items" ADD COLUMN "description" TEXT;

ALTER TABLE "sale_items" DROP CONSTRAINT "sale_items_productId_fkey";
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ServiceOrder: vínculo com a venda gerada automaticamente ao concluir o serviço
ALTER TABLE "service_orders" ADD COLUMN "saleId" TEXT;

CREATE UNIQUE INDEX "service_orders_saleId_key" ON "service_orders"("saleId");

ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
