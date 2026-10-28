import { IncidentService } from './incidents.js';
import { randomUUID } from 'node:crypto';
import type { PrismaClient, BackgroundJob } from '@shared-vps/database';
import type { ApiConfig } from '@shared-vps/runtime';
import { SubscriptionEngine, DomainError } from './engine.js';
import { TelegramGateway } from './telegram.js';
import { JobQueue, JobFailure, databaseNow, enqueue } from './job-queue.js';
import { Notifications } from './notifications.js';

type Log = { info(value: object, message: string): void; warn(value: object, message: string): void };
export class BackgroundRuntime {
  readonly id = randomUUID();
  readonly engine: SubscriptionEngine;
  readonly telegram: TelegramGateway;
  readonly queue: JobQueue;
  private notifications: Notifications;
  private controller = new AbortController();
  private running: Promise<void> | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastHeartbeat = 0;
  constructor(private db: PrismaClient, private config: ApiConfig, private mode: 'INLINE' | 'STANDALONE', private log: Log,
    transport?: (method: string, body: Record<string, unknown>) => Promise<unknown>) {
    this.engine = new SubscriptionEngine(db); this.telegram = new TelegramGateway(db, config, this.engine, transport);
    this.queue = new JobQueue(db); this.notifications = new Notifications(db, (method, body) => this.telegram.call(method, body));
  }
  async schedule() {
    const now = await databaseNow(this.db); const minute = Math.floor(now.getTime() / 60000); const hour = Math.floor(minute / 60);
    await this.db.$transaction(async tx => {
      await enqueue(tx,'LIFECYCLE',`lifecycle:${minute}`,{root:`lifecycle:${minute}`});
      await enqueue(tx,'RECOVER',`recover:${minute}`,{root:`recover:${minute}`});
      await enqueue(tx,'CLEANUP',`cleanup:${hour}`);
    });
  }
  async handle(job: BackgroundJob): Promise<boolean | void> {
    const body = job.payload as Record<string, unknown>;
    const cursor = typeof body.cursor === 'string' ? body.cursor : undefined;
    const root = typeof body.root === 'string' ? body.root : undefined;
    try {
      if (job.kind === 'FULFILL_ORDER') { if (typeof body.orderId !== 'string') throw new JobFailure('INVALID_ORDER_JOB',true); await this.engine.fulfill(body.orderId); }
      else if (job.kind === 'LIFECYCLE') { await this.engine.maintain(cursor,root); await new IncidentService(this.db,this.engine).alertLongIncidents(); }
      else if (job.kind === 'RECOVER') await this.engine.recover(cursor,root);
      else if (job.kind === 'CLEANUP') await this.cleanup();
      else if (job.kind === 'NOTIFY') return this.notifications.deliver(job);
      else throw new JobFailure('UNKNOWN_JOB_KIND',true);
    } catch(error) { if(error instanceof DomainError) throw new JobFailure(error.code,error.statusCode<500); throw error; }
  }
  async cleanup() {
    const now = await databaseNow(this.db); const day = new Date(now.getTime()-86400000); const month = new Date(now.getTime()-30*86400000); const quarter = new Date(now.getTime()-90*86400000);
    // Bounded batches of expired technical records only. Business/audit history is never removed.
    for (const model of ['session','authReplay','loginRequest','loginGrant','authLimit'] as const) {
      const delegate = this.db[model];
      // Delegates differ in key shape, so use their known typed keys below.
      if(model==='session'){const rows=await this.db.session.findMany({where:{expiresAt:{lt:day}},select:{tokenHash:true},take:500});await this.db.session.deleteMany({where:{tokenHash:{in:rows.map(x=>x.tokenHash)}}});}
      else if(model==='authReplay'){const rows=await this.db.authReplay.findMany({where:{expiresAt:{lt:day}},select:{hash:true},take:500});await this.db.authReplay.deleteMany({where:{hash:{in:rows.map(x=>x.hash)}}});}
      else if(model==='loginRequest'){const rows=await this.db.loginRequest.findMany({where:{expiresAt:{lt:day}},select:{id:true},take:500});await this.db.loginRequest.deleteMany({where:{id:{in:rows.map(x=>x.id)}}});}
      else if(model==='loginGrant'){const rows=await this.db.loginGrant.findMany({where:{expiresAt:{lt:day}},select:{id:true},take:500});await this.db.loginGrant.deleteMany({where:{id:{in:rows.map(x=>x.id)}}});}
      else {const rows=await this.db.authLimit.findMany({where:{expiresAt:{lt:day}},select:{key:true},take:500});await this.db.authLimit.deleteMany({where:{key:{in:rows.map(x=>x.key)}}});}
      void delegate;
    }
    const updates=await this.db.telegramUpdate.findMany({where:{status:{in:['DONE','DEAD']},finishedAt:{lt:month}},select:{id:true},take:500});await this.db.telegramUpdate.deleteMany({where:{id:{in:updates.map(x=>x.id)}}});
    const jobs=await this.db.backgroundJob.findMany({where:{status:{in:['DONE','DEAD','SKIPPED']},finishedAt:{lt:quarter}},select:{id:true},take:500});await this.db.backgroundJob.deleteMany({where:{id:{in:jobs.map(x=>x.id)}}});
    const workers=await this.db.workerHeartbeat.findMany({where:{lastSeenAt:{lt:new Date(now.getTime()-7*86400000)}},select:{id:true},take:500});await this.db.workerHeartbeat.deleteMany({where:{id:{in:workers.map(x=>x.id)}}});
  }
  run() {
    if (this.controller.signal.aborted || this.mode === 'INLINE' && this.config.BACKGROUND_MODE === 'external') return Promise.resolve();
    if (!this.running) this.running=(async()=>{
      try {
        const now = await databaseNow(this.db);
        if (now.getTime()-this.lastHeartbeat>30000) {
          await this.db.workerHeartbeat.upsert({where:{id:this.id},update:{lastSeenAt:now,status:'RUNNING',lastError:null},create:{id:this.id,mode:this.mode,lastSeenAt:now}});this.lastHeartbeat=now.getTime();
        }
        await this.schedule();
        // Interactive inbox has priority, but a Telegram outage does not stop business jobs.
        try { await this.telegram.drain(this.controller.signal); } catch { this.log.warn({category:'telegram-inbox'},'Telegram inbox temporarily unavailable'); }
        await this.queue.drain(job=>this.handle(job),this.controller.signal,10);
        await this.db.workerHeartbeat.updateMany({where:{id:this.id},data:{lastCompletedAt:await databaseNow(this.db),lastError:null}});
      } catch { this.log.warn({category:'background',workerId:this.id},'Background cycle temporarily unavailable; persisted work retained');
        try {await this.db.workerHeartbeat.updateMany({where:{id:this.id},data:{lastError:'BACKGROUND_TEMPORARY'}});}catch{/* Database outage: next successful heartbeat repairs this marker. */}
      }
    })().finally(()=>{this.running=undefined;});
    return this.running;
  }
  start() { if(this.timer)return; void this.run(); this.timer=setInterval(()=>{void this.run();},this.mode==='STANDALONE'?2000:15000);if(this.mode==='INLINE')this.timer.unref(); }
  async close() {this.controller.abort();if(this.timer)clearInterval(this.timer);await this.running;try{await this.db.workerHeartbeat.updateMany({where:{id:this.id},data:{status:'STOPPED',lastSeenAt:await databaseNow(this.db)}});}catch{/* Leases survive an unavailable database. */}}
}
