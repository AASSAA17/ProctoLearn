CREATE TABLE "audit_events" (
  "id" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorId" TEXT, "action" TEXT NOT NULL, "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL, "metadata" JSONB NOT NULL,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_events_createdAt_id_idx" ON "audit_events"("createdAt", "id");
CREATE INDEX "audit_events_targetType_targetId_idx" ON "audit_events"("targetType", "targetId");
CREATE TABLE "user_notifications" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "type" TEXT NOT NULL,
  "title" TEXT NOT NULL, "body" TEXT NOT NULL, "targetPath" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3), CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_notifications_dedupeKey_key" ON "user_notifications"("dedupeKey");
CREATE INDEX "user_notifications_userId_createdAt_id_idx" ON "user_notifications"("userId", "createdAt", "id");
CREATE INDEX "user_notifications_userId_readAt_idx" ON "user_notifications"("userId", "readAt");
