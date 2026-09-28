const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { S3Client, CreateBucketCommand, DeleteBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { backup, restore, verifyBackup, databaseConfig, pg, sql, assertEmptyDatabase, acquireRetentionLock } = require('../../../scripts/backup-cli.cjs');

const fixtureUrl = new URL(process.env.TEST_DATABASE_URL || 'http://invalid');
if (!['localhost', '127.0.0.1'].includes(fixtureUrl.hostname) || fixtureUrl.pathname !== '/proctolearn_security_test' || !['5432', '55432'].includes(fixtureUrl.port || '5432')) throw new Error('Backup tests require the dedicated local proctolearn_security_test PostgreSQL fixture.');
if (!['localhost', '127.0.0.1'].includes(process.env.TEST_MINIO_ENDPOINT) || process.env.TEST_MINIO_PORT !== '19000'
  || !process.env.TEST_MINIO_ROOT_USER || !process.env.TEST_MINIO_ROOT_PASSWORD) throw new Error('Backup tests require the dedicated localhost:19000 TEST_MINIO_* fixture.');
const endpoint = `http://${process.env.TEST_MINIO_ENDPOINT}:19000`;
const pgBin = process.env.TEST_PG_BIN;

test('real PostgreSQL custom backup and S3 restore preserve bytes, metadata and audit without overwriting targets', async (t) => {
  const suffix = randomUUID().replaceAll('-', '');
  const sourceName = `backup_test_source_${suffix}`, targetName = `backup_test_target_${suffix}`, blockedName = `backup_test_blocked_${suffix}`;
  const sourceBucket = `backup-test-source-${suffix}`, targetBucket = `backup-test-target-${suffix}`, blockedBucket = `backup-test-blocked-${suffix}`;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'proctolearn-backup-integration-'));
  const output = path.join(directory, 'complete');
  const databases = [], buckets = [];
  const urlFor = name => { const url = new URL(fixtureUrl); url.pathname = `/${name}`; url.search = ''; return url.href; };
  const admin = databaseConfig(urlFor('postgres'), 'postgres', pgBin);
  const source = databaseConfig(urlFor(sourceName), sourceName, pgBin);
  const target = databaseConfig(urlFor(targetName), targetName, pgBin);
  const blocked = databaseConfig(urlFor(blockedName), blockedName, pgBin);
  const client = new S3Client({ endpoint, region: 'us-east-1', forcePathStyle: true, maxAttempts: 1,
    credentials: { accessKeyId: process.env.TEST_MINIO_ROOT_USER, secretAccessKey: process.env.TEST_MINIO_ROOT_PASSWORD },
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
  const environment = { ...process.env, BACKUP_DATABASE_URL: urlFor(sourceName), RESTORE_DATABASE_URL: urlFor(targetName),
    BACKUP_S3_ACCESS_KEY_ID: process.env.TEST_MINIO_ROOT_USER, BACKUP_S3_SECRET_ACCESS_KEY: process.env.TEST_MINIO_ROOT_PASSWORD,
    RESTORE_S3_ACCESS_KEY_ID: process.env.TEST_MINIO_ROOT_USER, RESTORE_S3_SECRET_ACCESS_KEY: process.env.TEST_MINIO_ROOT_PASSWORD };
  const backupOptions = { output, 'source-database': sourceName, 'source-bucket': sourceBucket, 'source-s3-endpoint': endpoint, 'pg-bin': pgBin, 'confirm-quiescent': true };
  const restoreOptions = { backup: output, 'target-database': targetName, 'target-bucket': targetBucket, 'target-s3-endpoint': endpoint, 'pg-bin': pgBin, 'confirm-quiescent': true, 'confirm-private-target': true };
  const runSql = (db, query) => pg(db, 'psql', ['-X', '--no-password', '--quiet', '--set=ON_ERROR_STOP=1'], query, 60_000);
  const list = bucket => client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1000 }));
  const objectBytes = async (bucket, key) => Buffer.from(await (await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))).Body.transformToByteArray());
  const camera = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(350_123, 7)]);
  const screen = Buffer.alloc(257_021, 3);
  try {
    for (const name of [sourceName, targetName, blockedName]) { await pg(admin, 'createdb', ['--no-password', '--template=template0', name]); databases.push(name); }
    for (const bucket of [sourceBucket, targetBucket, blockedBucket]) { await client.send(new CreateBucketCommand({ Bucket: bucket })); buckets.push(bucket); }
    await pg({ ...source, env: { ...source.env, DATABASE_URL: urlFor(sourceName) } }, process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.resolve(__dirname, '../../prisma/schema.prisma')]);
    await runSql(source, `
      INSERT INTO users (id,name,email,password,role) VALUES ('backup_teacher','Teacher fixture','backup-teacher@example.invalid','not-a-real-hash','TEACHER'),('backup_student','Қалпына келтіру','backup-student@example.invalid','not-a-real-hash','STUDENT');
      INSERT INTO courses (id,title,"teacherId") VALUES ('backup_course','Restore fixture','backup_teacher');
      INSERT INTO exams (id,"courseId",title,duration) VALUES ('backup_exam','backup_course','Exam fixture',30);
      INSERT INTO attempts (id,"examId","userId",status,"finishedAt",score,"reviewStatus","examSnapshot") VALUES ('backup_attempt','backup_exam','backup_student','FINISHED',now(),100,'APPROVED','{"passScore":60,"courseId":"backup_course"}');
      INSERT INTO evidence_files (id,"attemptId",type,url) VALUES ('backup_camera','backup_attempt','recording_camera','recordings/fixture/camera.webm'),('backup_screen','backup_attempt','recording_screen','recordings/fixture/screen.webm');
      INSERT INTO attempt_reviews (id,"attemptId","reviewerId",decision,reason,source) VALUES ('backup_review','backup_attempt','backup_teacher','APPROVED','Fixture review','INITIAL');
      INSERT INTO certificates (id,"userId","courseId","qrCode","issuedVia") VALUES ('backup_certificate','backup_student','backup_course','backup-verification-code','PROCTORED_EXAM');
      CREATE TABLE operator_restore_fixture (id text PRIMARY KEY, details jsonb NOT NULL);
      INSERT INTO operator_restore_fixture VALUES ('durable-audit','{"actor":"operator","status":"preserved","unicode":"Қазақша"}');
    `);
    const stage8Tables = await sql(source, "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('audit_events','user_notifications');");
    assert.equal(stage8Tables, 2, 'Stage8 audit/notification migration must exist before this suite runs');
    await runSql(source, `INSERT INTO audit_events (id,"actorId",action,"targetType","targetId",metadata) VALUES ('backup_audit','backup_teacher','RESTORE_FIXTURE','attempt','backup_attempt','{"source":"fixture"}');
      INSERT INTO user_notifications (id,"userId",type,title,body,"targetPath","dedupeKey") VALUES ('backup_notification','backup_student','REVIEW','Fixture title','Fixture body','/dashboard/my-attempts/backup_attempt','backup-dedupe');`);
    await client.send(new PutObjectCommand({ Bucket: sourceBucket, Key: 'recordings/fixture/camera.webm', Body: camera, ContentType: 'video/webm' }));
    await client.send(new PutObjectCommand({ Bucket: sourceBucket, Key: 'recordings/fixture/screen.webm', Body: screen, ContentType: 'video/webm' }));
    await client.send(new PutObjectCommand({ Bucket: sourceBucket, Key: 'assets/fixture.txt', Body: 'unreferenced assets are also preserved', ContentType: 'text/plain' }));

    await t.test('backup and retention share an actual PostgreSQL advisory lock', async () => {
      const lock = await acquireRetentionLock(source);
      try { assert.equal(await sql({ ...source, lockPid: undefined }, 'SELECT to_json(pg_try_advisory_xact_lock(71083208::bigint));'), false); }
      finally { await lock.release(); }
      assert.equal(await sql(source, 'SELECT to_json(pg_try_advisory_xact_lock(71083208::bigint));'), true);
    });

    await t.test('completed backup contains all database tables and private object bytes, no settings files', async () => {
      const result = await backup(backupOptions, environment);
      assert.equal(result.status, 'backup_verified'); assert.equal(result.objects, 3);
      const { manifest } = await verifyBackup(output);
      assert.ok(manifest.inventory.tables.some(table => table.table === 'attempt_reviews' && table.rows === '1'));
      assert.ok(manifest.inventory.tables.some(table => table.table === 'audit_events' && table.rows === '1'));
      assert.ok(manifest.inventory.tables.some(table => table.table === 'user_notifications' && table.rows === '1'));
      assert.deepEqual((await fs.readdir(output)).sort(), ['database.dump', 'manifest.json', 'manifest.sha256', 'objects']);
      const raw = await fs.readFile(path.join(output, 'manifest.json'), 'utf8');
      assert.ok(!raw.includes(process.env.TEST_MINIO_ROOT_PASSWORD));
      assert.ok(!raw.includes('backup-student@example.invalid'));
      await assert.rejects(backup(backupOptions, environment), { code: 'EEXIST' });
    });

    await t.test('restore plan is read-only and occupied DB/bucket are rejected without losing sentinel data', async () => {
      assert.equal((await restore(restoreOptions, environment)).status, 'restore_plan_verified');
      await assertEmptyDatabase(target); assert.equal((await list(targetBucket)).Contents?.length || 0, 0);
      await runSql(blocked, 'CREATE TABLE preserve_sentinel (value text); INSERT INTO preserve_sentinel VALUES (\'keep-me\');');
      await assert.rejects(restore({ ...restoreOptions, 'target-database': blockedName, apply: true }, { ...environment, RESTORE_DATABASE_URL: urlFor(blockedName) }), /not empty/);
      assert.equal(await sql(blocked, 'SELECT to_json(value) FROM preserve_sentinel;'), 'keep-me');
      await client.send(new PutObjectCommand({ Bucket: blockedBucket, Key: 'sentinel', Body: 'keep-me' }));
      await assert.rejects(restore({ ...restoreOptions, 'target-bucket': blockedBucket, apply: true }, environment), /bucket is not empty/);
      assert.equal((await objectBytes(blockedBucket, 'sentinel')).toString(), 'keep-me');
      await assertEmptyDatabase(target);
      await assert.rejects(restore({ ...restoreOptions, 'target-bucket': sourceBucket, apply: true }, environment), /different database/);
    });

    await t.test('corrupt or missing backup object refuses before destination changes', async () => {
      const { manifest } = await verifyBackup(output);
      const file = path.join(output, manifest.objects[0].file);
      const original = await fs.readFile(file);
      try {
        await fs.writeFile(file, 'bad');
        await assert.rejects(restore({ ...restoreOptions, apply: true }, environment), /checksum/);
        await fs.unlink(file);
        await assert.rejects(restore({ ...restoreOptions, apply: true }, environment), /missing object/);
        await assertEmptyDatabase(target); assert.equal((await list(targetBucket)).Contents?.length || 0, 0);
      } finally { await fs.writeFile(file, original); }
    });

    await t.test('fresh restore preserves records, audit and notifications, exact recording bytes and private access', async () => {
      const result = await restore({ ...restoreOptions, apply: true }, environment);
      assert.equal(result.status, 'restore_verified'); assert.equal(result.objects, 3);
      assert.deepEqual(await objectBytes(targetBucket, 'recordings/fixture/camera.webm'), camera);
      assert.deepEqual(await objectBytes(targetBucket, 'recordings/fixture/screen.webm'), screen);
      assert.equal(await sql(target, 'SELECT to_json(name) FROM users WHERE id=\'backup_student\';'), 'Қалпына келтіру');
      assert.equal(await sql(target, 'SELECT to_json("issuedVia") FROM certificates WHERE id=\'backup_certificate\';'), 'PROCTORED_EXAM');
      assert.equal(await sql(target, 'SELECT to_json(action) FROM audit_events WHERE id=\'backup_audit\';'), 'RESTORE_FIXTURE');
      assert.equal(await sql(target, 'SELECT to_json("dedupeKey") FROM user_notifications WHERE id=\'backup_notification\';'), 'backup-dedupe');
      assert.equal(await sql(target, 'SELECT details FROM operator_restore_fixture;').then(row => row.unicode), 'Қазақша');
      assert.equal((await fetch(`${endpoint}/${targetBucket}/recordings/fixture/camera.webm`, { signal: AbortSignal.timeout(2000) })).status, 403);
      await assert.rejects(restore({ ...restoreOptions, apply: true }, environment), /not empty/);
    });

    await t.test('missing source evidence and unfinished retention cannot produce a complete backup', async () => {
      await client.send(new DeleteObjectCommand({ Bucket: sourceBucket, Key: 'recordings/fixture/camera.webm' }));
      const broken = path.join(directory, 'missing-source');
      await assert.rejects(backup({ ...backupOptions, output: broken }, environment), /missing storage object/);
      await assert.rejects(verifyBackup(broken));
      await runSql(source, 'ALTER TABLE evidence_files ADD COLUMN IF NOT EXISTS "deletionRequestedAt" timestamp; ALTER TABLE evidence_files ADD COLUMN IF NOT EXISTS "deletedAt" timestamp; UPDATE evidence_files SET "deletionRequestedAt"=now() WHERE id=\'backup_camera\';');
      await assert.rejects(backup({ ...backupOptions, output: path.join(directory, 'pending-deletion') }, environment), /deletion is incomplete/);
      await runSql(source, 'UPDATE evidence_files SET "deletedAt"=now() WHERE id=\'backup_camera\';');
      const deleted = await backup({ ...backupOptions, output: path.join(directory, 'deleted-tombstone') }, environment);
      assert.equal(deleted.status, 'backup_verified'); assert.equal(deleted.objects, 2);
    });
  } finally {
    // Only UUID databases/buckets allocated in this test invocation can be removed.
    for (const name of databases.reverse()) {
      assert.ok([sourceName, targetName, blockedName].includes(name)); assert.match(name, /^backup_test_(source|target|blocked)_[a-f0-9]{32}$/);
      await pg(admin, 'dropdb', ['--no-password', name]);
    }
    for (const bucket of buckets) {
      assert.match(bucket, /^backup-test-(source|target|blocked)-[a-f0-9]{32}$/);
      for (;;) { const entries = (await list(bucket)).Contents || []; if (!entries.length) break; for (const entry of entries) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: entry.Key })); }
      await client.send(new DeleteBucketCommand({ Bucket: bucket }));
    }
    client.destroy();
    const resolved = await fs.realpath(directory);
    assert.equal(path.dirname(resolved), await fs.realpath(os.tmpdir())); assert.ok(path.basename(resolved).startsWith('proctolearn-backup-integration-'));
    await fs.rm(resolved, { recursive: true, force: true });
  }
});
