-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Entitlement" ADD VALUE 'room_marble';
ALTER TYPE "Entitlement" ADD VALUE 'room_night';
ALTER TYPE "Entitlement" ADD VALUE 'seal_gold';
ALTER TYPE "Entitlement" ADD VALUE 'pass';

-- AlterTable
ALTER TABLE "ad_events" ADD COLUMN     "reward" TEXT;

-- AlterTable
ALTER TABLE "cases" ADD COLUMN     "dailyKey" TEXT,
ADD COLUMN     "pack" TEXT;

-- AlterTable
ALTER TABLE "user_entitlements" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "bonusCases" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bonusCasesDay" TEXT,
ADD COLUMN     "roomTheme" TEXT,
ADD COLUMN     "sealStyle" TEXT,
ADD COLUMN     "streakShields" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "daily_trials" (
    "day" TEXT NOT NULL,
    "payload" JSONB,
    "seedIndex" INTEGER,
    "guilty" INTEGER NOT NULL DEFAULT 0,
    "notGuilty" INTEGER NOT NULL DEFAULT 0,
    "hung" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_trials_pkey" PRIMARY KEY ("day")
);
