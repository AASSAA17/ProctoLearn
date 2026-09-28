/** Missing disables retention; invalid explicit values must fail closed. */
export function retentionDays(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value);
  if (!/^[1-9]\d*$/.test(text) || Number(text) > 36500) throw new Error('EVIDENCE_RETENTION_DAYS must be an integer from 1 to 36500');
  return Number(text);
}

export function evidenceMetadata(file: any) {
  return { id: file.id, attemptId: file.attemptId, type: file.type, createdAt: file.createdAt,
    state: file.deletedAt ? 'DELETED' : file.deletionRequestedAt ? 'DELETION_PENDING' : 'AVAILABLE',
    deletionRequestedAt: file.deletionRequestedAt ?? null, deletedAt: file.deletedAt ?? null };
}

export function retentionEligibility(file: any, days: number, now = new Date()): string | null {
  const attempt = file.attempt;
  if (file.deletedAt) return 'ALREADY_DELETED';
  if (!attempt || !attempt.finishedAt || !['FINISHED', 'FAILED'].includes(attempt.status)) return 'ACTIVE_ATTEMPT';
  if (attempt.evidenceLegalHold) return 'LEGAL_HOLD';
  if (!attempt.reviewedAt || !['APPROVED', 'REJECTED'].includes(attempt.reviewStatus)) return 'PENDING_REVIEW';
  if (attempt.appeal?.state === 'OPEN') return 'OPEN_APPEAL';
  if (attempt.reviewStatus === 'REJECTED' && (!attempt.appeal || !['UPHELD', 'OVERTURNED'].includes(attempt.appeal.state))) return 'APPEAL_POSSIBLE';
  if (attempt.appeal && !attempt.appeal.decidedAt) return 'APPEAL_INCOMPLETE';
  if (attempt.recordingUploads?.some((upload: any) => ['OPEN', 'FINALIZING'].includes(upload.state) || (upload.finalizeLeaseUntil && upload.finalizeLeaseUntil > now))) return 'UPLOAD_IN_PROGRESS';
  if (attempt.recordingUploads?.some((upload: any) => upload._count?.chunks > 0)) return 'STAGED_CHUNKS_REMAIN';
  const boundary = Math.max(new Date(file.createdAt).getTime(), new Date(attempt.finishedAt).getTime(), new Date(attempt.reviewedAt).getTime(), attempt.appeal?.decidedAt ? new Date(attempt.appeal.decidedAt).getTime() : 0);
  if (!Number.isFinite(boundary) || boundary > now.getTime() - days * 86_400_000) return 'TOO_RECENT';
  // Old absolute URLs or foreign namespaces require an explicit, separately reviewed migration.
  if (typeof file.url !== 'string' || !file.url.startsWith(`recordings/${file.attemptId}/`) || file.url.includes('..') || file.url.includes('\\') || /[\x00-\x1f]/.test(file.url)) return 'UNSUPPORTED_OBJECT_KEY';
  return null;
}
