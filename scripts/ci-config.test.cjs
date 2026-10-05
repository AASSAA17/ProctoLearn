const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const read = (file) => readFileSync(join(root, file), 'utf8');

test('Jenkins runs backend unit tests without migrations and keeps integration tests on a dedicated configured database', () => {
  const pipeline = read('Jenkinsfile');
  const unitStage = pipeline.match(/stage\('Backend Tests'\)([\s\S]*?)stage\('Backend Integration Tests'\)/)?.[1];
  assert.ok(unitStage, 'Backend Tests stage must precede Backend Integration Tests');
  assert.match(unitStage, /docker run --rm -e RUN_MIGRATIONS=false proctolearn-api sh -lc "npm run test"/);
  assert.doesNotMatch(unitStage, /--if-present/);
  assert.match(pipeline, /stage\('Backend Integration Tests'\)[\s\S]*?withCredentials\(\[string\(credentialsId: 'proctolearn-test-database-url', variable: 'TEST_DATABASE_URL'\)\]\)/);
  assert.match(pipeline, /stage\('Backend Integration Tests'\)[\s\S]*?docker run --rm --network host -e RUN_MIGRATIONS=false -e TEST_DATABASE_URL proctolearn-api/);
  assert.match(pipeline, /stage\('Backend Integration Tests'\)[\s\S]*?npm run test:integration/);
});

test('backend entrypoint still defaults migrations on for non-test service startup', () => {
  assert.match(read('backend/docker/entrypoint.sh'), /RUN_MIGRATIONS:-true/);
});
