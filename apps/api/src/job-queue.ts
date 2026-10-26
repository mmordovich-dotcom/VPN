import { randomUUID } from 'node:crypto';
import type { PrismaClient, Prisma, BackgroundJob } from '@shared-vps/database';

export type JobTx = Prisma.TransactionClient;
export type JobKind = 'FULFILL_ORDER' | 'LIFECYCLE' | 'RECOVER' | 'CLEANUP' | 'NOTIFY';
export class JobFailure extends Error {
  constructor(public code: string, public permanent = false, public retryAfterMs = 0, public ambiguous = false) { super(code); }
}
export class DeferJob extends Error { constructor(public until: Date) { super('DEFERRED'); } }
export const backoff = (attempt: number, retryAfterMs = 0) => Math.min(3600000, Math.max(retryAfterMs, 1000 * 2 ** Math.min(12, Math.max(0, attempt - 1))));
export async function databaseNow(db: PrismaClient | JobTx) { const rows = await db.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`; return rows[0]!.now; }
export async function enqueue(tx: JobTx, kind: JobKind, key: string, payload: Prisma.InputJsonObject = {}, runAt?: Date) {
  // The business transaction and its outbox job commit together. A retry never resets a terminal job.
  const id=randomUUID(); const orderId=typeof payload.orderId==='string'?payload.orderId:null;
  await tx.$executeRaw`INSERT INTO background_jobs (id,kind,"key",payload,order_id,run_at) VALUES (${id}::uuid,${kind},${key},${JSON.stringify(payload)}::jsonb,${orderId}::uuid,COALESCE(${runAt??null}::timestamptz,CURRENT_TIMESTAMP)) ON CONFLICT ("key") DO NOTHING`;
  return tx.backgroundJob.findUniqueOrThrow({where:{key}});
}
export class JobQueue {
  constructor(public db: PrismaClient, private leaseMs = 60000) {}
  async claim(kinds?: readonly JobKind[]): Promise<BackgroundJob | null> {
    return this.db.$transaction(async tx => {
      const now = await databaseNow(tx);
      const candidates = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM background_jobs
        WHERE ((status = 'PENDING' AND run_at <= ${now}) OR (status = 'PROCESSING' AND lease_until <= ${now}))
        AND (${kinds === undefined} OR kind = ANY(${kinds ? [...kinds] : []}::text[]))
        ORDER BY CASE WHEN kind='NOTIFY' THEN 1 ELSE 0 END, run_at, id FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!candidates[0]) return null;
      const job = await tx.backgroundJob.findUniqueOrThrow({ where: { id: candidates[0].id } });
      // A send may have reached Telegram before a crash. Never blindly resend it.
      if (job.status === 'PROCESSING' && job.sendStartedAt) {
        await tx.backgroundJob.update({ where: { id: job.id }, data: { status: 'DEAD', lastError: 'DELIVERY_UNKNOWN', finishedAt: now, leaseToken: null, leaseUntil: null } });
        return null;
      }
      if (job.attempts >= job.maxAttempts) {
        await tx.backgroundJob.update({ where: { id: job.id }, data: { status: 'DEAD', lastError: job.lastError ?? 'ATTEMPTS_EXHAUSTED', finishedAt: now, leaseToken: null, leaseUntil: null } }); return null;
      }
      return tx.backgroundJob.update({ where: { id: job.id }, data: { status: 'PROCESSING', attempts: { increment: 1 }, leaseToken: randomUUID(), leaseUntil: new Date(now.getTime() + this.leaseMs), startedAt: job.startedAt ?? now } });
    });
  }
  async owns(tx: JobTx, job: BackgroundJob, now: Date) {
    return Boolean(await tx.backgroundJob.count({ where: { id: job.id, status: 'PROCESSING', leaseToken: job.leaseToken, leaseUntil: { gt: now } } }));
  }
  async finish(job: BackgroundJob, skipped = false) {
    const now = await databaseNow(this.db);
    return this.db.backgroundJob.updateMany({ where: { id: job.id, status: 'PROCESSING', leaseToken: job.leaseToken, leaseUntil: { gt: now } }, data: { status: skipped ? 'SKIPPED' : 'DONE', finishedAt: now, lastError: null, leaseToken: null, leaseUntil: null } });
  }
  async failed(job: BackgroundJob, error: unknown) {
    const now = await databaseNow(this.db);
    const defer = error instanceof DeferJob;
    const failure = error instanceof JobFailure ? error : new JobFailure('TASK_TEMPORARY');
    const terminal = !defer && (failure.permanent || failure.ambiguous || job.attempts >= job.maxAttempts);
    return this.db.backgroundJob.updateMany({ where: { id: job.id, status: 'PROCESSING', leaseToken: job.leaseToken, leaseUntil: { gt: now } }, data: {
      status: terminal ? 'DEAD' : 'PENDING', lastError: defer ? null : failure.code,
      runAt: defer ? error.until : new Date(now.getTime() + backoff(job.attempts, failure.retryAfterMs)),
      ...(defer ? { attempts: { decrement: 1 } } : {}), finishedAt: terminal ? now : null,
      leaseToken: null, leaseUntil: null, ...(!failure.ambiguous ? { sendStartedAt: null } : {}),
    } });
  }
  async drain(handler: (job: BackgroundJob) => Promise<boolean | void>, signal?: AbortSignal, limit = 10, kinds?: readonly JobKind[]) {
    let processed = 0;
    for (; processed < limit && !signal?.aborted; processed++) {
      const job = await this.claim(kinds); if (!job) break;
      let skipped: boolean | void;
      try { skipped = await handler(job); }
      catch (error) { await this.failed(job, error); continue; }
      // An acknowledgement outage must preserve sendStartedAt, never turn a completed send into a fresh attempt.
      await this.finish(job, skipped === true);
    }
    return processed;
  }
}
