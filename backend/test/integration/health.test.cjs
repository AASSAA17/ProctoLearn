const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const net=require('node:net');
require('reflect-metadata');
const {Test}=require('@nestjs/testing');
const {ConfigService}=require('@nestjs/config');
const {S3Client,DeleteBucketCommand}=require('@aws-sdk/client-s3');
const {DatabaseProbe}=require('../../src/health/database-probe');
const {HealthController}=require('../../src/health/health.controller');
const {HealthService}=require('../../src/health/health.service');
const {MinioService}=require('../../src/minio/minio.service');

const testUrl=process.env.TEST_DATABASE_URL;
if(!testUrl)throw new Error('Set the dedicated TEST_DATABASE_URL for readiness integration tests');
const parsed=new URL(testUrl);
if(!['localhost','127.0.0.1'].includes(parsed.hostname)||!['5432','55432'].includes(parsed.port)||parsed.pathname!=='/proctolearn_security_test')throw new Error('Readiness tests require local PostgreSQL5432/55432/proctolearn_security_test');
const host=process.env.TEST_MINIO_ENDPOINT,port=Number(process.env.TEST_MINIO_PORT),user=process.env.TEST_MINIO_ROOT_USER,password=process.env.TEST_MINIO_ROOT_PASSWORD;
if(!['localhost','127.0.0.1'].includes(host)||port!==19000||!user||!password)throw new Error('Readiness tests require isolated authenticated S3 localhost19000');

test('actual PostgreSQL and SeaweedFS readiness is authenticated, bounded and recovers',async(t)=>{
 const bucket=`proctolearn-test-${randomUUID()}`;
 const settings={DATABASE_URL:testUrl,MINIO_ENDPOINT:host,MINIO_PORT:String(port),MINIO_ROOT_USER:user,MINIO_ROOT_PASSWORD:password,MINIO_BUCKET:bucket,MINIO_REGION:'us-east-1'};
 const database=new DatabaseProbe(new ConfigService(settings));
 const storage=new MinioService(new ConfigService(settings));
 const cleanup=new S3Client({endpoint:`http://${host}:${port}`,region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:user,secretAccessKey:password}});
 let current=new HealthService(database,storage);
 const module=await Test.createTestingModule({controllers:[HealthController],providers:[{provide:HealthService,useValue:{readiness:()=>current.readiness()}}]}).compile();
 const app=module.createNestApplication({logger:false});
 const extraStorage=[];
 try{
  await storage.onModuleInit();await app.listen(0,'127.0.0.1');const base=await app.getUrl();
  const ready=async()=>{const response=await fetch(base+'/ready',{signal:AbortSignal.timeout(5000)});return{status:response.status,body:await response.json()};};
  await t.test('SQL connection plus authenticated bucket HEAD are ready; unsigned bucket stays private',async()=>{
   assert.equal((await ready()).status,200);
   const unsigned=await fetch(`http://${host}:${port}/${bucket}`,{signal:AbortSignal.timeout(2000)});assert.equal(unsigned.status,403);
  });
  await t.test('wrong storage credentials and missing bucket produce a redacted503',async()=>{
   for(const override of [{MINIO_ROOT_PASSWORD:'incorrect-test-credential'},{MINIO_BUCKET:`proctolearn-test-${randomUUID()}`}]){
    const invalid=new MinioService(new ConfigService({...settings,...override}));extraStorage.push(invalid);
    current=new HealthService(database,invalid);const response=await ready();assert.equal(response.status,503);
    assert.deepEqual(response.body,{status:'not_ready',dependencies:{database:'up',storage:'down'}});
    assert.doesNotMatch(JSON.stringify(response.body),new RegExp(`${bucket}|incorrect|credential|127\\.0\\.0\\.1`));
    assert.equal((await fetch(base+'/health')).status,200);
   }
   current=new HealthService(database,storage);assert.equal((await ready()).status,200);
  });
  await t.test('a silent S3 peer is aborted and releases the underlying connection',async()=>{
   const sockets=new Set();const server=net.createServer(socket=>{sockets.add(socket);socket.resume();socket.on('close',()=>sockets.delete(socket));});
   await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
   const silent=new MinioService(new ConfigService({...settings,MINIO_ENDPOINT:'127.0.0.1',MINIO_PORT:String(server.address().port)}));extraStorage.push(silent);
   try{
    current=new HealthService(database,silent);const start=Date.now();assert.equal((await ready()).status,503);assert.ok(Date.now()-start<3500);
    await new Promise(resolve=>setTimeout(resolve,80));assert.equal(sockets.size,0,'aborted storage HEAD must release its socket');
   }finally{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
   current=new HealthService(database,storage);assert.equal((await ready()).status,200);
  });
  await t.test('the health SQL connection cancels a stalled query and remains recoverable',async()=>{
   const start=Date.now();await assert.rejects(database.client.$queryRawUnsafe('SELECT pg_sleep(4)'));assert.ok(Date.now()-start<3000);
   await database.probe();
  });
 }finally{
  await app.close();await database.onModuleDestroy();
  for(const instance of [storage,...extraStorage])await instance.onModuleDestroy?.();
  assert.match(bucket,/^proctolearn-test-[0-9a-f-]{36}$/);
  await cleanup.send(new DeleteBucketCommand({Bucket:bucket}),{abortSignal:AbortSignal.timeout(3000)}).catch(error=>{if(error.name!=='NoSuchBucket')throw error;});
  cleanup.destroy();
 }
});
