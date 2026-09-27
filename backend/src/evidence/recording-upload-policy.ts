import { BadRequestException, ForbiddenException, GoneException } from '@nestjs/common';
import { attemptDeadline } from '../attempts/attempt-policy';
import { snapshotDuration } from '../attempts/attempt-state';

export const CHUNK_LIMIT = 8 * 1024 * 1024;
export const ATTEMPT_BYTE_LIMIT = 512 * 1024 * 1024;
export const APPEAL_BYTE_LIMIT = 2 * ATTEMPT_BYTE_LIMIT;
export const SESSION_LIMIT = 12;
export const CHUNK_COUNT_LIMIT = 8192;
export const UPLOAD_GRACE_MS = 24 * 60 * 60 * 1000;
export const FINALIZE_LEASE_MS = 5 * 60 * 1000;
export const RECORDING_MIMES = ['video/webm', 'video/mp4', 'video/ogg', 'video/x-matroska'];

/** One appeal adds one bounded recovery allowance; all historical uploads still count. */
export function recordingByteLimit(attempt: any): number {
  return attempt.reviewStatus === 'REJECTED' && attempt.appeal?.state === 'OPEN'
    ? APPEAL_BYTE_LIMIT : ATTEMPT_BYTE_LIMIT;
}

export function normalizeRecordingMime(value: string) {
  const mime = value.split(';', 1)[0].trim().toLowerCase();
  if (!RECORDING_MIMES.includes(mime)) throw new BadRequestException({ code: 'RECORDING_FORMAT', message: 'Видео түрі жарамсыз' });
  return mime;
}

export function recordingDeadline(attempt: any): Date {
  if (attempt.reviewStatus === 'REJECTED' && attempt.appeal?.state === 'OPEN') {
    return new Date(new Date(attempt.appeal.createdAt).getTime() + UPLOAD_GRACE_MS);
  }
  const deadline = attemptDeadline(new Date(attempt.startedAt), snapshotDuration(attempt));
  const endedAt = attempt.finishedAt ? Math.min(new Date(attempt.finishedAt).getTime(), deadline) : deadline;
  return new Date(endedAt + UPLOAD_GRACE_MS);
}

export function assertRecordingWindow(attempt: any, now = Date.now()) {
  if (attempt.reviewStatus !== 'PENDING' && !(attempt.reviewStatus === 'REJECTED' && attempt.appeal?.state === 'OPEN')) {
    throw new ForbiddenException({ code: 'REVIEW_LOCKED', message: 'Тексерілген жазбаларды өзгертуге болмайды' });
  }
  const deadline = recordingDeadline(attempt);
  if (now > deadline.getTime()) throw new GoneException({ code: 'UPLOAD_EXPIRED', message: 'Жазбаны жүктеу уақыты аяқталды' });
  return deadline;
}

export function recordingManifest(upload: any) {
  return {
    id: upload.id, attemptId: upload.attemptId, kind: upload.kind, clientSessionId: upload.clientSessionId,
    mimeType: upload.mimeType, state: upload.state, bytes: upload.bytes,
    expectedChunks: upload.expectedChunks ?? null, interrupted: upload.interrupted,
    expiresAt: upload.expiresAt, evidenceId: upload.evidenceId ?? null,
    chunks: (upload.chunks ?? []).map(({ index, sha256, size }: any) => ({ index, sha256, size })),
  };
}
