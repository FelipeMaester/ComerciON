-- Remove o conceito de atacado (o produto agora foca em mecânicas e lojas
-- de auto peças, que trabalham com um preço só). O valor de "retailPrice"
-- existente é preservado na nova coluna "price" em vez de simplesmente
-- recriar a coluna com default 0.

ALTER TABLE "products" ADD COLUMN "price" DECIMAL(12,2) NOT NULL DEFAULT 0;
UPDATE "products" SET "price" = "retailPrice";
ALTER TABLE "products" DROP COLUMN "retailPrice";
ALTER TABLE "products" DROP COLUMN "wholesalePrice";

ALTER TABLE "customers" DROP COLUMN "priceTier";

DROP TYPE "PriceTier";
