-- Remove a loja virtual: catálogo público, carrinho, avaliações, conta do
-- cliente final e envios. O que sobrou do e-commerce foi retirado do schema
-- para ele parar de descrever recursos que não existem mais.
--
-- customer_addresses FICA: é usado pelo CRM (a equipe cadastra o endereço do
-- cliente na tela de detalhe). Só o vínculo com a venda saiu, que era o
-- endereço de entrega do checkout.

-- DropForeignKey
ALTER TABLE "cart_snapshots" DROP CONSTRAINT "cart_snapshots_customerId_fkey";

-- DropForeignKey
ALTER TABLE "cart_snapshots" DROP CONSTRAINT "cart_snapshots_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "customer_password_reset_tokens" DROP CONSTRAINT "customer_password_reset_tokens_customerId_fkey";

-- DropForeignKey
ALTER TABLE "customer_refresh_tokens" DROP CONSTRAINT "customer_refresh_tokens_customerId_fkey";

-- DropForeignKey
ALTER TABLE "product_reviews" DROP CONSTRAINT "product_reviews_customerId_fkey";

-- DropForeignKey
ALTER TABLE "product_reviews" DROP CONSTRAINT "product_reviews_productId_fkey";

-- DropForeignKey
ALTER TABLE "product_reviews" DROP CONSTRAINT "product_reviews_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "sales" DROP CONSTRAINT "sales_shippingAddressId_fkey";

-- DropForeignKey
ALTER TABLE "shipment_events" DROP CONSTRAINT "shipment_events_shipmentId_fkey";

-- DropForeignKey
ALTER TABLE "shipments" DROP CONSTRAINT "shipments_saleId_fkey";

-- DropForeignKey
ALTER TABLE "shipments" DROP CONSTRAINT "shipments_tenantId_fkey";

-- AlterTable
ALTER TABLE "customers" DROP COLUMN "passwordHash";

-- AlterTable
ALTER TABLE "sales" DROP COLUMN "channel",
DROP COLUMN "shippingAddressId";

-- DropTable
DROP TABLE "cart_snapshots";

-- DropTable
DROP TABLE "customer_password_reset_tokens";

-- DropTable
DROP TABLE "customer_refresh_tokens";

-- DropTable
DROP TABLE "product_reviews";

-- DropTable
DROP TABLE "shipment_events";

-- DropTable
DROP TABLE "shipments";

-- DropEnum
DROP TYPE "SaleChannel";

-- DropEnum
DROP TYPE "ShipmentStatus";

