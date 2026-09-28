const {test}=require('node:test');
const assert=require('node:assert/strict');
const net=require('node:net');
require('reflect-metadata');
const {Test}=require('@nestjs/testing');
const {ConfigService}=require('@nestjs/config');
const {DatabaseProbe}=require('../src/health/database-probe');
const {HealthController}=require('../src/health/health.controller');
const {HealthService}=require('../src/health/health.service');
const {MinioService}=require('../src/minio/minio.service');
const {databaseUrl}=require('../docker/database-url.cjs');

async function fixture(database, storage) {
 const module=await Test.createTestingModule({controllers:[HealthController],providers:[HealthService,{provide:DatabaseProbe,useValue:database},{provide:MinioService,useValue:storage}]}).compile();
 const app=module.createNestApplication({logger:false});await app.listen(0,'127.0.0.1');
 const base=await app.getUrl();
 const request=async(path)=>{const result=await fetch(base+path);return{status:result.status,body:await result.json(),headers:result.headers};};
 return{app,request,close:()=>app.close()};
}

test('liveness stays available without invoking either dependency',async()=>{
 const f=await fixture({probe:()=>assert.fail('liveness must not query DB')},{storageProbe:()=>assert.fail('liveness must not contact S3')});
 try{const result=await f.request('/health');assert.equal(result.status,200);assert.deepEqual(result.body,{status:'ok'});assert.equal(result.headers.get('cache-control'),'no-store');}finally{await f.close();}
});

test('readiness needs authenticated storage and DB, redacts provider errors, and recovers',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:Date.now()});
 let databaseDown=false,storageDown=false;
 const f=await fixture({probe:async()=>{if(databaseDown)throw new Error('private database URL or password');}},{storageProbe:async(timeout)=>{assert.equal(timeout,2000);if(storageDown)throw new Error('private S3 credential or bucket');}});
 try{
  for(const [db,s3,status] of [[false,false,200],[true,false,503],[false,true,503],[true,true,503],[false,false,200]]){
   databaseDown=db;storageDown=s3;t.mock.timers.tick(2100);
   const result=await f.request('/ready');assert.equal(result.status,status);
   assert.deepEqual(result.body,{status:status===200?'ready':'not_ready',dependencies:{database:db?'down':'up',storage:s3?'down':'up'}});
   assert.doesNotMatch(JSON.stringify(result.body),/private|credential|password|bucket|URL/);
   assert.equal(result.headers.get('cache-control'),'no-store');
   assert.equal((await f.request('/health')).status,200);
  }
 }finally{await f.close();}
});

test('concurrent readiness polls share one active probe and a brief cache',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:Date.now()});
 let dbCalls=0,s3Calls=0,release,entered;
 const started=new Promise(resolve=>{entered=resolve;});const gate=new Promise(resolve=>{release=resolve;});
 const f=await fixture({probe:async()=>{dbCalls++;entered();await gate;}},{storageProbe:async()=>{s3Calls++;}});
 try{
  const requests=Array.from({length:12},()=>f.request('/ready'));await started;
  assert.equal(dbCalls,1);assert.equal(s3Calls,1);release();
  for(const response of await Promise.all(requests))assert.equal(response.status,200);
  await f.request('/ready');assert.equal(dbCalls,1);assert.equal(s3Calls,1);
  t.mock.timers.tick(2100);await f.request('/ready');assert.equal(dbCalls,2);assert.equal(s3Calls,2);
 }finally{release();await f.close();}
});

test('a silent PostgreSQL peer is timed out and its socket closed, without orphaned probes',async()=>{
 const sockets=new Set();
 const server=net.createServer(socket=>{sockets.add(socket);socket.resume();socket.on('close',()=>sockets.delete(socket));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const probe=new DatabaseProbe(new ConfigService({DATABASE_URL:`postgresql://test@127.0.0.1:${server.address().port}/proctolearn_security_test`}));
 try{
  for(let round=0;round<2;round++){
   const start=Date.now();await assert.rejects(probe.probe());assert.ok(Date.now()-start<3000,'connection deadline must be bounded');
   await new Promise(resolve=>setTimeout(resolve,80));assert.equal(sockets.size,0,'timed-out driver must close the underlying socket');
  }
 }finally{await probe.onModuleDestroy();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
});

test('container database URL preserves literal punctuation, percent sequences and Unicode credentials',()=>{
 const env={DB_HOST:'postgres',DB_PORT:'5432',POSTGRES_USER:'user@%2F:Ж',POSTGRES_PASSWORD:'pass%40:@/?# Ж',POSTGRES_DB:'db_ж%2F'};
 const url=new URL(databaseUrl(env));assert.equal(url.hostname,'postgres');assert.equal(decodeURIComponent(url.username),env.POSTGRES_USER);assert.equal(decodeURIComponent(url.password),env.POSTGRES_PASSWORD);assert.equal(decodeURIComponent(url.pathname.slice(1)),env.POSTGRES_DB);
 for(const name of ['DB_HOST','POSTGRES_USER','POSTGRES_PASSWORD','POSTGRES_DB'])assert.throws(()=>databaseUrl({...env,[name]:''}),new RegExp(name));
});
