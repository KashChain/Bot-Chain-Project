-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('CREATED', 'PAYMENT_PENDING', 'PAID', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "capabilities" TEXT[],
    "usageInstructions" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "priceWei" TEXT NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "metadataUri" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "clientAddress" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'CREATED',
    "priceWei" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BOT',
    "paymentTxHash" TEXT,
    "paymentVerifiedAt" TIMESTAMP(3),
    "resultRef" TEXT,
    "resultHash" TEXT,
    "result" JSONB,
    "error" TEXT,
    "onchainTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "amountWei" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletProfile" (
    "address" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletProfile_pkey" PRIMARY KEY ("address")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agent_slug_key" ON "Agent"("slug");

-- CreateIndex
CREATE INDEX "Agent_category_idx" ON "Agent"("category");

-- CreateIndex
CREATE INDEX "Agent_active_idx" ON "Agent"("active");

-- CreateIndex
CREATE INDEX "Agent_ownerAddress_idx" ON "Agent"("ownerAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Task_paymentTxHash_key" ON "Task"("paymentTxHash");

-- CreateIndex
CREATE INDEX "Task_clientAddress_idx" ON "Task"("clientAddress");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_agentId_idx" ON "Task"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_taskId_key" ON "Payment"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_txHash_key" ON "Payment"("txHash");

-- CreateIndex
CREATE INDEX "Payment_txHash_idx" ON "Payment"("txHash");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
