-- Additive only: existing identities, sessions, orders and subscriptions are preserved.
CREATE TABLE "login_requests" (
  "id" UUID NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL,
  "browser_hash" VARCHAR(64) NOT NULL,
  "display_code" VARCHAR(6) NOT NULL,
  "session_hash" VARCHAR(64),
  "telegram_id" VARCHAR(16),
  "user_id" UUID,
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "login_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "login_requests_status_check" CHECK ("status" IN ('PENDING', 'CLAIMED', 'APPROVED', 'CANCELLED', 'CONSUMED')),
  CONSTRAINT "login_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "login_requests_token_hash_key" ON "login_requests"("token_hash");
CREATE INDEX "login_requests_browser_hash_status_idx" ON "login_requests"("browser_hash", "status");
CREATE INDEX "login_requests_expires_at_idx" ON "login_requests"("expires_at");
CREATE TABLE "login_grants" (
  "id" UUID NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL,
  "operation_key" VARCHAR(80) NOT NULL,
  "kind" VARCHAR(8) NOT NULL,
  "user_id" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "login_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "login_grants_kind_check" CHECK ("kind" IN ('LINK', 'CODE')),
  CONSTRAINT "login_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "login_grants_token_hash_key" ON "login_grants"("token_hash");
CREATE UNIQUE INDEX "login_grants_operation_key_key" ON "login_grants"("operation_key");
CREATE INDEX "login_grants_user_id_kind_idx" ON "login_grants"("user_id", "kind");
CREATE INDEX "login_grants_expires_at_idx" ON "login_grants"("expires_at");
CREATE TABLE "auth_limits" (
  "key" VARCHAR(64) NOT NULL,
  "attempts" INTEGER NOT NULL CHECK ("attempts" > 0),
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "auth_limits_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "auth_limits_expires_at_idx" ON "auth_limits"("expires_at");

