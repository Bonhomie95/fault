-- Two more channels a juror reads and none of which mean anything.
--
-- `appearance` has always been measured: whether a defendant's FACE moved the
-- verdict. This adds the other two things people read off a person in a room —
-- how they hold themselves, and how strange they seem — so the Juror Record can
-- say whether either of those moved it too.
--
-- All three are rolled server-side, blind to the verdict (domain/presentation).
-- Existing rows default to 50, the neutral midpoint: cases decided before this
-- migration carry no signal on the new channels and must not invent one. They
-- sit outside both measurement bands, so they are excluded from the scores
-- rather than counted as average — which is the honest treatment of a case
-- nobody was shown a body language for.

-- AlterTable
ALTER TABLE "cases" ADD COLUMN     "defendantDemeanour" DOUBLE PRECISION NOT NULL DEFAULT 50,
ADD COLUMN     "defendantOddity" DOUBLE PRECISION NOT NULL DEFAULT 50;

-- AlterTable
ALTER TABLE "juror_profiles" ADD COLUMN     "demeanourBias" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "oddityBias" DOUBLE PRECISION NOT NULL DEFAULT 0;

