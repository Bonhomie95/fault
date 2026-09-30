-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isSynthetic" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "users_isSynthetic_idx" ON "users"("isSynthetic");
