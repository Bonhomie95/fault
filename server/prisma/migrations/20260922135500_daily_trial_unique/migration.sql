-- One Daily Trial per juror per day.
CREATE UNIQUE INDEX "cases_userId_dailyKey_key" ON "cases"("userId", "dailyKey");
