const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { recordAudit, notifyUser } = require('../src/operations/operation-events');
const { AuditController, NotificationsController } = require('../src/operations/operations.controller');
const { OperationsService } = require('../src/operations/operations.service');
const { JwtAuthGuard } = require('../src/common/guards/jwt-auth.guard');

test('audit rejects unlisted metadata and does not turn arbitrary request bodies into logs', async () => {
  const events = [];
  const tx = { auditEvent: { create: async ({ data }) => events.push(data) } };
  const event = { actorId: 'administrator', action: 'ADMIN_PASSWORD_RESET', targetType: 'USER', targetId: 'student' };
  for (const metadata of [{ password: 'secret' }, { email: 'private@example.invalid' }, { token: 'secret' }]) {
    await assert.rejects(recordAudit(tx, { ...event, metadata }), /Unsafe audit metadata/);
  }
  await assert.rejects(recordAudit(tx, { ...event, action: 'arbitrary request body' }), /Unknown audit action/);
  await recordAudit(tx, event);
  assert.deepEqual(events, [{ ...event, metadata: {} }]);
});

test('inbox rejects external or script destinations before persistence', async () => {
  const tx = { userNotification: { createMany: () => assert.fail('invalid destination must not persist') } };
  for (const targetPath of ['https://outside.invalid/', '//outside.invalid', 'javascript:alert(1)', '/dashboard/../auth/login', '/dashboard?token=secret']) {
    await assert.rejects(notifyUser(tx, { userId: 'u', type: 'TEST', title: 'Title', body: 'Body', targetPath, dedupeKey: 'x' }), /Invalid internal notification/);
  }
});

test('operations HTTP enforces authenticated ownership, admin-only audit and bounded query validation', async () => {
  const calls = [];
  const mine = randomUUID(), foreign = randomUUID();
  const service = {
    notifications: async (userId, cursor, limit) => { calls.push(['list', userId, cursor, limit]); return { data: [], nextCursor: null, unreadCount: 0 }; },
    audit: async (cursor, limit) => { calls.push(['audit', cursor, limit]); return { data: [], nextCursor: null }; },
    markRead: async (id, userId) => { calls.push(['read', id, userId]); return { ok: true }; },
  };
  const module = await Test.createTestingModule({ controllers: [AuditController, NotificationsController], providers: [{ provide: OperationsService, useValue: service }] })
    .overrideGuard(JwtAuthGuard).useValue({ canActivate(ctx) { const req = ctx.switchToHttp().getRequest(); const role = req.headers['x-test-role']; if (!role) return false; req.user = { id: mine, role }; return true; } }).compile();
  const app = module.createNestApplication({ logger: false });
  try {
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.listen(0, '127.0.0.1'); const base = await app.getUrl();
    const request = (route, role = 'STUDENT', method = 'GET') => fetch(base + route, { method, headers: role ? { 'X-Test-Role': role } : {} });
    assert.equal((await request('/notifications', null)).status, 403);
    for (const role of ['STUDENT', 'TEACHER', 'PROCTOR']) assert.equal((await request('/admin/audit', role)).status, 403);
    assert.equal((await request('/admin/audit?limit=50', 'ADMIN')).status, 200);
    for (const query of ['limit=0', 'limit=101', 'limit=no', 'cursor=invalid', `userId=${foreign}`]) assert.equal((await request('/notifications?' + query)).status, 400);
    const response = await request('/notifications'); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await request(`/notifications/${mine}/read`, 'STUDENT', 'PATCH')).status, 200);
    assert.deepEqual(calls, [['audit', undefined, 50], ['list', mine, undefined, 20], ['read', mine, mine]]);
  } finally { await app.close(); }
});
