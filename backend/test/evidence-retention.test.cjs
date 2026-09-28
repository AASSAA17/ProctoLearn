const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { retentionDays, retentionEligibility, evidenceMetadata } = require('../src/evidence/evidence-retention-policy');
const { EvidenceService } = require('../src/evidence/evidence.service');
const { EvidenceRetentionService } = require('../src/evidence/evidence-retention.service');
const { ConfigService } = require('@nestjs/config');
const old = new Date('2020-01-01');
const file = () => ({ id: 'e1', attemptId: 'a1', url: 'recordings/a1/camera.webm', createdAt: old, attempt: { finishedAt: old, reviewedAt: old, status: 'FINISHED', reviewStatus: 'APPROVED', recordingUploads: [] } });

test('retention is opt-in and rejects malformed, zero, negative or excessive configuration', () => {
  for (const value of [undefined, null, '']) assert.equal(retentionDays(value), null);
  assert.equal(retentionDays('30'), 30);
  for (const value of ['0', '-1', '1.5', ' 30 ', 'false', '36501', 'Infinity']) assert.throws(() => retentionDays(value));
});

test('eligibility protects review, appeal, legal hold and upload states independently', () => {
  const cases = [
    [{ finishedAt: null }, 'ACTIVE_ATTEMPT'], [{ status: 'IN_PROGRESS' }, 'ACTIVE_ATTEMPT'],
    [{ reviewStatus: 'PENDING' }, 'PENDING_REVIEW'], [{ reviewedAt: null }, 'PENDING_REVIEW'],
    [{ evidenceLegalHold: true }, 'LEGAL_HOLD'], [{ appeal: { state: 'OPEN' } }, 'OPEN_APPEAL'],
    [{ reviewStatus: 'REJECTED' }, 'APPEAL_POSSIBLE'],
    [{ recordingUploads: [{ state: 'OPEN' }] }, 'UPLOAD_IN_PROGRESS'],
    [{ recordingUploads: [{ state: 'FINALIZING' }] }, 'UPLOAD_IN_PROGRESS'],
    [{ recordingUploads: [{ state: 'COMPLETE', _count: { chunks: 1 } }] }, 'STAGED_CHUNKS_REMAIN'],
    [{ appeal: { state: 'UPHELD', decidedAt: null } }, 'APPEAL_INCOMPLETE'],
  ];
  for (const [patch, expected] of cases) { const item = file(); Object.assign(item.attempt, patch); assert.equal(retentionEligibility(item, 30), expected); }
  assert.equal(retentionEligibility(file(), 30), null);
  const rejected = file(); Object.assign(rejected.attempt, { reviewStatus: 'REJECTED', appeal: { state: 'UPHELD', decidedAt: old } });
  assert.equal(retentionEligibility(rejected, 30), null);
});

test('age starts at the latest review, appeal or evidence timestamp and rejects legacy URL keys', () => {
  for (const field of ['finishedAt', 'reviewedAt']) { const item = file(); item.attempt[field] = new Date(); assert.equal(retentionEligibility(item, 30), 'TOO_RECENT'); }
  const item = file(); item.attempt.appeal = { state: 'OVERTURNED', decidedAt: new Date() };
  assert.equal(retentionEligibility(item, 30), 'TOO_RECENT');
  for (const url of ['https://example.invalid/recording', 'recordings/other/file', 'recordings/a1/../other', 'recordings/a1/\\other']) assert.equal(retentionEligibility({ ...file(), url }, 30), 'UNSUPPORTED_OBJECT_KEY');
});

test('disabled retention does not query the database or storage', async () => {
  const fail = new Proxy({}, { get() { throw new Error('Disabled must not touch persistence'); } });
  assert.deepEqual(await new EvidenceRetentionService(fail, fail, new ConfigService({})).run({ apply: true }), { enabled: false, apply: true, scanned: 0, results: [], nextCursor: null });
});

test('read metadata never exposes object keys and deletion states never sign a URL', async () => {
  const files = [{ ...file(), type: 'recording_camera' }, { ...file(), id: 'e2', deletionRequestedAt: old }, { ...file(), id: 'e3', deletionRequestedAt: old, deletedAt: old }];
  const db = { attempt: { findUnique: async () => ({ id: 'a1' }) }, evidenceFile: { findMany: async () => files } };
  const signed = [];
  const output = await new EvidenceService(db, { getPresignedUrl: async (key) => { signed.push(key); return 'https://signed.invalid'; } }).getEvidenceByAttempt('a1', { id: 'admin', role: 'ADMIN' });
  assert.deepEqual(output.map((item) => item.state), ['AVAILABLE', 'DELETION_PENDING', 'DELETED']);
  assert.equal(signed.length, 1);
  assert.equal(output[1].url, undefined); assert.equal(output[2].url, undefined);
  assert.ok(!JSON.stringify(output).includes('recordings/a1'));
  assert.equal(evidenceMetadata(file()).attempt, undefined);
});

test('hold service enforces admin access before any lookup', async () => {
  await assert.rejects(new EvidenceRetentionService({}, {}, {}).setHold('a1', { id: 'student', role: 'STUDENT' }, true, 'Investigation'), (error) => error.getStatus() === 403);
});
