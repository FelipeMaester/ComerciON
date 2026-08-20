-- CreateTable
CREATE TABLE "automation_analyses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "semResultado" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "automation_analyses_tenantId_key" ON "automation_analyses"("tenantId");

-- AddForeignKey
ALTER TABLE "automation_analyses" ADD CONSTRAINT "automation_analyses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
