-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('NONE', 'SKIPPED', 'PENDING', 'CONFIRMED', 'FAILED');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "receiptStatus" "ReceiptStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "receiptError" TEXT,
ADD COLUMN     "receiptAttempts" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Task_receiptStatus_idx" ON "Task"("receiptStatus");
