import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PrismaClient} from '../packages/database/src/index.js';
import {seedDatabase} from '../packages/database/src/seed.js';
import {SubscriptionEngine} from '../apps/api/src/engine.js';
import {PaymentFoundation} from '../apps/api/src/payment-foundation.js';
import {MockSbpProvider} from '../apps/api/src/payment-provider.js';
import {ResourceFoundation} from '../apps/api/src/resource-foundation.js';
// This drill has no production secret and refuses all remote databases.
const raw=process.env.TEST_DATABASE_URL,container=process.env.CI_POSTGRES_CONTAINER;
if(process.env.CI!=='true'||!raw||!container||!/^[a-f0-9]{12,64}$/.test(container))throw Error('CI_DISPOSABLE_CONTAINER_REQUIRED');
const base=new URL(raw);if(!['localhost','127.0.0.1','[::1]'].includes(base.hostname)||base.username!=='demo'||base.pathname!=='/shared_vps_test')throw Error('CI_DATABASE_REQUIRED');
const suffix=randomUUID().replaceAll('-',''),source='axon_source_'+suffix,target='axon_restore_'+suffix,file='/tmp/axon_'+suffix+'.dump';
const docker=(args:string[])=>execFileSync('docker',['exec',container,...args],{stdio:'pipe'});
const sourceUrl=new URL(base);sourceUrl.pathname='/'+source;const targetUrl=new URL(base);targetUrl.pathname='/'+target;
let from:PrismaClient|undefined,to:PrismaClient|undefined;
try{
 docker(['createdb','-U','demo',source]);docker(['createdb','-U','demo',target]);
 execFileSync(process.execPath,[fileURLToPath(new URL('../packages/database/node_modules/prisma/build/index.js',import.meta.url)),'migrate','deploy','--schema',fileURLToPath(new URL('../packages/database/prisma/schema.prisma',import.meta.url))],{env:{...process.env,DATABASE_URL:sourceUrl.toString()},stdio:'pipe'});
 from=new PrismaClient({datasources:{db:{url:sourceUrl.toString()}}});const plan=await seedDatabase(from),engine=new SubscriptionEngine(from),user=await engine.identity('200002'),order=await engine.order(user.id,plan.id,'restore-drill-fixture');
 const foundation=new PaymentFoundation(from,engine),op=await foundation.register(order.id,'SBP_MOCK'),provider=new MockSbpProvider('test-only:'+'restore-fixture'.repeat(5));const raw=JSON.stringify({operationId:op.id,eventId:'restore-fixture',externalId:op.externalId,amount:17000,currency:'RUB',state:'SUCCEEDED',mode:'SANDBOX',provider:'SBP_MOCK'});await foundation.receive(provider,raw,provider.signFixture(raw));await foundation.recover();await new ResourceFoundation(from,engine).fulfill(order.id);await from.supportTicket.create({data:{userId:user.id,text:'Restore fixture only'}});
 const tables=['users','orders','payments','subscriptions','servers','server_slots','access_credentials','support_tickets','payment_operations','payment_events','financial_entries','resource_operations','resource_reservations','background_jobs'];
 async function fingerprint(db:PrismaClient){const result:unknown[]=[];for(const table of tables)result.push(await db.$queryRawUnsafe("SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text AS value FROM "+table+" t"));return JSON.stringify(result);}
 const before=await fingerprint(from);docker(['pg_dump','-U','demo','--format=custom','--file='+file,source]);docker(['pg_restore','-U','demo','--no-owner','--exit-on-error','--dbname='+target,file]);to=new PrismaClient({datasources:{db:{url:targetUrl.toString()}}});if(await fingerprint(to)!==before)throw Error('RESTORE_FINGERPRINT_MISMATCH');
 const restored=new PaymentFoundation(to,new SubscriptionEngine(to));await restored.recover();const audit=await restored.audit(op.id);if(!audit.consistent||audit.captured!==17000||await to.subscription.count()!==1)throw Error('RESTORE_RECOVERY_FAILED');
 console.info('AXON_STAGE20_RESTORE_DRILL',JSON.stringify({isolated:true,realUserData:false,tables:tables.length,exactFingerprints:true,captureCount:1,subscriptionCount:1,productionBackupVerified:false}));
}finally{
 await from?.$disconnect();await to?.$disconnect();
 for(const dbName of [source,target])if(/^axon_(?:source|restore)_[a-f0-9]{32}$/.test(dbName))try{docker(['dropdb','-U','demo','--if-exists',dbName]);}catch{/* CI service is ephemeral. */}
 try{docker(['rm','-f',file]);}catch{/* Temporary synthetic dump only. */}
}
