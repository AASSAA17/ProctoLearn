import { Prisma } from '@prisma/client';

const metadataKeys: Record<string, readonly string[]> = {
  USER_ROLE_CHANGED: ['previousRole', 'role'],
  ADMIN_PASSWORD_RESET: [],
  ADMIN_EXAM_ACCESS_GRANTED: ['courseId'],
  ADMIN_CERTIFICATE_GRANTED: ['courseId', 'certificateId'],
  ADMIN_CERTIFICATE_REVOKED: ['certificateId', 'reason'],
  PROCTOR_ASSIGNED: ['proctorId'],
  PROCTOR_REVOKED: ['proctorId'],
  EVIDENCE_RETENTION_REQUESTED: ['attemptId', 'retentionDays'],
  EVIDENCE_RETENTION_DELETED: ['attemptId', 'retentionDays'],
  EVIDENCE_HOLD_CHANGED: ['attemptId', 'onHold'],
};

/** Call only inside the same transaction as the action. Do not log request bodies. */
export async function recordAudit(tx: Prisma.TransactionClient, event: {
  actorId: string | null; action: string; targetType: string; targetId: string; metadata?: Prisma.InputJsonObject;
}) {
  const keys = metadataKeys[event.action];
  if (!keys) throw new Error('Unknown audit action');
  const metadata: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, value] of Object.entries(event.metadata ?? {})) {
    if (!keys.includes(key) || !['string', 'number', 'boolean'].includes(typeof value)
      || (typeof value === 'string' && value.length > 128)) throw new Error('Unsafe audit metadata');
    metadata[key] = value as string | number | boolean;
  }
  return tx.auditEvent.create({ data: { ...event, metadata } });
}

/** Unique delivery key makes transaction retries and idempotent decisions produce one inbox item. */
export async function notifyUser(tx: Prisma.TransactionClient, notification: {
  userId: string; type: string; title: string; body: string; targetPath: string; dedupeKey: string;
}) {
  if (!/^\/dashboard(?:\/[a-zA-Z0-9_-]+)*$/.test(notification.targetPath)
    || notification.title.length > 160 || notification.body.length > 500 || notification.dedupeKey.length > 240) {
    throw new Error('Invalid internal notification');
  }
  await tx.userNotification.createMany({ data: [notification], skipDuplicates: true });
}
