const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { ConfigService } = require('@nestjs/config');
const { JwtService } = require('@nestjs/jwt');
const { ValidationPipe, UnauthorizedException } = require('@nestjs/common');
const { AuthCookies, authCookieNames, readCookie, accessTokenFromRequest } = require('../src/auth/auth-cookies');
const { CsrfService, CSRF_TOKEN_TTL_SECONDS } = require('../src/auth/csrf.service');
const { CsrfGuard } = require('../src/auth/csrf.guard');
const { AuthService } = require('../src/auth/auth.service');
const { AuthController, publicAuthUser } = require('../src/auth/auth.controller');
const { JwtStrategy } = require('../src/auth/strategies/jwt.strategy');
const { RegisterDto, ChangePasswordDto, ResetPasswordDto, RefreshTokenDto } = require('../src/auth/dto/auth.dto');
const { MailService, passwordResetUrl } = require('../src/mail/mail.service');
const { tokenDigest } = require('../src/auth/token-digest');

const config = (values = {}) => new ConfigService({ JWT_ACCESS_SECRET: 'a'.repeat(64), JWT_REFRESH_SECRET: 'b'.repeat(64), ...values });
const response = () => ({ cookies: [], cleared: [], headers: {}, cookie(name, value, options) { this.cookies.push({ name, value, options }); }, clearCookie(name, options) { this.cleared.push({ name, options }); }, setHeader(name, value) { this.headers[name] = value; } });
const jwt = new JwtService();
const access = () => jwt.sign({ sub: 'student', ver: 2 }, { secret: 'a'.repeat(64), expiresIn: '15m' });
const refresh = () => jwt.sign({ sub: 'student', ver: 2, jti: 'unique-token' }, { secret: 'b'.repeat(64), expiresIn: '7d' });
const code = (value) => (error) => error.getResponse?.().code === value;

test('production session cookies use Host prefix, HttpOnly, Secure, Lax and expiry from signed token lifetime', () => {
  const cfg = config({ NODE_ENV: 'production', FRONTEND_URL: 'https://learn.example' });
  const jar = new AuthCookies(cfg);
  const res = response();
  jar.set(res, { accessToken: access(), refreshToken: refresh() });
  assert.deepEqual(res.cookies.map((cookie) => cookie.name), ['__Host-pl-access', '__Host-pl-refresh']);
  for (const { options } of res.cookies) {
    assert.equal(options.httpOnly, true); assert.equal(options.secure, true);
    assert.equal(options.sameSite, 'lax'); assert.equal(options.path, '/'); assert.equal(options.domain, undefined);
  }
  assert.ok(res.cookies[0].options.maxAge > 890000 && res.cookies[0].options.maxAge <= 900000);
  assert.ok(res.cookies[1].options.maxAge > 604790000 && res.cookies[1].options.maxAge <= 604800000);
  jar.clear(res);
  assert.deepEqual(res.cleared.map((cookie) => cookie.name), ['__Host-pl-access', '__Host-pl-refresh']);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('cookie extraction rejects duplicates and malformed encoding; JWT strategy does not accept bearer tokens', () => {
  const cfg = config();
  const request = { headers: { cookie: 'other=value; pl-access=encoded%2Bvalue' } };
  assert.equal(readCookie(request, 'pl-access'), 'encoded+value');
  assert.equal(readCookie({ headers: { cookie: 'pl-access=one; pl-access=two' } }, 'pl-access'), null);
  assert.equal(readCookie({ headers: { cookie: 'pl-access=%zz' } }, 'pl-access'), null);
  assert.equal(accessTokenFromRequest({ headers: { authorization: 'Bearer token' } }, cfg), null);
  const strategy = new JwtStrategy(cfg, {});
  assert.equal(strategy._jwtFromRequest({ headers: { authorization: 'Bearer token' } }), null);
  assert.equal(strategy._jwtFromRequest({ headers: { cookie: 'pl-access=token' } }), 'token');
  assert.equal(authCookieNames(cfg).refresh, 'pl-refresh');
});

test('CSRF tokens bind to an HttpOnly session nonce and require an exact nonempty allowed Origin', () => {
  const csrf = new CsrfService(config());
  const res = response();
  const issued = csrf.issue({ headers: {} }, res);
  const cookie = res.cookies[0];
  assert.equal(cookie.name, 'pl-csrf'); assert.equal(cookie.options.httpOnly, true);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  const request = { headers: { origin: 'http://localhost:3000', cookie: `pl-csrf=${cookie.value}`, 'x-csrf-token': issued.csrfToken } };
  assert.doesNotThrow(() => csrf.assertRequest(request));
  for (const origin of [undefined, '', 'null', 'http://localhost:3000.evil.invalid', 'http://localhost:3000/']) {
    assert.throws(() => csrf.assertRequest({ headers: { ...request.headers, origin } }), code('ORIGIN_INVALID'));
  }
  assert.throws(() => csrf.issue({ headers: { origin: 'https://evil.invalid' } }, response()), code('ORIGIN_INVALID'));
  assert.throws(() => csrf.assertRequest({ headers: { ...request.headers, 'x-csrf-token': issued.csrfToken.replace(/.$/, issued.csrfToken.endsWith('0') ? '1' : '0') } }), code('CSRF_INVALID'));
  const newNonce = csrf.rotate(response());
  assert.throws(() => csrf.assertRequest({ headers: { ...request.headers, cookie: `pl-csrf=${newNonce}` } }), code('CSRF_INVALID'));
});

test('CSRF expiry requires a fresh token and bootstrap reuses a valid nonce across refreshes', () => {
  const csrf = new CsrfService(config());
  const res = response();
  const issued = csrf.issue({ headers: {} }, res);
  const cookie = `pl-csrf=${res.cookies[0].value}`;
  const reused = response();
  csrf.issue({ headers: { cookie } }, reused);
  assert.equal(reused.cookies.length, 0);
  const originalNow = Date.now;
  Date.now = () => originalNow() + (CSRF_TOKEN_TTL_SECONDS + 1) * 1000;
  try { assert.throws(() => csrf.assertRequest({ headers: { origin: 'http://localhost:3000', cookie, 'x-csrf-token': issued.csrfToken } }), code('CSRF_INVALID')); }
  finally { Date.now = originalNow; }
});

test('global CSRF guard protects every unsafe method while allowing safe methods and non-HTTP execution', () => {
  let checks = 0;
  const guard = new CsrfGuard({ assertRequest() { checks++; } });
  const context = (method, type = 'http') => ({ getType: () => type, switchToHttp: () => ({ getRequest: () => ({ method }) }) });
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(guard.canActivate(context(method)), true);
  for (const method of ['GET', 'HEAD', 'OPTIONS']) assert.equal(guard.canActivate(context(method)), true);
  guard.canActivate(context('POST', 'ws'));
  assert.equal(checks, 4);
});

test('registration, password change and reset share strength and bcrypt UTF-8 byte limits; refresh body tokens are rejected', async () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const fixtures = [
    [RegisterDto, (password) => ({ email: 'student@example.invalid', name: 'Student', password })],
    [ChangePasswordDto, (newPassword) => ({ currentPassword: 'Old!!12', newPassword })],
    [ResetPasswordDto, (newPassword) => ({ token: 'reset-token', newPassword })],
  ];
  for (const [metatype, make] of fixtures) {
    for (const password of ['abcdef', 'abc12!', '😊'.repeat(18) + '!!12', 'x'.repeat(73) + '!!12']) {
      await assert.rejects(pipe.transform(make(password), { type: 'body', metatype }));
    }
    await pipe.transform(make('a'.repeat(68) + '!!12'), { type: 'body', metatype });
  }
  await pipe.transform({}, { type: 'body', metatype: RefreshTokenDto });
  await assert.rejects(pipe.transform({ refreshToken: 'forbidden' }, { type: 'body', metatype: RefreshTokenDto }));
});

test('auth controller returns public users and keeps refresh failure responses free of cookie clearing', async () => {
  const cfg = config();
  const session = { user: { id: 'student', name: 'Student', password: 'hidden', tokenVersion: 4, refreshToken: 'digest' }, accessToken: access(), refreshToken: refresh() };
  const service = { login: async () => session, refresh: async () => { throw new UnauthorizedException(); } };
  const controller = new AuthController(service, new AuthCookies(cfg), new CsrfService(cfg));
  const res = response();
  const result = await controller.login({}, res);
  assert.deepEqual(Object.keys(result), ['user']);
  assert.equal(JSON.stringify(result).includes('hidden'), false);
  assert.equal(result.user.tokenVersion, undefined);
  assert.equal(publicAuthUser(session.user).refreshToken, undefined);
  assert.equal(res.cookies.length, 3);
  const failed = response();
  await assert.rejects(controller.refresh({}, { headers: { cookie: `pl-refresh=${refresh()}` } }, failed), UnauthorizedException);
  assert.equal(failed.cookies.length, 0); assert.equal(failed.cleared.length, 0);
});

test('refresh database failures remain server errors instead of being converted to invalid-session 401', async () => {
  const outage = new Error('Injected database outage');
  const service = new AuthService({ user: { findUnique: async () => { throw outage; } } }, jwt, config(), {});
  await assert.rejects(service.refresh(refresh()), (error) => error === outage);
  await assert.rejects(service.refresh('bad-token'), UnauthorizedException);
});

test('explicit logout with invalid cookies clears locally without revoking an unverified account', async () => {
  const service = new AuthService({ user: { findUnique: async () => assert.fail('invalid cookies must not look up an account') } }, jwt, config(), {});
  const controller = new AuthController(service, new AuthCookies(config()), new CsrfService(config()));
  const res = response();
  await controller.logout({ headers: { cookie: 'pl-access=invalid; pl-refresh=invalid' } }, res);
  assert.deepEqual(res.cleared.map((cookie) => cookie.name), ['pl-access', 'pl-refresh', 'pl-csrf']);
});

test('explicit logout can revoke through a valid refresh cookie and propagates storage failures without clearing cookies', async () => {
  const token = refresh();
  const user = { id: 'student', tokenVersion: 2, refreshToken: tokenDigest(token) };
  let changes;
  const service = new AuthService({ user: { findUnique: async () => user, updateMany: async (args) => { changes = args; return { count: 1 }; } } }, jwt, config(), {});
  await service.logoutSession(null, token);
  assert.deepEqual(changes.where, { id: 'student', tokenVersion: 2 });
  assert.deepEqual(changes.data.tokenVersion, { increment: 1 });
  const outage = new Error('Injected logout database failure');
  const unavailable = new AuthService({ user: { findUnique: async () => { throw outage; } } }, jwt, config(), {});
  const controller = new AuthController(unavailable, new AuthCookies(config()), new CsrfService(config()));
  const res = response();
  await assert.rejects(controller.logout({ headers: { cookie: `pl-refresh=${token}` } }, res), (error) => error === outage);
  assert.equal(res.cleared.length, 0);
});

test('password emails escape user content and build reset links from the first validated frontend origin', async () => {
  const cfg = config({ NODE_ENV: 'production', FRONTEND_URL: 'https://first.example, https://second.example' });
  const url = new URL(passwordResetUrl(cfg, 'a&b"<token>'));
  assert.equal(url.origin, 'https://first.example'); assert.equal(url.pathname, '/auth/reset-password');
  assert.equal(url.searchParams.get('token'), 'a&b"<token>');
  assert.throws(() => passwordResetUrl(config({ FRONTEND_URL: 'https://good.example/path' }), 'token'));
  const mail = new MailService(cfg);
  const sent = [];
  mail.transporter = { sendMail: async (message) => sent.push(message) };
  await mail.sendPasswordReset('student@example.invalid', '<img src=x onerror=bad>', 'safe-token');
  await mail.sendTempPassword('student@example.invalid', 'A&B', '<secret!!12>');
  assert.equal(sent[0].html.includes('<img'), false);
  assert.ok(sent[0].html.includes('&lt;img'));
  assert.ok(sent[0].html.includes('https://first.example/auth/reset-password?token=safe-token'));
  assert.ok(sent[1].html.includes('A&amp;B')); assert.ok(sent[1].html.includes('&lt;secret!!12&gt;'));
});

test('logout through an expired access session still revokes a refresh rotated concurrently after identity verification', async () => {
  const token = refresh();
  const user = { id: 'student', tokenVersion: 2, refreshToken: tokenDigest(token), isOnline: true };
  const service = new AuthService({ user: {
    findUnique: async () => ({ ...user }),
    updateMany: async ({ where, data }) => {
      // Another request wins refresh rotation between logout's verification and its revocation write.
      user.refreshToken = 'new-refresh-digest';
      if (!Object.entries(where).every(([key, value]) => user[key] === value)) return { count: 0 };
      user.refreshToken = data.refreshToken;
      user.tokenVersion += data.tokenVersion.increment;
      user.isOnline = data.isOnline;
      return { count: 1 };
    },
  } }, jwt, config(), {});
  await service.logoutSession(null, token);
  assert.equal(user.tokenVersion, 3);
  assert.equal(user.refreshToken, null);
  assert.equal(user.isOnline, false);
});

test('mandatory password changes deny ordinary HTTP handlers for every role, not bootstrap or password change', () => {
  const { JwtAuthGuard } = require('../src/common/guards/jwt-auth.guard');
  const guard = new JwtAuthGuard();
  const context = (handler, headers = {}) => ({ getHandler: () => handler, switchToHttp: () => ({ getRequest: () => ({ headers }) }) });
  const ordinary = () => {};
  for (const role of ['STUDENT', 'TEACHER', 'PROCTOR', 'ADMIN']) {
    const user = { id: 'user', role, mustChangePassword: true };
    assert.throws(() => guard.handleRequest(null, user, null, context(ordinary)), code('PASSWORD_CHANGE_REQUIRED'));
    for (const handler of [AuthController.prototype.me, AuthController.prototype.changePassword]) {
      assert.equal(guard.handleRequest(null, user, null, context(handler)), user);
      assert.throws(() => guard.handleRequest(null, user, null, context(handler, { 'x-session-user': 'other' })), code('AUTH_CHANGED'));
    }
    const unrestricted = { ...user, mustChangePassword: false };
    assert.equal(guard.handleRequest(null, unrestricted, null, context(ordinary)), unrestricted);
  }
  assert.throws(() => guard.handleRequest(null, null, null, context(AuthController.prototype.changePassword)), UnauthorizedException);
});

test('password reset rejects invalid links before hashing and revalidates links after hashing', async () => {
  const bcrypt = require('bcryptjs');
  const { BadRequestException } = require('@nestjs/common');
  const originalHash = bcrypt.hash;
  let hashes = 0;
  bcrypt.hash = async () => { hashes++; return 'hashed-password'; };
  try {
    for (const candidate of [null, { userId: 'user', expiresAt: new Date(0) }]) {
      const service = new AuthService({
        passwordResetToken: { findUnique: async () => candidate },
        $transaction: async () => assert.fail('invalid tokens must not enter a transaction'),
      }, jwt, config(), {});
      await assert.rejects(service.resetPassword({ token: 'invalid', newPassword: 'New!!123' }), BadRequestException);
    }
    assert.equal(hashes, 0);
    for (const changedRecord of [null, { userId: 'user', expiresAt: new Date(0) }]) {
      const service = new AuthService({
        passwordResetToken: { findUnique: async () => ({ userId: 'user', expiresAt: new Date(Date.now() + 60_000) }) },
        $transaction: async (callback) => callback({
          passwordResetToken: { findUnique: async () => changedRecord },
          user: { update: async () => assert.fail('consumed/expired token must not update password') },
        }),
      }, jwt, config(), {});
      await assert.rejects(service.resetPassword({ token: 'consumed-during-hash', newPassword: 'New!!123' }), BadRequestException);
    }
    assert.equal(hashes, 2);
  } finally { bcrypt.hash = originalHash; }
});

test('reset-password has a restrictive endpoint-specific throttle', () => {
  const { THROTTLER_LIMIT, THROTTLER_TTL } = require('@nestjs/throttler/dist/throttler.constants');
  assert.equal(Reflect.getMetadata(THROTTLER_LIMIT + 'default', AuthController.prototype.resetPassword), 5);
  assert.equal(Reflect.getMetadata(THROTTLER_TTL + 'default', AuthController.prototype.resetPassword), 60_000);
});
