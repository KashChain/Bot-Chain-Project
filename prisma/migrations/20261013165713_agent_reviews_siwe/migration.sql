-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "webhookSecret" TEXT;

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "reviewerAddress" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiweNonce" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiweNonce_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Review_taskId_key" ON "Review"("taskId");

-- CreateIndex
CREATE INDEX "Review_agentId_idx" ON "Review"("agentId");

-- CreateIndex
CREATE INDEX "Review_reviewerAddress_idx" ON "Review"("reviewerAddress");

-- CreateIndex
CREATE UNIQUE INDEX "SiweNonce_nonce_key" ON "SiweNonce"("nonce");

-- CreateIndex
CREATE INDEX "SiweNonce_address_idx" ON "SiweNonce"("address");

-- CreateIndex
CREATE INDEX "SiweNonce_expiresAt_idx" ON "SiweNonce"("expiresAt");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
