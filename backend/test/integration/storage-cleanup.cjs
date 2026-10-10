const assert = require('node:assert/strict');
const { ListObjectsV2Command, DeleteObjectCommand, DeleteBucketCommand } = require('@aws-sdk/client-s3');

// SeaweedFS can retain empty hierarchy entries after deleting leaf objects. S3 ListObjects
// without a delimiter hides them, but DeleteBucket with recursive deletion disabled rejects them.
// Remove only empty prefixes in a bucket allocated by this exact fixture invocation.
async function deleteEmptyFixtureBucket(client, bucket) {
  assert.match(bucket, /^(?:proctolearn-test-[0-9a-f-]{36}|backup-test-(?:source|target|blocked)-[0-9a-f]{32})$/);
  async function visit(prefix, depth = 0) {
    assert.ok(depth < 64, 'fixture storage hierarchy must be bounded');
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, Delimiter: '/', MaxKeys: 1000 }));
    assert.equal(page.IsTruncated ?? false, false, 'unexpected oversized fixture cleanup inventory');
    const actualObjects = (page.Contents || []).filter(object => !(prefix && object.Key === prefix && object.Size === 0));
    assert.equal(actualObjects.length, 0, 'fixture must remove all actual objects before deleting directory markers');
    for (const entry of page.CommonPrefixes || []) {
      const child = entry.Prefix;
      assert.ok(typeof child === 'string' && child.startsWith(prefix) && child !== prefix && child.endsWith('/'));
      await visit(child, depth + 1);
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: child }));
    }
  }
  await visit('');
  await client.send(new DeleteBucketCommand({ Bucket: bucket }));
}
module.exports = { deleteEmptyFixtureBucket };
