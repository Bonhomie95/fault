-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('apple', 'google', 'device');

-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('district', 'state', 'national', 'supranational', 'international', 'world');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('pending', 'accepted', 'rejected', 'withdrawn');

-- CreateEnum
CREATE TYPE "MissionKind" AS ENUM ('daily', 'weekly', 'career');

-- AlterTable
ALTER TABLE "cases" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'NO',
ADD COLUMN     "defendantAppearance" DOUBLE PRECISION NOT NULL DEFAULT 50,
ADD COLUMN     "jurisdiction" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "tier" "Tier" NOT NULL DEFAULT 'district';

-- AlterTable
ALTER TABLE "juror_profiles" ADD COLUMN     "appearanceBias" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "currentCountry" TEXT,
ADD COLUMN     "currentStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currentTier" "Tier" NOT NULL DEFAULT 'district',
ADD COLUMN     "homeCountry" TEXT,
ADD COLUMN     "homeDistrict" TEXT,
ADD COLUMN     "lastDocketDay" TEXT,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "localeTag" TEXT,
ADD COLUMN     "longestStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rank" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "trust" DOUBLE PRECISION NOT NULL DEFAULT 50,
ADD COLUMN     "xp" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "verdicts" ADD COLUMN     "trustApplied" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trustDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "xpAwarded" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "auth_identities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jurisdiction_applications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "tier" "Tier" NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'pending',
    "decisionText" TEXT,
    "trustAtDecision" DOUBLE PRECISION,
    "rankAtDecision" INTEGER,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jurisdiction_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mission_progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "MissionKind" NOT NULL,
    "period" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "target" INTEGER NOT NULL,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "mission_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_identities_userId_idx" ON "auth_identities"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_provider_subject_key" ON "auth_identities"("provider", "subject");

-- CreateIndex
CREATE INDEX "jurisdiction_applications_userId_status_idx" ON "jurisdiction_applications"("userId", "status");

-- CreateIndex
CREATE INDEX "mission_progress_userId_period_idx" ON "mission_progress"("userId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "mission_progress_userId_key_period_key" ON "mission_progress"("userId", "key", "period");

-- AddForeignKey
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jurisdiction_applications" ADD CONSTRAINT "jurisdiction_applications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_progress" ADD CONSTRAINT "mission_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
