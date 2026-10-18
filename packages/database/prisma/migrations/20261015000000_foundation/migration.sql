-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "IdentityProvider" AS ENUM ('TELEGRAM', 'EMAIL');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('AWAITING_PAYMENT', 'PAID', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('TEST');

-- CreateEnum
CREATE TYPE "ServerProvider" AS ENUM ('MOCK');

-- CreateEnum
CREATE TYPE "ServerStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'FAILED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'OCCUPIED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SettingType" AS ENUM ('INTEGER', 'BOOLEAN', 'STRING', 'OBJECT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "IdentityProvider" NOT NULL,
    "provider_user_id" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'RUB',
    "duration_days" INTEGER NOT NULL,
    "max_users_per_server" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "amount" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'RUB',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'TEST',
    "external_payment_id" VARCHAR(255),
    "amount" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'RUB',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servers" (
    "id" UUID NOT NULL,
    "provider" "ServerProvider" NOT NULL DEFAULT 'MOCK',
    "external_server_id" VARCHAR(255),
    "status" "ServerStatus" NOT NULL DEFAULT 'PROVISIONING',
    "monthly_cost" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'RUB',
    "capacity" INTEGER NOT NULL,
    "rented_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_slots" (
    "id" UUID NOT NULL,
    "server_id" UUID NOT NULL,
    "slot_number" INTEGER NOT NULL,
    "status" "SlotStatus" NOT NULL DEFAULT 'AVAILABLE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "server_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "server_slot_id" UUID,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_credentials" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "demo_identifier" VARCHAR(128) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "access_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(128) NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "entity_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" UUID NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "value_type" "SettingType" NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "user_identities_user_id_idx" ON "user_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_provider_provider_user_id_key" ON "user_identities"("provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE INDEX "plans_is_active_idx" ON "plans"("is_active");

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_idx" ON "orders"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_plan_id_idx" ON "orders"("plan_id");

-- CreateIndex
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_id_user_id_plan_id_key" ON "orders"("id", "user_id", "plan_id");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_external_payment_id_key" ON "payments"("provider", "external_payment_id");

-- CreateIndex
CREATE INDEX "servers_status_expires_at_idx" ON "servers"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "servers_provider_external_server_id_key" ON "servers"("provider", "external_server_id");

-- CreateIndex
CREATE INDEX "server_slots_status_server_id_idx" ON "server_slots"("status", "server_id");

-- CreateIndex
CREATE UNIQUE INDEX "server_slots_server_id_slot_number_key" ON "server_slots"("server_id", "slot_number");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_order_id_key" ON "subscriptions"("order_id");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_status_idx" ON "subscriptions"("user_id", "status");

-- CreateIndex
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_expires_at_idx" ON "subscriptions"("status", "expires_at");

-- CreateIndex
CREATE INDEX "subscriptions_server_slot_id_idx" ON "subscriptions"("server_slot_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_order_id_user_id_plan_id_key" ON "subscriptions"("order_id", "user_id", "plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "access_credentials_demo_identifier_key" ON "access_credentials"("demo_identifier");

-- CreateIndex
CREATE INDEX "access_credentials_subscription_id_idx" ON "access_credentials"("subscription_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- AddForeignKey
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "server_slots" ADD CONSTRAINT "server_slots_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_order_id_user_id_plan_id_fkey" FOREIGN KEY ("order_id", "user_id", "plan_id") REFERENCES "orders"("id", "user_id", "plan_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_server_slot_id_fkey" FOREIGN KEY ("server_slot_id") REFERENCES "server_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_credentials" ADD CONSTRAINT "access_credentials_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Extra PostgreSQL invariants not expressible in the Prisma schema.
ALTER TABLE plans ADD CONSTRAINT plans_values_check CHECK (
  price >= 0 AND duration_days > 0 AND max_users_per_server > 0
  AND currency ~ '^[A-Z]{3}$' AND length(trim(name)) > 0 AND length(trim(code)) > 0
);
ALTER TABLE orders ADD CONSTRAINT orders_values_check CHECK (amount >= 0 AND currency ~ '^[A-Z]{3}$');
ALTER TABLE payments ADD CONSTRAINT payments_values_check CHECK (
  amount >= 0 AND currency ~ '^[A-Z]{3}$'
  AND (external_payment_id IS NULL OR length(trim(external_payment_id)) > 0)
  AND (status NOT IN ('SUCCEEDED', 'REFUNDED') OR external_payment_id IS NOT NULL)
);
ALTER TABLE servers ADD CONSTRAINT servers_values_check CHECK (
  monthly_cost >= 0 AND capacity > 0 AND currency ~ '^[A-Z]{3}$'
  AND (expires_at IS NULL OR (rented_at IS NOT NULL AND expires_at > rented_at))
);
ALTER TABLE server_slots ADD CONSTRAINT slot_number_positive CHECK (slot_number > 0);
ALTER TABLE subscriptions ADD CONSTRAINT subscription_dates_check CHECK (
  (expires_at IS NULL OR (started_at IS NOT NULL AND expires_at > started_at))
  AND (status NOT IN ('ACTIVE', 'SUSPENDED') OR (server_slot_id IS NOT NULL AND started_at IS NOT NULL AND expires_at IS NOT NULL))
);
-- Pending assignments reserve capacity too; history keeps its original slot FK.
CREATE UNIQUE INDEX subscriptions_one_live_per_slot ON subscriptions(server_slot_id)
  WHERE server_slot_id IS NOT NULL AND status IN ('PENDING', 'ACTIVE', 'SUSPENDED');
ALTER TABLE access_credentials ADD CONSTRAINT credentials_demo_only CHECK (
  demo_identifier LIKE 'demo:%' AND jsonb_typeof(metadata) = 'object'
);
ALTER TABLE audit_logs ADD CONSTRAINT audit_metadata_object CHECK (jsonb_typeof(metadata) = 'object');
ALTER TABLE settings ADD CONSTRAINT setting_value_type_check CHECK (
  CASE value_type
    WHEN 'INTEGER' THEN jsonb_typeof(value) = 'number' AND value::text ~ '^-?[0-9]+$'
    WHEN 'BOOLEAN' THEN jsonb_typeof(value) = 'boolean'
    WHEN 'STRING' THEN jsonb_typeof(value) = 'string'
    WHEN 'OBJECT' THEN jsonb_typeof(value) = 'object'
    ELSE false
  END
);
ALTER TABLE settings ADD CONSTRAINT business_settings_check CHECK (
  CASE
    WHEN key IN ('server.monthly_cost_minor', 'business.first_purchase_reserve_minor')
      THEN value_type = 'INTEGER' AND (value::text)::numeric >= 0
    WHEN key IN ('server.rental_days', 'server.default_capacity')
      THEN value_type = 'INTEGER' AND (value::text)::numeric > 0
    WHEN key = 'business.currency' THEN value_type = 'STRING' AND value #>> '{}' ~ '^[A-Z]{3}$'
    ELSE true
  END
);

-- Serialize slot changes with capacity changes on the parent server row.
CREATE FUNCTION enforce_slot_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE limit_value integer;
BEGIN
  SELECT capacity INTO limit_value FROM servers WHERE id = NEW.server_id FOR UPDATE;
  IF NOT FOUND OR NEW.slot_number > limit_value THEN
    RAISE EXCEPTION 'Slot exceeds server capacity' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER slot_capacity_before_write BEFORE INSERT OR UPDATE ON server_slots
  FOR EACH ROW EXECUTE FUNCTION enforce_slot_capacity();

CREATE FUNCTION enforce_server_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM server_slots WHERE server_id = NEW.id AND slot_number > NEW.capacity) THEN
    RAISE EXCEPTION 'Existing slots exceed proposed capacity' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER server_capacity_before_update BEFORE UPDATE OF capacity ON servers
  FOR EACH ROW EXECUTE FUNCTION enforce_server_capacity();
