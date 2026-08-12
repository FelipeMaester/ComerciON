-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "danfeUrl" TEXT,
ADD COLUMN     "externalRef" TEXT,
ADD COLUMN     "protocol" TEXT,
ADD COLUMN     "sefazMessage" TEXT,
ADD COLUMN     "sefazStatus" TEXT,
ADD COLUMN     "xmlUrl" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "cfop" TEXT,
ADD COLUMN     "icmsCst" TEXT,
ADD COLUMN     "icmsOrigem" TEXT DEFAULT '0',
ADD COLUMN     "ncm" TEXT;
