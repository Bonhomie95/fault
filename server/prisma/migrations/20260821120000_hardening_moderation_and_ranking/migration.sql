-- Hardening: moderation, receipt ownership, and index-backed ranking.
--
-- Three things worth knowing before this runs.
--
-- 1. characters(userId, name) becomes UNIQUE. A name IS a character's identity
--    in the Echo System, so two rows for one name is one person split in half
--    — half their echoes resolving to each. The guard below fails the
--    migration loudly rather than letting CREATE UNIQUE INDEX fail with an
--    error that says nothing about what to do next.
--
-- 2. city_state.peaceIndex is denormalised from the six dials. It is
--    backfilled here with exactly the expression in domain/peace.PEACE_SQL;
--    if those weights ever change, both change together.
--
-- 3. Everything else is additive and nullable. No data is dropped.

-- AlterTable
ALTER TABLE "cases" ADD COLUMN     "quarantinedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "city_state" ADD COLUMN     "peaceIndex" DOUBLE PRECISION NOT NULL DEFAULT 50;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "nameChangedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "content_reports" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT,
    "kind" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_reports_reviewedAt_createdAt_idx" ON "content_reports"("reviewedAt", "createdAt");

-- CreateIndex
CREATE INDEX "content_reports_kind_subjectId_idx" ON "content_reports"("kind", "subjectId");


-- Refuse to proceed if any juror already holds two characters by one name.
-- Names are the Echo System's identity key; merging them here would be
-- guessing at which person's history to keep.
DO $$
DECLARE dupes integer;
BEGIN
  SELECT count(*) INTO dupes FROM (
    SELECT "userId", name FROM "characters"
    GROUP BY "userId", name HAVING count(*) > 1
  ) d;
  IF dupes > 0 THEN
    RAISE EXCEPTION
      'Cannot add characters(userId, name) unique index: % duplicate name groups exist. Resolve them before migrating.', dupes;
  END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "characters_userId_name_key" ON "characters"("userId", "name");

-- CreateIndex
CREATE INDEX "city_state_peaceIndex_idx" ON "city_state"("peaceIndex");

-- CreateIndex
CREATE INDEX "juror_profiles_totalCases_idx" ON "juror_profiles"("totalCases");

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill peaceIndex for every existing city. Must match
-- domain/peace.peaceIndex exactly — this is the same weighted sum, clamped to
-- 0..100 the same way.
UPDATE "city_state" cs
SET "peaceIndex" = GREATEST(0, LEAST(100,
    ((100 - cs."crimeRate")            * 0.3
   + cs."judicialTrust"                * 0.25
   + cs."policeIntegrity"              * 0.2
   + (100 - cs."organizedCrimePower")  * 0.15
   + (100 - cs."wealthDisparity")      * 0.1)
));
