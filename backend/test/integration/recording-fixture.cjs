const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFile, mkdtemp, writeFile, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { Readable } = require('node:stream');
require('reflect-metadata');
const { PrismaClient } = require('@prisma/client');
const { RecordingUploadsService } = require('../../src/evidence/recording-uploads.service');
const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

function memoryStorage() {
  const objects = new Map();
  const dates = new Map();
  const removed = [];
  return {
    objects, dates, removed,
    uploadFile: async (path, key) => { objects.set(key, await readFile(path)); dates.set(key, new Date()); },
    getObject: async (key) => { if (!objects.has(key)) throw new Error('Object missing'); return Readable.from([objects.get(key)]); },
    removeObject: async (key) => { removed.push(key); objects.delete(key); dates.delete(key); },
    listObjects: async (prefix, limit, startAfter = '') => [...objects].filter(([key]) => key.startsWith(prefix) && key > startAfter).sort(([a], [b]) => a.localeCompare(b)).slice(0, limit).map(([name, data]) => ({ name, size: data.length, lastModified: dates.get(name) })),
  };
}

async function recordingFixture(storage = memoryStorage()) {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || new URL(url).pathname !== '/proctolearn_security_test') throw new Error('Dedicated local test database required');
  const db = new PrismaClient({ datasources: { db: { url } } });
  const [teacherId, studentId, otherId, courseId, examId] = Array.from({ length: 5 }, () => randomUUID());
  const directory = await mkdtemp(join(tmpdir(), 'proctolearn-upload-test-'));
  await db.user.createMany({ data: [teacherId, studentId, otherId].map((id, index) => ({ id, name: 'Upload fixture', email: `${id}@example.invalid`, password: 'not-a-login-hash', role: index ? 'STUDENT' : 'TEACHER' })) });
  await db.course.create({ data: { id: courseId, title: 'Upload fixture', teacherId } });
  await db.exam.create({ data: { id: examId, courseId, title: 'Upload fixture', duration: 30 } });
  const service = new RecordingUploadsService(db, storage);
  const newAttempt = (data = {}) => db.attempt.create({ data: { examId, userId: studentId, ...data } });
  const init = (attemptId, data = {}) => service.create(attemptId, { kind: 'camera', clientSessionId: randomUUID(), mimeType: 'video/webm', ...data }, studentId);
  const file = async (content = webm) => { const path = join(directory, randomUUID()); await writeFile(path, content); return path; };
  const close = async () => {
    await db.attempt.deleteMany({ where: { examId } });
    await db.course.delete({ where: { id: courseId } });
    await db.user.deleteMany({ where: { id: { in: [teacherId, studentId, otherId] } } });
    await db.$disconnect();
    // Dedicated mkdtemp fixture folder only; no production path is accepted.
    assert.ok(directory.startsWith(join(tmpdir(), 'proctolearn-upload-test-')));
    await rm(directory, { recursive: true, force: true });
  };
  return { db, service, storage, teacherId, studentId, otherId, newAttempt, init, file, close };
}
module.exports = { recordingFixture, memoryStorage, webm };
