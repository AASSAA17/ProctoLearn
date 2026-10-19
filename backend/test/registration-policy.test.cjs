const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { AuthService } = require('../src/auth/auth.service');
const { AuthController } = require('../src/auth/auth.controller');
const { ForbiddenException } = require('@nestjs/common');

test('registration capability follows server pilot policy without exposing configuration', () => {
  for (const enabled of [false, true]) {
    const service = new AuthService({}, {}, {}, {}, { enabled });
    assert.deepEqual(service.registrationPolicy(), { registrationOpen: !enabled, invitationRequired: enabled });
    const headers = {};
    const controller = new AuthController(service, {}, {});
    assert.deepEqual(controller.registrationPolicy({ setHeader: (key, value) => { headers[key] = value; } }), service.registrationPolicy());
    assert.equal(headers['Cache-Control'], 'no-store');
  }
});

test('closed pilot still rejects registration without an invitation before writes', async () => {
  const service = new AuthService({}, {}, {}, {}, { enabled: true });
  await assert.rejects(service.register({ email: 'fictional@example.test', name: 'Fixture', password: 'Sample!!42' }), ForbiddenException);
});
