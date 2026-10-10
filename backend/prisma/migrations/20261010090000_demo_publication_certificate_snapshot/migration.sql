-- Legacy courses remain private until their owner deliberately publishes them.
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
ALTER TABLE "courses" ADD COLUMN "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "publishedAt" TIMESTAMP(3);

-- Historical display names cannot be reconstructed from mutable current records.
ALTER TABLE "certificates" ADD COLUMN "recipientName" TEXT,
  ADD COLUMN "courseTitle" TEXT, ADD COLUMN "issuerName" TEXT,
  ADD COLUMN "snapshotStatus" TEXT NOT NULL DEFAULT 'LEGACY_UNAVAILABLE';

-- Deliberately fail on pre-existing duplicate active certificates; never discard history.
CREATE UNIQUE INDEX "certificates_one_active_per_course"
  ON "certificates" ("userId", "courseId") WHERE "status" = 'VALID';

ALTER TABLE "certificates" ADD CONSTRAINT "certificate_snapshot_complete" CHECK (
  ("snapshotStatus" = 'LEGACY_UNAVAILABLE' AND "recipientName" IS NULL AND "courseTitle" IS NULL AND "issuerName" IS NULL)
  OR ("snapshotStatus" = 'CAPTURED' AND length(trim("recipientName")) > 0
    AND length(trim("courseTitle")) > 0 AND length(trim("issuerName")) > 0
    AND "recipientName" IS NOT NULL AND "courseTitle" IS NOT NULL AND "issuerName" IS NOT NULL)
);

CREATE FUNCTION preserve_certificate_issuance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."userId", NEW."courseId", NEW."qrCode", NEW."issuedAt", NEW."issuedVia",
      NEW."recipientName", NEW."courseTitle", NEW."issuerName", NEW."snapshotStatus")
    IS DISTINCT FROM ROW(OLD."userId", OLD."courseId", OLD."qrCode", OLD."issuedAt", OLD."issuedVia",
      OLD."recipientName", OLD."courseTitle", OLD."issuerName", OLD."snapshotStatus") THEN
    RAISE EXCEPTION 'Certificate issuance facts are immutable';
  END IF;
  IF OLD."status" = 'REVOKED' AND ROW(NEW."status", NEW."revokedAt", NEW."revokedBy", NEW."revocationReason")
    IS DISTINCT FROM ROW(OLD."status", OLD."revokedAt", OLD."revokedBy", OLD."revocationReason") THEN
    RAISE EXCEPTION 'Certificate revocation is final';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "certificate_issuance_immutable" BEFORE UPDATE ON "certificates"
  FOR EACH ROW EXECUTE FUNCTION preserve_certificate_issuance();
