const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, writeFile, access, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
require('reflect-metadata');
const bcrypt = require('bcryptjs');
const { JwtService } = require('@nestjs/jwt');
const { ConfigService } = require('@nestjs/config');
const { UnauthorizedException, BadRequestException } = require('@nestjs/common');
const { WsException } = require('@nestjs/websockets');
const { AuthService } = require('../src/auth/auth.service');
const { JwtStrategy } = require('../src/auth/strategies/jwt.strategy');
const { ProctorGateway } = require('../src/proctor/proctor.gateway');
const { tokenDigest } = require('../src/auth/token-digest');
const { EvidenceController } = require('../src/evidence/evidence.controller');
const { EvidenceService } = require('../src/evidence/evidence.service');
const { recordingFormat } = require('../src/evidence/recording-format');
const { MinioService } = require('../src/minio/minio.service');

async function authFixture() {
  const user = { id: 'student', email: 'test@example.invalid', role: 'STUDENT', tokenVersion: 0, refreshToken: null, password: await bcrypt.hash('Initial!!12', 4) };
  const resetTokens = new Map();
  const apply = (data) => { for (const [key, value] of Object.entries(data)) user[key] = value?.increment ? user[key] + value.increment : value; };
  const db = {
    user: {
      findUnique: async () => ({ ...user }),
      update: async ({ data }) => { apply(data); return { ...user }; },
      updateMany: async ({ where, data }) => {
        if (!Object.entries(where).every(([key, value]) => user[key] === value)) return { count: 0 };
        apply(data); return { count: 1 };
      },
    },
    passwordResetToken: {
      deleteMany: async () => { resetTokens.clear(); return { count: 1 }; },
      create: async ({ data }) => { resetTokens.set(data.token, data); return data; },
      findUnique: async ({ where }) => resetTokens.get(where.token),
    },
    $transaction: async (work) => work(db),
  };
  const config = new ConfigService({ JWT_ACCESS_SECRET: 'a'.repeat(64), JWT_REFRESH_SECRET: 'b'.repeat(64) });
  const jwt = new JwtService();
  const mail = { sendPasswordReset: async (_email, _name, token) => { mail.sentToken = token; } };
  const service = new AuthService(db, jwt, config, mail);
  const login = () => service.login({ email: user.email, password: 'Initial!!12' });
  return { user, db, config, jwt, service, login, mail, resetTokens };
}

test('token digests include bytes beyond bcrypt truncation boundary', () => {
  assert.notEqual(tokenDigest('a'.repeat(72) + 'one'), tokenDigest('a'.repeat(72) + 'two'));
});
test('refresh rotates to a unique token and rejects reuse', async () => {
  const f = await authFixture();
  const first = await f.login();
  assert.equal(f.user.refreshToken, tokenDigest(first.refreshToken));
  const second = await f.service.refresh(first.refreshToken);
  assert.notEqual(first.refreshToken, second.refreshToken);
  await assert.rejects(f.service.refresh(first.refreshToken), UnauthorizedException);
  await f.service.refresh(second.refreshToken);
});
test('only one simultaneous refresh can succeed', async () => {
  const f = await authFixture();
  const { refreshToken } = await f.login();
  const results = await Promise.allSettled([f.service.refresh(refreshToken), f.service.refresh(refreshToken)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
});
test('legacy bcrypt refresh hashes require a new login', async () => {
  const f = await authFixture();
  const { refreshToken } = await f.login();
  f.user.refreshToken = await bcrypt.hash(refreshToken, 4);
  await assert.rejects(f.service.refresh(refreshToken), UnauthorizedException);
});
test('logout revokes both refresh and REST access tokens', async () => {
  const f = await authFixture();
  const tokens = await f.login();
  const payload = f.jwt.decode(tokens.accessToken);
  const strategy = new JwtStrategy(f.config, f.db);
  await strategy.validate(payload);
  await f.service.logout(f.user.id);
  await assert.rejects(strategy.validate(payload), UnauthorizedException);
  await assert.rejects(f.service.refresh(tokens.refreshToken), UnauthorizedException);
});
test('password change revokes existing sessions and stores the new password', async () => {
  const f = await authFixture();
  const tokens = await f.login();
  await f.service.forgotPassword({ email: f.user.email });
  await f.service.changePassword(f.user.id, { currentPassword: 'Initial!!12', newPassword: 'Changed!!34' });
  assert.equal(f.user.tokenVersion, 1);
  assert.equal(f.user.refreshToken, null);
  assert.equal(f.resetTokens.size, 0);
  assert.equal(await bcrypt.compare('Changed!!34', f.user.password), true);
  await assert.rejects(f.service.refresh(tokens.refreshToken), UnauthorizedException);
});
test('reset links are hashed, single use, and revoke sessions', async () => {
  const f = await authFixture();
  await f.login();
  await f.service.forgotPassword({ email: f.user.email });
  assert.equal(f.resetTokens.has(f.mail.sentToken), false);
  assert.equal(f.resetTokens.has(tokenDigest(f.mail.sentToken)), true);
  await f.service.resetPassword({ token: f.mail.sentToken, newPassword: 'Reset!!34' });
  assert.equal(f.user.tokenVersion, 1);
  assert.equal(f.user.refreshToken, null);
  await assert.rejects(f.service.resetPassword({ token: f.mail.sentToken, newPassword: 'Again!!34' }), BadRequestException);
});
test('socket rejects a revoked token before processing events', async () => {
  const f = await authFixture();
  const tokens = await f.login();
  await f.service.logout(f.user.id);
  const gateway = new ProctorGateway({ recordEvent: () => assert.fail('revoked session') }, f.jwt, f.config, f.db);
  let disconnected = false;
  const client = { data: {}, handshake: { auth: { token: tokens.accessToken } }, emit() {}, disconnect() { disconnected = true; } };
  await assert.rejects(gateway.handleEvent(client, { attemptId: 'a', type: 'tab_switch' }), WsException);
  assert.equal(disconnected, true);
});

async function withFile(contents, work) {
  const directory = await mkdtemp(join(tmpdir(), 'recording-test-'));
  const path = join(directory, 'video');
  try { await writeFile(path, contents); await work(path); } finally { await rm(directory, { recursive: true, force: true }); }
}
const webmHeader = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, ...Array(20).fill(0)]);
test('recording header must match the declared container', async () => {
  await withFile(webmHeader, async (path) => {
    assert.equal((await recordingFormat(path, 'video/webm')).extension, 'webm');
    await assert.rejects(recordingFormat(path, 'video/mp4'), BadRequestException);
  });
  await withFile(Buffer.from('<html>not video</html>'), async (path) => {
    await assert.rejects(recordingFormat(path, 'video/webm'), BadRequestException);
  });
});
test('temporary upload is deleted on success and service failure', async () => {
  for (const fail of [false, true]) await withFile(webmHeader, async (path) => {
    const controller = new EvidenceController({ saveRecording: async (_id, actualPath) => {
      assert.equal(actualPath, path);
      if (fail) throw new Error('storage unavailable');
      return { id: 'saved' };
    } });
    const upload = controller.uploadRecording('attempt', { path, mimetype: 'video/webm' }, 'camera', 'student');
    if (fail) await assert.rejects(upload, /storage unavailable/); else assert.equal((await upload).id, 'saved');
    await assert.rejects(access(path), { code: 'ENOENT' });
  });
});
test('invalid recording type also deletes the temporary file', async () => {
  await withFile(webmHeader, async (path) => {
    const controller = new EvidenceController({ saveRecording: () => assert.fail('must not save') });
    await assert.rejects(controller.uploadRecording('attempt', { path }, 'invalid', 'student'), BadRequestException);
    await assert.rejects(access(path), { code: 'ENOENT' });
  });
});
test('object is removed if its database evidence record cannot be saved', async () => {
  await withFile(webmHeader, async (path) => {
    let uploaded, removed;
    const service = new EvidenceService({
      attempt: { findUnique: async () => ({ userId: 'student' }) },
      evidenceFile: { create: async () => { throw new Error('DB failure'); } },
    }, {
      uploadFile: async (actualPath, name) => { assert.equal(actualPath, path); uploaded = name; },
      removeObject: async (name) => { removed = name; },
    });
    await assert.rejects(service.saveRecording('attempt', path, 'video/webm', 'camera', 'student'), /DB failure/);
    assert.ok(uploaded);
    assert.equal(removed, uploaded);
  });
});
test('presigned URLs use the external host without contacting internal MinIO', async () => {
  const service = new MinioService(new ConfigService({
    MINIO_ENDPOINT: 'minio', MINIO_PUBLIC_URL: 'https://storage.example.invalid',
    MINIO_ROOT_USER: 'test-user', MINIO_ROOT_PASSWORD: 'test-only-password', NODE_ENV: 'production',
  }));
  const url = new URL(await service.getPresignedUrl('recordings/test.webm'));
  assert.equal(url.origin, 'https://storage.example.invalid');
  assert.equal(url.pathname, '/proctolearn-evidence/recordings/test.webm');
  assert.ok(url.searchParams.has('X-Amz-Signature'));
});
test('production rejects missing external storage URL and URLs with paths', () => {
  assert.throws(() => new MinioService(new ConfigService({ NODE_ENV: 'production' })), /MINIO_PUBLIC_URL/);
  assert.throws(() => new MinioService(new ConfigService({ MINIO_PUBLIC_URL: 'https://example.invalid/storage' })), /MINIO_PUBLIC_URL/);
});

test('HTTP multipart accepts camera/screen files and rejects foreign owners before storing', async () => {
  const { Test } = require('@nestjs/testing');
  const { ForbiddenException } = require('@nestjs/common');
  const { JwtAuthGuard } = require('../src/common/guards/jwt-auth.guard');
  const savedPaths = [];
  const module = await Test.createTestingModule({
    controllers: [EvidenceController],
    providers: [{ provide: EvidenceService, useValue: {
      assertOwner: async (attemptId) => { if (attemptId !== 'own') throw new ForbiddenException(); },
      saveRecording: async (_attemptId, path, mime, type, userId) => {
        assert.equal(userId, 'student');
        assert.equal((await recordingFormat(path, mime)).extension, 'webm');
        savedPaths.push(path);
        return { id: 'saved', type };
      },
    } }],
  }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (ctx) => {
    ctx.switchToHttp().getRequest().user = { id: 'student' };
    return true;
  } }).compile();
  const app = module.createNestApplication({ logger: false });
  try {
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    for (const [attemptId, type] of [['own', 'camera'], ['own', 'screen'], ['foreign', 'camera']]) {
      const form = new FormData();
      form.append('file', new Blob([webmHeader], { type: 'video/webm' }), 'recording.webm');
      form.append('type', type);
      const response = await fetch(`${origin}/evidence/${attemptId}/recording`, { method: 'POST', body: form });
      const body = await response.json();
      assert.equal(response.status, attemptId === 'own' ? 201 : 403, JSON.stringify(body));
      if (attemptId === 'own') assert.equal(body.type, type);
    }
    assert.equal(savedPaths.length, 2);
    for (const path of savedPaths) await assert.rejects(access(path), { code: 'ENOENT' });
  } finally {
    await app.close();
  }
});
