-- CreateTable
CREATE TABLE "whatsapp_auth_keys" (
    "tenantId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "chaveId" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_auth_keys_pkey" PRIMARY KEY ("tenantId","tipo","chaveId")
);

-- AddForeignKey
ALTER TABLE "whatsapp_auth_keys" ADD CONSTRAINT "whatsapp_auth_keys_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "whatsapp_sessions"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Move as chaves que já existem do blob para a tabela nova.
--
-- Sem isto, toda loja com WhatsApp conectado perderia as chaves do Signal na
-- primeira leitura depois do deploy: o Baileys não conseguiria descriptografar
-- nada e a loja teria que ler o QR de novo, sem nada na tela explicando por quê.
--
-- `credenciais->'keys'` é um objeto {tipo: {id: valor}}; os dois jsonb_each
-- abrem os dois níveis. Sessão sem a chave 'keys' (ou com ela nula) é ignorada
-- pelo próprio jsonb_each_text do primeiro nível.
-- O CASE está DENTRO do jsonb_each, e não num WHERE: "keys": null no JSON
-- não é NULL do SQL, então o COALESCE não o substitui, e jsonb_each de um null
-- estoura com "cannot call jsonb_each on a non-object". Num WHERE não há
-- garantia de que o filtro rode antes do LATERAL — uma única sessão com keys
-- nulo derrubaria a migration inteira, no deploy de todo mundo.
INSERT INTO "whatsapp_auth_keys" ("tenantId", "tipo", "chaveId", "valor", "updatedAt")
SELECT s."tenantId", tipo.key, chave.key, chave.value, NOW()
FROM "whatsapp_sessions" s,
     LATERAL jsonb_each(
       CASE WHEN jsonb_typeof(s."credenciais" -> 'keys') = 'object'
            THEN s."credenciais" -> 'keys' ELSE '{}'::jsonb END
     ) AS tipo(key, value),
     LATERAL jsonb_each(
       CASE WHEN jsonb_typeof(tipo.value) = 'object' THEN tipo.value ELSE '{}'::jsonb END
     ) AS chave(key, value)
ON CONFLICT ("tenantId", "tipo", "chaveId") DO NOTHING;

-- O blob fica só com as credenciais. Deixar as chaves para trás seria manter
-- duas verdades sobre a mesma coisa — e a próxima gravação regravaria a cópia
-- velha por cima.
UPDATE "whatsapp_sessions"
SET "credenciais" = "credenciais" - 'keys'
WHERE "credenciais" ? 'keys';
