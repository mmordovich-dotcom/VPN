-- Additive Stage 1.3. Existing business rows, constraints and migrations remain intact.
CREATE TABLE "background_jobs" (
  "id" UUID NOT NULL PRIMARY KEY,
  "order_id" UUID REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "kind" VARCHAR(32) NOT NULL CHECK ("kind" IN ('FULFILL_ORDER','LIFECYCLE','RECOVER','CLEANUP','NOTIFY')),
  "key" VARCHAR(180) NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','PROCESSING','DONE','DEAD','SKIPPED')),
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "max_attempts" INTEGER NOT NULL DEFAULT 8 CHECK ("max_attempts" BETWEEN 1 AND 20),
  "run_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_token" UUID,
  "lease_until" TIMESTAMPTZ(3),
  "started_at" TIMESTAMPTZ(3),
  "send_started_at" TIMESTAMPTZ(3),
  "finished_at" TIMESTAMPTZ(3),
  "last_error" VARCHAR(64),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "background_jobs_order_id_idx" ON "background_jobs"("order_id");
CREATE UNIQUE INDEX "background_jobs_key_key" ON "background_jobs"("key");
CREATE INDEX "background_jobs_status_run_at_id_idx" ON "background_jobs"("status","run_at","id");
CREATE INDEX "background_jobs_status_lease_until_idx" ON "background_jobs"("status","lease_until");
CREATE INDEX "background_jobs_finished_at_idx" ON "background_jobs"("finished_at");
CREATE TABLE "notification_preferences" (
  "user_id" UUID NOT NULL PRIMARY KEY REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "reminders_enabled" BOOLEAN NOT NULL DEFAULT false,
  "updates_enabled" BOOLEAN NOT NULL DEFAULT false,
  "telegram_blocked" BOOLEAN NOT NULL DEFAULT false,
  "next_send_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "delivery_throttles" (
  "key" VARCHAR(32) NOT NULL PRIMARY KEY,
  "next_at" TIMESTAMPTZ(3) NOT NULL
);
CREATE TABLE "worker_heartbeats" (
  "id" UUID NOT NULL PRIMARY KEY,
  "mode" VARCHAR(16) NOT NULL CHECK ("mode" IN ('INLINE','STANDALONE')),
  "status" VARCHAR(16) NOT NULL DEFAULT 'RUNNING' CHECK ("status" IN ('RUNNING','STOPPED')),
  "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_completed_at" TIMESTAMPTZ(3),
  "last_error" VARCHAR(64)
);
CREATE INDEX "worker_heartbeats_last_seen_at_idx" ON "worker_heartbeats"("last_seen_at");
ALTER TABLE "telegram_updates"
  ADD COLUMN "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lease_token" UUID,
  ADD COLUMN "lease_until" TIMESTAMPTZ(3),
  ADD COLUMN "send_started_at" TIMESTAMPTZ(3),
  ADD COLUMN "finished_at" TIMESTAMPTZ(3),
  ADD COLUMN "last_error" VARCHAR(64);
CREATE INDEX "telegram_updates_status_next_attempt_at_id_idx" ON "telegram_updates"("status","next_attempt_at","id");
CREATE INDEX "telegram_updates_status_lease_until_idx" ON "telegram_updates"("status","lease_until");
-- Old in-flight sends have an uncertain delivery outcome: quarantine rather than resend.
UPDATE "telegram_updates" SET "lease_until"="updated_at" + interval '2 minutes', "send_started_at"="updated_at" WHERE "status"='PROCESSING';
UPDATE "telegram_updates" SET "status"='DEAD', "last_error"='ATTEMPTS_EXHAUSTED', "finished_at"=CURRENT_TIMESTAMP WHERE "attempts">=5 AND "status" NOT IN ('DONE','PROCESSING');
UPDATE "telegram_updates" SET "finished_at"="updated_at" WHERE "status"='DONE';

CREATE INDEX "users_created_at_id_idx" ON "users"("created_at","id");
CREATE INDEX "orders_created_at_id_idx" ON "orders"("created_at","id");
CREATE INDEX "orders_user_id_created_at_id_idx" ON "orders"("user_id","created_at","id");
CREATE INDEX "subscriptions_created_at_id_idx" ON "subscriptions"("created_at","id");
CREATE INDEX "subscriptions_user_id_created_at_id_idx" ON "subscriptions"("user_id","created_at","id");
CREATE INDEX "servers_created_at_id_idx" ON "servers"("created_at","id");
CREATE INDEX "support_tickets_created_at_id_idx" ON "support_tickets"("created_at","id");
CREATE INDEX "support_tickets_user_id_created_at_id_idx" ON "support_tickets"("user_id","created_at","id");
CREATE INDEX "audit_logs_created_at_id_idx" ON "audit_logs"("created_at","id");
CREATE INDEX "background_jobs_created_at_id_idx" ON "background_jobs"("created_at","id");
