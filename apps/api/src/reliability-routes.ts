import type { ApiConfig } from '@shared-vps/runtime';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@shared-vps/database';
import { Auth, digest } from './auth.js';
import { databaseNow } from './job-queue.js';
import { fail } from './engine.js';
import type { BackgroundRuntime } from './background.js';
import { listRecords,listSchema,resources,type ListQuery,type Resource } from './pagination.js';
export async function rateLimit(db:PrismaClient,userId:string,scope:string,max:number,window=60000){
  const now=await databaseNow(db);const key=digest(`stage13:${scope}:${userId}:${Math.floor(now.getTime()/window)}`);
  const row=await db.authLimit.upsert({where:{key},create:{key,attempts:1,expiresAt:new Date(now.getTime()+window)},update:{attempts:{increment:1}}});if(row.attempts>max)fail(429,'RATE_LIMITED');
}
export function reliabilityRoutes(app:FastifyInstance,db:PrismaClient,auth:Auth,runtime:BackgroundRuntime,config:ApiConfig){
  app.get<{Params:{resource:Resource};Querystring:ListQuery}>('/api/v1/admin/lists/:resource',{schema:{params:{type:'object',additionalProperties:false,required:['resource'],properties:{resource:{enum:resources}}},querystring:listSchema}},async req=>{const actor=await auth.user(req,true);await rateLimit(db,actor.id,'admin-list',120);return listRecords(db,req.params.resource,req.query);});
  app.get<{Params:{resource:'orders'|'subscriptions'|'tickets'};Querystring:ListQuery}>('/api/v1/account/lists/:resource',{schema:{params:{type:'object',additionalProperties:false,required:['resource'],properties:{resource:{enum:['orders','subscriptions','tickets']}}},querystring:listSchema}},async req=>{const actor=await auth.user(req);await rateLimit(db,actor.id,'account-list',120);return listRecords(db,req.params.resource,req.query,actor.id);});
  app.get('/api/v1/notifications',async req=>{const user=await auth.user(req);const preference=await db.notificationPreference.findUnique({where:{userId:user.id}});return {remindersEnabled:preference?.remindersEnabled??false,updatesEnabled:preference?.updatesEnabled??false};});
  app.post<{Body:{remindersEnabled:boolean;updatesEnabled:boolean}}>('/api/v1/notifications',{schema:{body:{type:'object',additionalProperties:false,required:['remindersEnabled','updatesEnabled'],properties:{remindersEnabled:{type:'boolean'},updatesEnabled:{type:'boolean'}}}}},async req=>{const user=await auth.user(req);await rateLimit(db,user.id,'preferences',20);const row=await db.notificationPreference.upsert({where:{userId:user.id},create:{userId:user.id,...req.body},update:req.body});return {remindersEnabled:row.remindersEnabled,updatesEnabled:row.updatesEnabled};});
  app.post<{Params:{id:string}}>('/api/v1/admin/jobs/:id/retry',{schema:{params:{type:'object',required:['id'],properties:{id:{type:'string',format:'uuid'}}}}},async req=>{
    const actor=await auth.user(req,true);await rateLimit(db,actor.id,'retry',20);
    return db.$transaction(async tx=>{const now=await databaseNow(tx);const changed=await tx.backgroundJob.updateMany({where:{id:req.params.id,status:'DEAD',lastError:{notIn:['DELIVERY_UNKNOWN','TELEGRAM_DELIVERY_UNKNOWN']}},data:{status:'PENDING',attempts:0,runAt:now,lastError:null,finishedAt:null,sendStartedAt:null}});if(!changed.count)fail(409,'JOB_NOT_RETRYABLE');await tx.auditLog.create({data:{actorUserId:actor.id,action:'admin.job.retry',entityType:'background-job',entityId:req.params.id}});return {ok:true};});
  });
  let cachedWebhook:{until:number;value:unknown}|undefined;
  app.get('/api/v1/admin/diagnostics',async req=>{
    const actor=await auth.user(req,true);await rateLimit(db,actor.id,'diagnostics',30);
    const started=Date.now();const now=await databaseNow(db);const databaseLatencyMs=Date.now()-started;
    const [jobs,inbox,oldest,workers,recoveryErrors,activeUsers,servers,occupied]=await Promise.all([
      db.backgroundJob.groupBy({by:['status'],_count:{_all:true}}),db.telegramUpdate.groupBy({by:['status'],_count:{_all:true}}),
      db.backgroundJob.findFirst({where:{status:'PENDING',runAt:{lte:now}},orderBy:{runAt:'asc'},select:{runAt:true}}),
      db.workerHeartbeat.findMany({orderBy:{lastSeenAt:'desc'},take:10,select:{mode:true,status:true,lastSeenAt:true,lastCompletedAt:true,lastError:true}}),
      db.order.count({where:{status:'PAID',lastError:{not:null}}}),
      db.$queryRaw<{count:bigint}[]>`SELECT count(DISTINCT user_id) AS count FROM subscriptions WHERE status='ACTIVE' AND expires_at>${now}`,
      db.server.count({where:{status:'ACTIVE'}}),db.serverSlot.count({where:{status:'OCCUPIED'}}),
    ]);
    if(!cachedWebhook||cachedWebhook.until<Date.now()){let value:unknown={state:'unconfigured'};try{if(config.TELEGRAM_BOT_TOKEN){const s=await runtime.telegram.status();value={state:s.url===`${config.PUBLIC_ORIGIN}/api/v1/telegram/webhook`?'ready':s.url?'mismatch':'missing',pending:s.pending,lastErrorAt:s.lastErrorAt};}}catch{value={state:'unavailable'};}cachedWebhook={until:Date.now()+30000,value};}
    return {stage:'1.3',demo:true,database:{state:'available',latencyMs:databaseLatencyMs},jobs:jobs.map(x=>({status:x.status,count:x._count._all})),inbox:inbox.map(x=>({status:x.status,count:x._count._all})),oldestDueDelaySeconds:oldest?Math.max(0,Math.floor((now.getTime()-oldest.runAt.getTime())/1000)):0,
      workers:workers.map(x=>({...x,stale:now.getTime()-x.lastSeenAt.getTime()>90000})),recoveryErrors,activeUsers:Number(activeUsers[0]?.count??0),activeServers:servers,occupiedSlots:occupied,webhook:cachedWebhook.value,backgroundMode:config.BACKGROUND_MODE};
  });
}
