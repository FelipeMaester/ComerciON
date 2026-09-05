-- PROVA (será removida): passa em banco vazio, falha em banco com dados.
--
-- Uma constraint CHECK não existe no schema do Prisma, então o guarda de
-- divergência não a enxerga — e é justamente por isso que ela serve aqui:
-- chega até o passo novo em vez de ser barrada antes.
--
-- Em banco vazio não há linha para violar a regra, e a migration passa.
-- Com o seed aplicado existem peças abaixo de R$ 1.000, e ela falha.
ALTER TABLE "products" ADD CONSTRAINT "prova_preco_alto" CHECK ("price" > 1000);
