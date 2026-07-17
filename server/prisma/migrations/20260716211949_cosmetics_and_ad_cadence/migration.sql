-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Entitlement" ADD VALUE 'seal_brass';
ALTER TYPE "Entitlement" ADD VALUE 'seal_obsidian';
ALTER TYPE "Entitlement" ADD VALUE 'seal_ivory';
ALTER TYPE "Entitlement" ADD VALUE 'room_oak';
ALTER TYPE "Entitlement" ADD VALUE 'room_concrete';
ALTER TYPE "Entitlement" ADD VALUE 'stock_onionskin';
ALTER TYPE "Entitlement" ADD VALUE 'stock_vellum';
ALTER TYPE "Entitlement" ADD VALUE 'patron';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "adEveryNCases" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "casesSinceAd" INTEGER NOT NULL DEFAULT 0;
