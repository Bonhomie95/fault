-- CreateEnum
CREATE TYPE "Entitlement" AS ENUM ('campaign', 'no_ads', 'pack_corporate', 'pack_cold_case', 'pack_political');

-- CreateEnum
CREATE TYPE "PurchaseSource" AS ENUM ('store', 'merit', 'grant');

-- CreateEnum
CREATE TYPE "MeritReason" AS ENUM ('case_heard', 'mission', 'streak', 'rewarded_ad', 'purchase', 'refund', 'spend', 'grant');

-- AlterTable
ALTER TABLE "cases" ADD COLUMN     "servedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" DROP COLUMN "clockSeconds",
DROP COLUMN "trialUnlocked",
ADD COLUMN     "merit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC';

-- CreateTable
CREATE TABLE "user_entitlements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entitlement" "Entitlement" NOT NULL,
    "source" "PurchaseSource" NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "source" "PurchaseSource" NOT NULL,
    "amountMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "meritSpent" INTEGER NOT NULL DEFAULT 0,
    "transactionId" TEXT,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merit_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "MeritReason" NOT NULL,
    "reference" TEXT,
    "balance" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "viewId" TEXT,
    "meritPaid" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_entitlements_userId_idx" ON "user_entitlements"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_entitlements_userId_entitlement_key" ON "user_entitlements"("userId", "entitlement");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_transactionId_key" ON "purchases"("transactionId");

-- CreateIndex
CREATE INDEX "purchases_userId_idx" ON "purchases"("userId");

-- CreateIndex
CREATE INDEX "merit_entries_userId_createdAt_idx" ON "merit_entries"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ad_events_viewId_key" ON "ad_events"("viewId");

-- CreateIndex
CREATE INDEX "ad_events_userId_createdAt_idx" ON "ad_events"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merit_entries" ADD CONSTRAINT "merit_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_events" ADD CONSTRAINT "ad_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
