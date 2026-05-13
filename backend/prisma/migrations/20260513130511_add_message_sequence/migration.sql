-- Adds a monotonically-increasing `sequence` column to Message so that rows
-- written in the same millisecond (multiple writes inside one appendTurn)
-- have a stable replay order. Without this, an Anthropic tool_result can
-- come back ahead of its tool_use on reload and the next API call fails.
--
-- Strategy: add the column with a default of 0 so any existing rows are
-- accepted, then backfill per-conversation sequence numbers in createdAt
-- order (best-effort tiebreaker by id), then drop the default.

-- 1. Add the column with a default so the NOT NULL constraint passes on
--    existing rows.
ALTER TABLE "Message" ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 0;

-- 2. Backfill: per conversation, number messages from 0 by createdAt asc,
--    breaking ties on id so the result is deterministic.
WITH ordered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "conversationId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) - 1 AS seq
  FROM "Message"
)
UPDATE "Message" m
SET "sequence" = ordered.seq
FROM ordered
WHERE m."id" = ordered."id";

-- 3. Drop the default — every new write must supply an explicit sequence.
ALTER TABLE "Message" ALTER COLUMN "sequence" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Message_conversationId_sequence_idx" ON "Message"("conversationId", "sequence");
