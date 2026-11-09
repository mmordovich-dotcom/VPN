import { createHash,timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@shared-vps/database';
/** Bearer secret never appears in query, public status, or database error responses. */
export function monitorAuthorized(header:unknown,secret:string|undefined){
 if(typeof header!=='string'||!secret||secret.length<32||header.length>512)return false;
 return timingSafeEqual(createHash('sha256').update(header).digest(),createHash('sha256').update('Bearer '+secret).digest());
}
export async function internalSnapshot(db:PrismaClient,now=new Date()){
 try{
  await db.$queryRaw`SELECT 1`;
  const [dead,overdue,worker]=await Promise.all([db.backgroundJob.count({where:{status:'DEAD'}}),db.backgroundJob.count({where:{status:'PENDING',runAt:{lt:new Date(now.getTime()-300000)}}}),db.workerHeartbeat.findFirst({where:{status:'RUNNING'},orderBy:{lastSeenAt:'desc'},select:{lastSeenAt:true}})]);
  const healthy=dead===0&&overdue===0&&Boolean(worker&&now.getTime()-worker.lastSeenAt.getTime()<90000);
  return {status:healthy?'ok':'degraded',database:'available',queue:dead||overdue?'attention':'ok',worker:worker&&now.getTime()-worker.lastSeenAt.getTime()<90000?'active':'stale'};
 }catch{return {status:'unavailable',database:'unavailable',queue:'unknown',worker:'unknown'};}
}
export function monitoringRoutes(app:FastifyInstance,db:PrismaClient,secret?:string){
 app.get('/internal/monitor',async(req,reply)=>{reply.header('cache-control','no-store');if(!monitorAuthorized(req.headers.authorization,secret))return reply.code(401).send({error:'MONITOR_AUTH_REQUIRED'});const state=await internalSnapshot(db);return reply.code(state.status==='ok'?200:503).send(state);});
}
