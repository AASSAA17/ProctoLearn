const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('reflect-metadata');
const { PrismaClient } = require('@prisma/client');
const { UsersService } = require('../../src/users/users.service');
const { AdminService } = require('../../src/admin/admin.service');
const { CertificatesService } = require('../../src/certificates/certificates.service');
const { OperationsService } = require('../../src/operations/operations.service');
const { notifyUser } = require('../../src/operations/operation-events');
const url = process.env.TEST_DATABASE_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || new URL(url).pathname !== '/proctolearn_security_test') throw new Error('Dedicated local test database required');

test('real transactions keep audit and inbox atomic with administrative effects', async t => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const [actor, recipient, other, certificateRecipient, course] = Array.from({ length: 5 }, () => randomUUID());
  const users = [actor, recipient, other, certificateRecipient];
  const operations = new OperationsService(db);
  try {
    await db.user.createMany({ data: users.map((id, i) => ({ id, email: `${id}@example.invalid`, name: 'Operations fixture', password: 'not-a-login-hash', role: i === 0 ? 'ADMIN' : 'STUDENT' })) });
    await db.course.create({ data: { id: course, teacherId: actor, title: 'Operations fixture' } });
    await t.test('role change commits actor audit, revokes sessions and emits one notification; replay emits no duplicate', async () => {
      const service = new UsersService(db);
      await service.updateRole(recipient, 'TEACHER', actor);
      await service.updateRole(recipient, 'TEACHER', actor);
      const row = await db.user.findUnique({ where: { id: recipient } });
      assert.equal(row.role, 'TEACHER'); assert.equal(row.tokenVersion, 1); assert.equal(row.refreshToken, null);
      const events = await db.auditEvent.findMany({ where: { targetId: recipient } });
      assert.equal(events.length, 1); assert.equal(events[0].actorId, actor);
      assert.deepEqual(events[0].metadata, { previousRole: 'STUDENT', role: 'TEACHER' });
      assert.equal(await db.userNotification.count({ where: { userId: recipient } }), 1);
    });
    await t.test('an administrator cannot demote their own account', async () => {
      const service = new UsersService(db);
      const before = await db.user.findUnique({ where: { id: actor } });
      const auditCount = await db.auditEvent.count({ where: { targetId: actor } });
      await assert.rejects(service.updateRole(actor, 'STUDENT', actor), error => error.getStatus() === 403);
      const after = await db.user.findUnique({ where: { id: actor } });
      assert.equal(after.role, 'ADMIN');
      assert.equal(after.tokenVersion, before.tokenVersion);
      assert.equal(await db.auditEvent.count({ where: { targetId: actor } }), auditCount);
      assert.equal(await db.userNotification.count({ where: { userId: actor } }), 0);
    });
    await t.test('an audit storage failure rolls back the role and notification', async () => {
      const failing = { $transaction: (fn, options) => db.$transaction(tx => fn(new Proxy(tx, { get(target, key) { return key === 'auditEvent' ? { create: async () => { throw new Error('fixture audit outage'); } } : target[key]; } })), options) };
      await assert.rejects(new UsersService(failing).updateRole(recipient, 'PROCTOR', actor), /fixture audit outage/);
      assert.equal((await db.user.findUnique({ where: { id: recipient } })).role, 'TEACHER');
      assert.equal(await db.userNotification.count({ where: { userId: recipient } }), 1);
    });
    await t.test('certificate grant audit and inbox persist with the certificate; retries deduplicate inbox', async () => {
      const admin = new AdminService(db, {}, new CertificatesService(db));
      await admin.grantFullCertificate(certificateRecipient, course, actor);
      await admin.grantFullCertificate(certificateRecipient, course, actor);
      assert.equal(await db.certificate.count({ where: { userId: certificateRecipient, courseId: course } }), 1);
      assert.equal(await db.userNotification.count({ where: { userId: certificateRecipient, type: 'CERTIFICATE_ISSUED' } }), 1);
      assert.equal(await db.auditEvent.count({ where: { actorId: actor, targetId: certificateRecipient, action: 'ADMIN_CERTIFICATE_GRANTED' } }), 2);
    });
    await t.test('notification storage failure rolls back the role, session revocation and audit together', async () => {
      const failing = { $transaction: (fn, options) => db.$transaction(tx => fn(new Proxy(tx, { get(target, key) { return key === 'userNotification' ? { createMany: async () => { throw new Error('fixture inbox outage'); } } : target[key]; } })), options) };
      const before = await db.user.findUnique({ where: { id: recipient } });
      const auditCount = await db.auditEvent.count({ where: { targetId: recipient } });
      await assert.rejects(new UsersService(failing).updateRole(recipient, 'PROCTOR', actor), /fixture inbox outage/);
      const after = await db.user.findUnique({ where: { id: recipient } });
      assert.equal(after.role, before.role); assert.equal(after.tokenVersion, before.tokenVersion);
      assert.equal(await db.auditEvent.count({ where: { targetId: recipient } }), auditCount);
    });
    await t.test('inbox pagination does not leak delivery keys or other users; read acknowledgements are idempotent and scoped', async () => {
      await db.$transaction(tx => notifyUser(tx, { userId: recipient, type: 'TEST', title: 'Second item', body: 'Pagination fixture', targetPath: '/dashboard', dedupeKey: `fixture:${recipient}` }));
      await db.$transaction(tx => notifyUser(tx, { userId: other, type: 'TEST', title: 'Private', body: 'Private', targetPath: '/dashboard', dedupeKey: `fixture:${other}` }));
      const privateItem = await db.userNotification.findFirst({ where: { userId: other } });
      await assert.rejects(operations.markRead(privateItem.id, recipient), e => e.getStatus() === 404);
      await assert.rejects(operations.notifications(recipient, privateItem.id), e => e.getStatus() === 404);
      const first = await operations.notifications(recipient, undefined, 1);
      assert.equal(first.data.length, 1); assert.ok(first.nextCursor); assert.equal(first.unreadCount, 2);
      assert.equal(first.data[0].userId, undefined); assert.equal(first.data[0].dedupeKey, undefined);
      const second = await operations.notifications(recipient, first.nextCursor, 1);
      assert.notEqual(second.data[0].id, first.data[0].id); assert.equal(second.nextCursor, null);
      await operations.markRead(first.data[0].id, recipient);
      const readAt = (await db.userNotification.findUnique({ where: { id: first.data[0].id } })).readAt;
      await operations.markRead(first.data[0].id, recipient);
      assert.equal((await db.userNotification.findUnique({ where: { id: first.data[0].id } })).readAt.getTime(), readAt.getTime());
      assert.equal((await operations.notifications(recipient)).unreadCount, 1);
    });
  } finally {
    await db.userNotification.deleteMany({ where: { userId: { in: users } } });
    await db.auditEvent.deleteMany({ where: { actorId: actor } });
    await db.certificate.deleteMany({ where: { courseId: course } });
    await db.course.deleteMany({ where: { id: course } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  }
});
