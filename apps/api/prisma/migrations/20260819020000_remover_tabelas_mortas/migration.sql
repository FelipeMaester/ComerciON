-- Remove três tabelas que nenhuma linha de código lê ou escreve.
--
--   tenant_modules   — os módulos vêm do plano da assinatura desde a Fase 3;
--                      esta tabela nunca chegou a ser usada e está vazia.
--   ai_conversations — sobra da tela de conversa com IA, removida do painel.
--   ai_messages      — idem.
--
-- ATENÇÃO, OPERADOR: as duas tabelas de IA PODEM TER DADOS. No banco de
-- desenvolvimento havia 2 conversas e 5 mensagens de testes antigos. Se a sua
-- instalação chegou a usar a tela de IA, o histórico daquelas conversas será
-- APAGADO — não há como recuperá-lo depois, a não ser pelo backup. O sistema
-- não lê esse histórico em lugar nenhum hoje, então nada deixa de funcionar;
-- o que se perde é o registro do que foi conversado.
--
-- Faça o backup antes (scripts/backup-db.sh) se quiser guardá-lo.
-- DropForeignKey
ALTER TABLE "ai_conversations" DROP CONSTRAINT "ai_conversations_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ai_conversations" DROP CONSTRAINT "ai_conversations_userId_fkey";

-- DropForeignKey
ALTER TABLE "ai_messages" DROP CONSTRAINT "ai_messages_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "tenant_modules" DROP CONSTRAINT "tenant_modules_tenantId_fkey";

-- DropTable
DROP TABLE "ai_conversations";

-- DropTable
DROP TABLE "ai_messages";

-- DropTable
DROP TABLE "tenant_modules";

-- DropEnum
DROP TYPE "AIMessageRole";

