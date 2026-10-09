ALTER TABLE "certificates"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'VALID',
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "revokedBy" TEXT,
  ADD COLUMN "revocationReason" TEXT;

CREATE INDEX "certificates_status_idx" ON "certificates"("status");
