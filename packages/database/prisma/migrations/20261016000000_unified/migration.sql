-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_error" VARCHAR(64),
ADD COLUMN     "operation_key" VARCHAR(160),
ADD COLUMN     "period_days" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "renewal_id" UUID;

-- CreateTable
CREATE TABLE "sessions" (
    "token_hash" VARCHAR(64) NOT NULL,
    "user_id" UUID,
    "nonce" VARCHAR(64),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "auth_replays" (
    "hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_replays_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "operation_key" VARCHAR(160),
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "text" VARCHAR(4000) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_states" (
    "user_id" UUID NOT NULL,
    "awaiting_support" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "bot_states_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "telegram_updates" (
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "response" JSONB,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_operation_key_key" ON "support_tickets"("operation_key");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_number_key" ON "support_tickets"("number");

-- CreateIndex
CREATE INDEX "support_tickets_user_id_created_at_idx" ON "support_tickets"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "telegram_updates_status_created_at_idx" ON "telegram_updates"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_operation_key_key" ON "orders"("operation_key");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_renewal_id_fkey" FOREIGN KEY ("renewal_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_states" ADD CONSTRAINT "bot_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Additional invariants for new Stage 1.2 fields. Foundation constraints remain intact.
ALTER TABLE "orders" ADD CONSTRAINT "orders_period_days_positive" CHECK (period_days BETWEEN 1 AND 365),
  ADD CONSTRAINT "orders_attempts_nonnegative" CHECK (attempts >= 0);
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_status_valid" CHECK (status IN ('OPEN','IN_PROGRESS','CLOSED')),
  ADD CONSTRAINT "support_tickets_text_valid" CHECK (length(text) BETWEEN 5 AND 4000);
ALTER TABLE "telegram_updates" ADD CONSTRAINT "telegram_updates_status_valid" CHECK (status IN ('PENDING','READY','PROCESSING','DONE')),
  ADD CONSTRAINT "telegram_updates_attempts_nonnegative" CHECK (attempts >= 0);
