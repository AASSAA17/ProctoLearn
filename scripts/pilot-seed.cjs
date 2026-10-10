'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { parseEnv } = require('node:util');
const { connectionUrl } = require('./local-launch.cjs');

const ROOT = path.resolve(__dirname, '..');
const DIRECTORY = path.join(ROOT, '.local', 'pilot');
const backendRequire = createRequire(path.join(ROOT, 'backend/package.json'));

async function seed(environment = process.env) {
  const directory = path.resolve(environment.PILOT_PROFILE_DIR || '');
  if (directory !== DIRECTORY) throw new Error('Pilot seed profile path mismatch.');
  const marker = JSON.parse(fs.readFileSync(path.join(directory, 'ownership.json'), 'utf8'));
  if (marker.kind !== 'proctolearn-controlled-pilot-v1') throw new Error('Pilot seed ownership marker mismatch.');
  const local = parseEnv(fs.readFileSync(path.join(directory, '.env.local'), 'utf8'));
  if (local.POSTGRES_DB !== 'proctolearn_pilot' || environment.DATABASE_URL !== connectionUrl(local, 5434)) throw new Error('Pilot seed database differs from the isolated profile.');
  const accounts = JSON.parse(fs.readFileSync(path.join(directory, 'accounts.json'), 'utf8'));
  if (accounts.length !== 1 || accounts[0].id !== 'pilot-owner' || accounts[0].role !== 'ADMIN' || accounts[0].password.length < 40) throw new Error('Private pilot owner account file is invalid.');
  const account = accounts[0];
  const { PrismaClient } = backendRequire('@prisma/client');
  const bcrypt = backendRequire('bcryptjs');
  const prisma = new PrismaClient();
  try {
    const [byId, byEmail] = await Promise.all([
      prisma.user.findUnique({ where: { id: account.id } }),
      prisma.user.findUnique({ where: { email: account.email } }),
    ]);
    if ((byId && byId.email !== account.email) || (byEmail && byEmail.id !== account.id)) throw new Error('Pilot owner identity conflicts with an existing record; nothing was changed.');
    if (!byId) await prisma.user.create({ data: { ...account, password: await bcrypt.hash(account.password, 12) } });
    console.log('Pilot owner account is ready. Existing password, role and data were preserved.');
  } finally { await prisma.$disconnect(); }
}

module.exports = { seed };
if (require.main === module) seed().catch(() => { console.error('Pilot owner seed failed. Inspect the private profile and migration state; no account was reset.'); process.exitCode = 1; });
