-- O custo da peça no momento da venda.
--
-- Sem esta coluna não existe margem histórica: o custo vive em products.costPrice,
-- que muda a cada recompra, e toda venda antiga passaria a ser calculada com o
-- custo de hoje.
ALTER TABLE "sale_items" ADD COLUMN "unitCost" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Preenche o passado com o custo ATUAL da peça.
--
-- É uma aproximação, e a única disponível: o custo do dia da venda não existe
-- em lugar nenhum — é justamente o que esta migration passa a guardar. Para as
-- vendas já feitas, o custo de hoje é o melhor palpite; daqui para frente, o
-- número é exato.
--
-- Quem for analisar margem histórica precisa saber disso, então fica escrito
-- aqui e não só no commit.
UPDATE "sale_items" si
SET "unitCost" = p."costPrice"
FROM "products" p
WHERE si."productId" = p.id AND si."unitCost" = 0;
