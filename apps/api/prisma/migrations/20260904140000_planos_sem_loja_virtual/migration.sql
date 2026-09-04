-- Nenhum plano pode anunciar o que o produto não faz mais.
--
-- A fase de e-commerce (loja virtual, carrinho, checkout, expedição) saiu do
-- produto. Os ModuleKey ECOMMERCE, LOGISTICS e MARKETING continuaram no enum —
-- remover valor de enum no Postgres custa caro, e eles não gateiam nada:
-- nenhuma rota os exige.
--
-- Só que o plano Premium continuou CONCEDENDO os três, e a tela de Assinatura
-- lista os módulos concedidos como se fossem o que se leva pelo preço. Quem
-- abria a página lia "Loja virtual" e "Logística" entre os itens de um plano de
-- R$ 399. Promessa comercial que o sistema não tem como cumprir.
--
-- A causa estava em `seed.ts`, onde o Premium era definido por exclusão ("tudo
-- menos AI") e por isso abraçava qualquer valor que aparecesse no enum. Lá a
-- lista passou a ser explícita; aqui, o banco é acertado.
--
-- Escrito como regra, e não como correção de uma linha: tira os três de
-- QUALQUER plano que ainda os liste. Onde já estiver certo, não faz nada — o
-- que também respeita quem ajustou o próprio plano direto no banco, mesma
-- intenção do ON CONFLICT DO NOTHING da migration que criou os planos.
--
-- Não tira função de ninguém, justamente porque esses módulos não gateiam
-- nada: muda só o que é anunciado.
UPDATE "plans"
SET "modules" = ARRAY(
      SELECT unnest("modules")
      EXCEPT
      SELECT unnest(ARRAY['ECOMMERCE', 'LOGISTICS', 'MARKETING']::"ModuleKey"[])
    )::"ModuleKey"[],
    "updatedAt" = NOW()
WHERE "modules" && ARRAY['ECOMMERCE', 'LOGISTICS', 'MARKETING']::"ModuleKey"[];

-- O plano gratuito ainda se chamava "Trial" para quem paga.
--
-- O seed já o renomeou para "Avaliação", com o motivo escrito: era a única
-- palavra em inglês que chegava ao lojista, e ela aparece na tela de Planos e
-- dentro da mensagem que barra um módulo ("não está incluído no seu plano
-- atual"). Mas em produção quem cria os planos é a migration, não o seed — e
-- lá a tradução nunca chegou. O ajuste foi feito no ambiente errado.
--
-- A chave continua 'trial': ela é identificador, não texto de tela.
UPDATE "plans"
SET "name" = 'Avaliação',
    "updatedAt" = NOW()
WHERE "key" = 'trial'
  AND "name" = 'Trial';
