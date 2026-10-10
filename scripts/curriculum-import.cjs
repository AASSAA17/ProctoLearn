#!/usr/bin/env node
'use strict';
// Private author bundles are read locally, never fetched from visitor-controlled URLs.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
function payload(bundle) {
  if (!/^C(?:0[1-9]|1[0-5])$/.test(bundle.authoringId)) throw new Error('Unknown authoring ID');
  // Deliberate mapping to actual current DTOs. Never forward author metadata or roles.
  const course = { title: bundle.title, description: bundle.description, level: bundle.level,
    modules: bundle.modules.map(module => ({ title: module.title, order: module.order,
      lessons: module.lessons.map(lesson => ({ title: lesson.title, content: lesson.content, order: lesson.order,
        steps: lesson.steps.map(step => ({ type: step.type, order: step.order, content: step.content })) })) })),
    exam: { title: bundle.exam.title, duration: bundle.exam.duration, passScore: bundle.exam.passScore,
      questions: bundle.exam.questions.map(question => ({ text: question.text, type: question.type, ...(question.options ? { options: question.options } : {}), answer: question.answer })) } };
  return { authoringKey: `pilot-curriculum-v1:${bundle.authoringId}`, revisionHash: hash(course), course };
}
async function main(args = process.argv.slice(2)) {
  const apply = args.includes('--apply');
  const ids = args.filter(value => /^C(?:0[1-9]|1[0-5])$/.test(value));
  if (!args.includes('--profile=pilot') || args.some(value => !['--profile=pilot', '--apply', '--dry-run'].includes(value) && !ids.includes(value)) || args.includes('--dry-run') && apply) throw new Error('Use node scripts/curriculum-import.cjs --profile=pilot [C01 ...] [--apply]; dry-run is default.');
  const source = path.join(ROOT, '.local/pilot-author/courses');
  const selected = ids.length ? [...new Set(ids)] : Array.from({ length: 15 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`);
  const bundles = selected.map(id => {
    const file = path.join(source, `${id}.json`);
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Symlink author bundles are not accepted');
    return JSON.parse(fs.readFileSync(file));
  });
  const { validateBundles } = require('./curriculum-validate.cjs');
  const report = validateBundles(bundles, selected.length === 15);
  if (report.errors.length) throw new Error(`Content validation failed (${report.errors.length} errors). Run curriculum-validate for the private report.`);
  const inputs = bundles.map(payload);
  console.log(JSON.stringify({ mode: apply ? 'APPLY_DRAFT_ONLY' : 'DRY_RUN', target: 'proctolearn_pilot', counts: report.counts, intended: inputs.map(input => ({ key: input.authoringKey, revision: input.revisionHash, status: 'DRAFT' })) }, null, 2));
  if (!apply) return;
  const directory = path.join(ROOT, '.local/pilot');
  const marker = JSON.parse(fs.readFileSync(path.join(directory, 'ownership.json')));
  if (marker.kind !== 'proctolearn-controlled-pilot-v1') throw new Error('Owned pilot marker required');
  const account = JSON.parse(fs.readFileSync(path.join(directory, 'accounts.json'))).find(value => value.id === 'pilot-owner' && value.role === 'ADMIN');
  if (!account) throw new Error('Pilot owner account missing');
  const cookies = new Map();
  async function call(route, data) {
    const mutate = data !== undefined;
    const csrf = mutate ? (await (await call('/auth/csrf')).json()).csrfToken : undefined;
    const response = await fetch(`http://127.0.0.1:4100${route}`, { method: mutate ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Origin: JSON.parse(fs.readFileSync(path.join(directory, 'running.json'))).origin, Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '), ...(mutate ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf } : {}) },
      ...(mutate ? { body: JSON.stringify(data) } : {}) });
    for (const header of response.headers.getSetCookie()) { const pair = header.split(';')[0]; const split = pair.indexOf('='); cookies.set(pair.slice(0, split), pair.slice(split + 1)); }
    return response;
  }
  const login = await call('/auth/login', { email: account.email, password: account.password });
  if (login.status !== 201 || (await login.json()).user.id !== account.id) throw new Error('Authenticated pilot owner required');
  const mapFile = path.join(ROOT, '.local/pilot-author/import-map.json');
  const mapping = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile)) : {};
  try {
    for (const input of inputs) {
      const response = await call('/content-import/draft', input);
      if (response.status !== 201) { await response.body?.cancel(); throw new Error(`Atomic draft import ${input.authoringKey}: HTTP ${response.status}; re-run safely after resolving the failure. Teacher edits are never overwritten.`); }
      const result = await response.json();
      mapping[input.authoringKey] = { ...result, importedAt: new Date().toISOString(), humanReview: 'PENDING' };
      const temporary = `${mapFile}.next`; fs.writeFileSync(temporary, JSON.stringify(mapping, null, 2), { mode: 0o600 }); fs.renameSync(temporary, mapFile);
      console.log(`${input.authoringKey}: ${result.replay ? 'existing unchanged draft' : 'imported DRAFT'}`);
    }
  } finally { await call('/auth/logout', {}).catch(() => {}); }
}
module.exports = { canonical, hash, payload, main };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
