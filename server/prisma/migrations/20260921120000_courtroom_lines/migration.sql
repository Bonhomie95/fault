-- What people say out loud in the room. Presentation, never evidence.
ALTER TABLE "cases" ADD COLUMN "lines" JSONB NOT NULL DEFAULT '[]';
