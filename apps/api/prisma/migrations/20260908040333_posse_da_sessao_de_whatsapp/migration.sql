-- CreateTable
CREATE TABLE "whatsapp_session_owners" (
    "tenantId" TEXT NOT NULL,
    "instanciaId" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_session_owners_pkey" PRIMARY KEY ("tenantId")
);

-- CreateIndex
CREATE INDEX "whatsapp_session_owners_expiraEm_idx" ON "whatsapp_session_owners"("expiraEm");
