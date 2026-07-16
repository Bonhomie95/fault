-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('guilty', 'not_guilty');

-- CreateEnum
CREATE TYPE "CorrectVerdict" AS ENUM ('guilty', 'not_guilty', 'ambiguous');

-- CreateEnum
CREATE TYPE "CharacterRole" AS ENUM ('defendant', 'witness', 'prosecutor', 'defender', 'victim');

-- CreateEnum
CREATE TYPE "CharacterFate" AS ENUM ('convicted', 'acquitted', 'untried');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "jurorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clockSeconds" INTEGER NOT NULL DEFAULT 120,
    "trialUnlocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "city_state" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "crimeRate" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "judicialTrust" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "wealthDisparity" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "organizedCrimePower" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "policeIntegrity" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "mediaPressure" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "activeFactions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "city_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "charge" TEXT NOT NULL,
    "accent" TEXT NOT NULL,
    "mood" TEXT NOT NULL,
    "defendantName" TEXT NOT NULL,
    "defendantAge" INTEGER NOT NULL,
    "defendantOccupation" TEXT NOT NULL,
    "defendantBackground" TEXT NOT NULL,
    "defendantWealth" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "evidence" JSONB NOT NULL,
    "witnesses" JSONB NOT NULL,
    "prosecutionArgument" TEXT NOT NULL,
    "defenceArgument" TEXT NOT NULL,
    "correctVerdict" "CorrectVerdict" NOT NULL,
    "evidenceStrength" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isHandAuthored" BOOLEAN NOT NULL DEFAULT false,
    "structureKey" TEXT,
    "consensusGuilty" INTEGER NOT NULL DEFAULT 0,
    "consensusNotGuilty" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verdicts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "verdict" "Verdict" NOT NULL,
    "timeRemaining" INTEGER NOT NULL,
    "wasHung" BOOLEAN NOT NULL DEFAULT false,
    "outcomeText" TEXT,
    "outcomeSeen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verdicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "characters" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "CharacterRole" NOT NULL,
    "fate" "CharacterFate" NOT NULL,
    "portraitSeed" INTEGER NOT NULL,
    "themes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "originCaseId" TEXT NOT NULL,
    "originCaseNumber" INTEGER NOT NULL,
    "lastUsedCase" INTEGER NOT NULL,
    "relevanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "echoCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "juror_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "convictionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidenceWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "socioeconomicBias" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consistencyScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pressureAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gutAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCases" INTEGER NOT NULL DEFAULT 0,
    "writtenProfile" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "juror_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "city_state_userId_key" ON "city_state"("userId");

-- CreateIndex
CREATE INDEX "cases_userId_structureKey_idx" ON "cases"("userId", "structureKey");

-- CreateIndex
CREATE UNIQUE INDEX "cases_userId_caseNumber_key" ON "cases"("userId", "caseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "verdicts_caseId_key" ON "verdicts"("caseId");

-- CreateIndex
CREATE INDEX "verdicts_userId_createdAt_idx" ON "verdicts"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "characters_userId_lastUsedCase_idx" ON "characters"("userId", "lastUsedCase");

-- CreateIndex
CREATE UNIQUE INDEX "juror_profiles_userId_key" ON "juror_profiles"("userId");

-- AddForeignKey
ALTER TABLE "city_state" ADD CONSTRAINT "city_state_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verdicts" ADD CONSTRAINT "verdicts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verdicts" ADD CONSTRAINT "verdicts_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_originCaseId_fkey" FOREIGN KEY ("originCaseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "juror_profiles" ADD CONSTRAINT "juror_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
