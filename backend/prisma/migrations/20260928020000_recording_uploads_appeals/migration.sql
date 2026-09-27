-- CreateTable
CREATE TABLE "recording_uploads" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "clientSessionId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "expectedChunks" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "evidenceId" TEXT,
    "interrupted" BOOLEAN NOT NULL DEFAULT false,
    "finalizeToken" TEXT,
    "finalizeLeaseUntil" TIMESTAMP(3),

    CONSTRAINT "recording_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recording_chunks" (
    "uploadId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "objectKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recording_chunks_pkey" PRIMARY KEY ("uploadId","index")
);

-- CreateTable
CREATE TABLE "attempt_appeals" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "response" TEXT,

    CONSTRAINT "attempt_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_reviews" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recording_uploads_evidenceId_key" ON "recording_uploads"("evidenceId");

-- CreateIndex
CREATE INDEX "recording_uploads_state_expiresAt_idx" ON "recording_uploads"("state", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "recording_uploads_attemptId_kind_clientSessionId_key" ON "recording_uploads"("attemptId", "kind", "clientSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "recording_chunks_objectKey_key" ON "recording_chunks"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_appeals_attemptId_key" ON "attempt_appeals"("attemptId");

-- CreateIndex
CREATE INDEX "attempt_reviews_attemptId_createdAt_idx" ON "attempt_reviews"("attemptId", "createdAt");

-- AddForeignKey
ALTER TABLE "recording_uploads" ADD CONSTRAINT "recording_uploads_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording_chunks" ADD CONSTRAINT "recording_chunks_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "recording_uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_appeals" ADD CONSTRAINT "attempt_appeals_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_reviews" ADD CONSTRAINT "attempt_reviews_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the initial decision when a later appeal adds another review.
INSERT INTO "attempt_reviews" ("id", "attemptId", "reviewerId", "decision", "reason", "source", "createdAt")
SELECT 'initial-' || "id", "id", "reviewedBy", "reviewStatus"::text,
  COALESCE("reviewReason", 'Legacy review'), 'INITIAL', COALESCE("reviewedAt", "finishedAt", "startedAt")
FROM "attempts" WHERE "reviewStatus" <> 'PENDING' AND "reviewedBy" IS NOT NULL;
