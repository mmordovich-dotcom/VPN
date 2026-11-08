-- Additive Stage 1.9 foundation. No existing row updates, enum changes or backfill.
CREATE TABLE "payment_operations" (
id UUID PRIMARY KEY,
order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT ON UPDATE CASCADE,
payment_id UUID NOT NULL UNIQUE REFERENCES payments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
key VARCHAR(180) NOT NULL UNIQUE,
provider VARCHAR(32) NOT NULL,
mode VARCHAR(16) NOT NULL,
external_id VARCHAR(180) NOT NULL,
amount INTEGER NOT NULL,
currency CHAR(3) NOT NULL,
status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMPTZ(3) NOT NULL,
UNIQUE(provider,mode,external_id),
CHECK(mode IN ('DEMO','SANDBOX')),
CHECK(provider IN ('DEMO_TEST','STARS_TEST','SBP_MOCK','EXTERNAL_TEST')),
CHECK(status IN ('PENDING','UNKNOWN','SUCCEEDED','FAILED','CANCELLED','REFUNDED')),
CHECK(amount>=0 AND currency IN ('RUB','XTR')),
CHECK((provider='DEMO_TEST' AND mode='DEMO') OR (provider<>'DEMO_TEST' AND mode='SANDBOX')),
CHECK((provider='STARS_TEST' AND currency='XTR') OR (provider<>'STARS_TEST' AND currency='RUB'))
);

CREATE TABLE "payment_events" (
id UUID PRIMARY KEY,
operation_id UUID NOT NULL REFERENCES payment_operations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
event_id VARCHAR(180) NOT NULL,
digest VARCHAR(64) NOT NULL,
kind VARCHAR(16) NOT NULL,
amount INTEGER NOT NULL,
currency CHAR(3) NOT NULL,
created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
UNIQUE(operation_id,event_id),
CHECK(kind IN ('PENDING','UNKNOWN','SUCCEEDED','FAILED','CANCELLED','REFUNDED')),
CHECK(amount>=0 AND currency IN ('RUB','XTR'))
);

CREATE TABLE "payment_event_processing" (
event_id UUID PRIMARY KEY REFERENCES payment_events(id) ON DELETE RESTRICT ON UPDATE CASCADE,
status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
last_error VARCHAR(64),
updated_at TIMESTAMPTZ(3) NOT NULL,
CHECK(status IN ('PENDING','APPLIED','IGNORED','REJECTED'))
);

CREATE TABLE "financial_entries" (
id UUID PRIMARY KEY,
operation_id UUID NOT NULL REFERENCES payment_operations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
event_id UUID NOT NULL REFERENCES payment_events(id) ON DELETE RESTRICT ON UPDATE CASCADE,
key VARCHAR(200) NOT NULL UNIQUE,
kind VARCHAR(16) NOT NULL,
amount INTEGER NOT NULL,
currency CHAR(3) NOT NULL,
created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
CHECK(kind IN ('CAPTURE','REFUND','STATE')),
CHECK(amount>=0 AND currency IN ('RUB','XTR'))
);

CREATE TABLE "resource_operations" (
id UUID PRIMARY KEY,
key VARCHAR(180) NOT NULL UNIQUE,
mode VARCHAR(16) NOT NULL DEFAULT 'SANDBOX',
provider VARCHAR(16) NOT NULL DEFAULT 'MOCK',
status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
capacity INTEGER NOT NULL,
monthly_cost INTEGER NOT NULL,
currency CHAR(3) NOT NULL DEFAULT 'RUB',
server_id UUID UNIQUE REFERENCES servers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
external_id VARCHAR(180),
lease_token UUID,
lease_until TIMESTAMPTZ(3),
last_error VARCHAR(64),
created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMPTZ(3) NOT NULL,
CHECK(mode='SANDBOX' AND provider='MOCK'),
CHECK(capacity BETWEEN 1 AND 3 AND monthly_cost>=0 AND currency='RUB'),
CHECK(status IN ('PENDING','RUNNING','UNKNOWN','SUCCEEDED','FAILED')),
CHECK(external_id IS NULL OR external_id LIKE 'demo:vps:%'),
CHECK(status<>'SUCCEEDED' OR (external_id IS NOT NULL AND server_id IS NOT NULL))
);

CREATE TABLE "resource_reservations" (
id UUID PRIMARY KEY,
order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT ON UPDATE CASCADE,
operation_id UUID REFERENCES resource_operations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
slot_number INTEGER NOT NULL CHECK(slot_number BETWEEN 1 AND 3),
server_slot_id UUID REFERENCES server_slots(id) ON DELETE RESTRICT ON UPDATE CASCADE,
status VARCHAR(16) NOT NULL DEFAULT 'HELD',
created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMPTZ(3) NOT NULL,
CHECK(status IN ('HELD','CONSUMED','RELEASED')),
CHECK(operation_id IS NOT NULL OR server_slot_id IS NOT NULL)
);
CREATE INDEX payment_operations_status_updated_at_id_idx ON payment_operations(status,updated_at,id);
CREATE INDEX payment_events_created_at_id_idx ON payment_events(created_at,id);
CREATE INDEX payment_event_processing_status_updated_at_event_id_idx ON payment_event_processing(status,updated_at,event_id);
CREATE INDEX financial_entries_operation_id_created_at_id_idx ON financial_entries(operation_id,created_at,id);
CREATE INDEX resource_operations_status_lease_until_id_idx ON resource_operations(status,lease_until,id);
CREATE INDEX resource_reservations_operation_id_status_idx ON resource_reservations(operation_id,status);
CREATE UNIQUE INDEX resource_reservations_one_held_slot ON resource_reservations(server_slot_id) WHERE status='HELD';
CREATE UNIQUE INDEX resource_reservations_one_held_seat ON resource_reservations(operation_id,slot_number) WHERE status='HELD';
-- Evidence and journal are append-only even when application code is faulty.
CREATE FUNCTION foundation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Foundation evidence is append-only' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER immutable_payment_event BEFORE UPDATE OR DELETE ON payment_events FOR EACH ROW EXECUTE FUNCTION foundation_immutable();
CREATE TRIGGER immutable_financial_entry BEFORE UPDATE OR DELETE ON financial_entries FOR EACH ROW EXECUTE FUNCTION foundation_immutable();

-- Expand only the job-kind CHECK; existing jobs remain untouched.
ALTER TABLE background_jobs DROP CONSTRAINT background_jobs_kind_check;
ALTER TABLE background_jobs ADD CONSTRAINT background_jobs_kind_check CHECK(kind IN ('FULFILL_ORDER','LIFECYCLE','RECOVER','CLEANUP','NOTIFY','PAYMENT_EVENT','FOUNDATION_FULFILL','PAYMENT_RECOVER'));
