-- Cobrança que espera autorização antes de sair.
--
-- Duas adições, nenhuma destrutiva:
--
--   MessageStatus.AGUARDANDO_APROVACAO — a mensagem já escrita, ainda não
--   enviada. Fica na conversa do cliente, visível no Inbox, até alguém da
--   loja autorizar ou descartar.
--
--   AutomationAction.PREPARE_WHATSAPP — a ação que produz essa mensagem. É o
--   meio-termo entre "a loja cobra na mão, uma por uma" e "o robô manda
--   sozinho para todo mundo": o sistema escreve, a pessoa decide.
ALTER TYPE "MessageStatus" ADD VALUE 'AGUARDANDO_APROVACAO';
ALTER TYPE "AutomationAction" ADD VALUE 'PREPARE_WHATSAPP';
