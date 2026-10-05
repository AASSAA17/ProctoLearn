const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { BadRequestException, ValidationPipe } = require('@nestjs/common');
const { UsersService, UpdateProfileDto } = require('../src/users/users.service');

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const metadata = { type: 'body', metatype: UpdateProfileDto };

test('profile updates accept valid normalized fields while rejecting invalid or unknown input', async () => {
  const dto = await pipe.transform({ name: '  Алия  ', phone: '  +77001234567  ' }, metadata);
  assert.equal(dto.name, 'Алия');
  assert.equal(dto.phone, '+77001234567');
  const cleared = await pipe.transform({ phone: '   ' }, metadata);
  assert.equal(cleared.phone, null);

  for (const value of [
    { name: '   ' }, { name: null }, { name: 42 }, { name: 'x'.repeat(101) },
    { phone: '+7700123456' }, { phone: 42 }, { phone: 'x'.repeat(31) },
    { unexpected: 'field' },
  ]) {
    await assert.rejects(pipe.transform(value, metadata), BadRequestException);
  }
});

test('profile validation failures do not reach the update mutation', async () => {
  let updates = 0;
  const service = new UsersService({ user: { update: async () => { updates++; } } });
  await assert.rejects(pipe.transform({ name: null }, metadata), BadRequestException);
  assert.equal(updates, 0);

  const dto = await pipe.transform({ name: '  Алия  ', phone: '   ' }, metadata);
  await service.updateProfile('student', dto);
  assert.equal(updates, 1);
});
