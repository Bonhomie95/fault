-- CreateEnum
CREATE TYPE "NewsKind" AS ENUM ('verdict', 'backlash', 'crime', 'protest', 'reform', 'syndicate', 'police', 'economy', 'press', 'echo', 'city');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "appleRefreshToken" TEXT,
ADD COLUMN     "consentVersion" TEXT,
ADD COLUMN     "consentedAt" TIMESTAMP(3),
ADD COLUMN     "currentDistrict" TEXT,
ADD COLUMN     "lastCityTickAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lastRewardDay" TEXT,
ADD COLUMN     "unlockedDistricts" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "news_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outlet" TEXT NOT NULL,
    "kind" "NewsKind" NOT NULL,
    "headline" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "district" TEXT,
    "caseId" TEXT,
    "severity" INTEGER NOT NULL DEFAULT 1,
    "read" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "news_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "news_items_userId_createdAt_idx" ON "news_items"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "news_items" ADD CONSTRAINT "news_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
