-- Migration de sabotagem: passa em banco vazio, falha em banco com dados.
-- Existe só para provar que o job novo enxerga a diferença.
ALTER TABLE "products" ADD COLUMN "curva_abc" TEXT NOT NULL;
