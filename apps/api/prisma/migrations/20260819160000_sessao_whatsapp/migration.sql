-- Sessão do WhatsApp por loja, para a conexão via QR Code.
--
-- Cada loja conecta o PRÓPRIO número lendo um QR na tela, como no WhatsApp
-- Web. As credenciais da sessão ficam aqui em vez de num arquivo no disco:
-- o servidor pode rodar em container sem volume persistente, e sem isto o
-- lojista teria que ler o QR de novo a cada reinício da API.
--
-- ATENÇÃO, OPERADOR: a coluna "credenciais" dá acesso à conta de WhatsApp
-- da loja. Trate como senha: não exporte, não copie para ambiente de teste,
-- e lembre que ela entra nos backups.
-- CreateTable
CREATE TABLE "whatsapp_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "credenciais" JSONB NOT NULL,
    "numero" TEXT,
    "conectadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_sessions_tenantId_key" ON "whatsapp_sessions"("tenantId");

-- AddForeignKey
ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "whatsapp_sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

