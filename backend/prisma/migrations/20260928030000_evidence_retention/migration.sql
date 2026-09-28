ALTER TABLE "attempts" ADD COLUMN "evidenceLegalHold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "evidenceHoldReason" TEXT, ADD COLUMN "evidenceHoldAt" TIMESTAMP(3), ADD COLUMN "evidenceHoldBy" TEXT;
ALTER TABLE "evidence_files" ADD COLUMN "deletionRequestedAt" TIMESTAMP(3), ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "evidence_files_deletedAt_createdAt_idx" ON "evidence_files"("deletedAt", "createdAt");
CREATE TABLE "evidence_deletion_jobs" (
  "id" TEXT NOT NULL, "evidenceId" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'PENDING',
  "retentionDays" INTEGER NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3), "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3), CONSTRAINT "evidence_deletion_jobs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "evidence_deletion_jobs_evidenceId_key" ON "evidence_deletion_jobs"("evidenceId");
CREATE INDEX "evidence_deletion_jobs_state_leaseUntil_idx" ON "evidence_deletion_jobs"("state", "leaseUntil");
ALTER TABLE "evidence_deletion_jobs" ADD CONSTRAINT "evidence_deletion_jobs_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidence_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
