-- Planos padrão do SaaS.
--
-- Existiam só no `prisma db seed`, que o runbook de produção não roda. O
-- resultado, numa instalação limpa: a tabela de planos vazia, toda loja criada
-- sem assinatura e o ModulesGuard tratando "sem assinatura" como acesso
-- liberado. Ou seja, todo mundo com todos os módulos de graça, e a tela de
-- Assinatura sem nada para mostrar. Nada disso dava erro — por isso passou.
--
-- ON CONFLICT DO NOTHING porque isto é ponto de partida, não fonte de verdade
-- permanente: quem já rodou o seed, ou quem ajustou o preço direto no banco,
-- não pode ter esse valor sobrescrito por um deploy.
--
-- Mudou um plano? Mexa AQUI e em prisma/seed.ts (ensurePlans), que mantém os
-- dois em sincronia no ambiente de desenvolvimento.

INSERT INTO "plans" ("id", "key", "name", "priceMonthly", "modules", "createdAt", "updatedAt")
VALUES
  (
    gen_random_uuid(), 'trial', 'Trial', 0,
    ARRAY['CRM', 'INVENTORY', 'SUPPLIERS', 'SALES', 'FINANCE']::"ModuleKey"[],
    NOW(), NOW()
  ),
  (
    gen_random_uuid(), 'pro', 'Pro', 199,
    ARRAY['CRM', 'INVENTORY', 'SUPPLIERS', 'SALES', 'FINANCE', 'FISCAL', 'AUTOMATIONS']::"ModuleKey"[],
    NOW(), NOW()
  ),
  (
    -- Tudo menos AI: o chat com modelo de linguagem está desligado no produto
    -- (cobra por uso, e o valor que entregava — sugerir automações — hoje vem
    -- do motor de regras, de graça).
    gen_random_uuid(), 'premium', 'Premium', 399,
    ARRAY[
      'CRM', 'INVENTORY', 'SUPPLIERS', 'SALES', 'FINANCE', 'ECOMMERCE',
      'FISCAL', 'LOGISTICS', 'WHATSAPP', 'MARKETING', 'BI', 'AUTOMATIONS'
    ]::"ModuleKey"[],
    NOW(), NOW()
  )
ON CONFLICT ("key") DO NOTHING;
