CREATE TYPE "PilotMembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "EnrollmentAccessStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');

ALTER TABLE "enrollments"
  ADD COLUMN "accessStatus" "EnrollmentAccessStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "withdrawnAt" TIMESTAMP(3);

CREATE TABLE "pilot_invitations" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "tokenDigest" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "redeemedAt" TIMESTAMP(3),
  "redeemedById" TEXT,
  CONSTRAINT "pilot_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pilot_invitation_redemption_complete" CHECK (
    ("redeemedAt" IS NULL AND "redeemedById" IS NULL)
    OR ("redeemedAt" IS NOT NULL AND "redeemedById" IS NOT NULL)
  ),
  CONSTRAINT "pilot_invitation_digest_sha256" CHECK ("tokenDigest" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "pilot_memberships" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "invitationId" TEXT NOT NULL,
  "status" "PilotMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "suspendedAt" TIMESTAMP(3),
  "suspendedById" TEXT,
  "suspensionReason" TEXT,
  CONSTRAINT "pilot_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pilot_membership_suspension_complete" CHECK (
    ("status" = 'ACTIVE' AND "suspendedAt" IS NULL AND "suspendedById" IS NULL AND "suspensionReason" IS NULL)
    OR ("status" = 'SUSPENDED' AND "suspendedAt" IS NOT NULL AND "suspendedById" IS NOT NULL
      AND "suspensionReason" IS NOT NULL AND length(trim("suspensionReason")) > 0)
  )
);

CREATE UNIQUE INDEX "pilot_invitations_tokenDigest_key" ON "pilot_invitations"("tokenDigest");
CREATE UNIQUE INDEX "pilot_invitations_redeemedById_key" ON "pilot_invitations"("redeemedById");
CREATE INDEX "pilot_invitations_email_redeemedAt_revokedAt_idx" ON "pilot_invitations"("email", "redeemedAt", "revokedAt");
CREATE INDEX "pilot_invitations_expiresAt_idx" ON "pilot_invitations"("expiresAt");
CREATE UNIQUE INDEX "pilot_memberships_userId_key" ON "pilot_memberships"("userId");
CREATE UNIQUE INDEX "pilot_memberships_invitationId_key" ON "pilot_memberships"("invitationId");
CREATE INDEX "pilot_memberships_status_idx" ON "pilot_memberships"("status");

ALTER TABLE "pilot_invitations" ADD CONSTRAINT "pilot_invitations_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pilot_invitations" ADD CONSTRAINT "pilot_invitations_redeemedById_fkey"
  FOREIGN KEY ("redeemedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pilot_memberships" ADD CONSTRAINT "pilot_memberships_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pilot_memberships" ADD CONSTRAINT "pilot_memberships_invitationId_fkey"
  FOREIGN KEY ("invitationId") REFERENCES "pilot_invitations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pilot_memberships" ADD CONSTRAINT "pilot_memberships_suspendedById_fkey"
  FOREIGN KEY ("suspendedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "enrollments" ADD CONSTRAINT "enrollment_withdrawal_complete" CHECK (
  ("accessStatus" = 'ACTIVE' AND "withdrawnAt" IS NULL)
  OR ("accessStatus" = 'WITHDRAWN' AND "withdrawnAt" IS NOT NULL)
);
