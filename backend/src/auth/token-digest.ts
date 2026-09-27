import { createHash } from 'crypto';

// Tokens have cryptographic entropy; hash every byte, without bcrypt's 72-byte truncation.
export function tokenDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
