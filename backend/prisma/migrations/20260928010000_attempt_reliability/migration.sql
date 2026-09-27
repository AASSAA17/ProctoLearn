CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
ALTER TABLE "attempts"
  ADD COLUMN "examSnapshot" JSONB,
  ADD COLUMN "draftAnswers" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "draftRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "draftUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "submissionDigest" TEXT,
  ADD COLUMN "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "flaggedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedBy" TEXT,
  ADD COLUMN "reviewReason" TEXT;
-- A historical flag is a request for review, not a ban on submitting answers.
UPDATE "attempts" a SET "flaggedAt" = COALESCE(a."finishedAt", a."startedAt"),
  "status" = CASE WHEN a."finishedAt" IS NULL THEN 'IN_PROGRESS'::"AttemptStatus"
    WHEN a."score" >= e."passScore" THEN 'FINISHED'::"AttemptStatus" ELSE 'FAILED'::"AttemptStatus" END
FROM "exams" e WHERE a."examId" = e.id AND a."status" = 'FLAGGED';
-- Earlier versions did not store question history. Freeze the currently known
-- version at the upgrade boundary, then use this immutable snapshot thereafter.
UPDATE "attempts" a SET "examSnapshot" = jsonb_build_object(
  'id', e.id, 'courseId', e."courseId", 'title', e.title,
  'duration', e.duration, 'passScore', e."passScore",
  'questions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id', q.id, 'text', q.text, 'type', q.type, 'options', q.options, 'answer', q.answer
  ) ORDER BY q.id) FROM "questions" q WHERE q."examId" = e.id), '[]'::jsonb)
) FROM "exams" e WHERE a."examId" = e.id;
ALTER TABLE "certificates" ADD COLUMN "issuedVia" TEXT NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "enrollments" ADD COLUMN "examAccessGrantedAt" TIMESTAMP(3), ADD COLUMN "examAccessGrantedBy" TEXT;
ALTER TABLE "lesson_progress" ADD COLUMN "completionSource" TEXT NOT NULL DEFAULT 'LEGACY';
