-- Stage 2.0: additive sandbox adapters, durable outbound attempts and immutable acceptances.
-- No LIVE mode, no existing-data updates, no changes to prices/capacity or resource operations.
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='payment_operations'::regclass AND contype='c'
 LOOP EXECUTE format('ALTER TABLE payment_operations DROP CONSTRAINT %I',c.conname); END LOOP;
END $$;
ALTER TABLE payment_operations ADD CONSTRAINT payment_operations_sandbox_source CHECK (
 (provider='DEMO_TEST' AND mode='DEMO' AND currency='RUB') OR
 (provider IN ('STARS_TEST','STARS_SANDBOX') AND mode='SANDBOX' AND currency='XTR') OR
 (provider IN ('SBP_MOCK','EXTERNAL_TEST','ROLLYPAY_SANDBOX','CLOUDPAYMENTS_SANDBOX') AND mode='SANDBOX' AND currency='RUB'));
ALTER TABLE payment_operations ADD CONSTRAINT payment_operations_state CHECK(status IN ('PENDING','UNKNOWN','SUCCEEDED','FAILED','CANCELLED','REFUNDED'));
ALTER TABLE payment_operations ADD CONSTRAINT payment_operations_amount CHECK(amount>=0);
CREATE TABLE provider_attempts (
 id UUID PRIMARY KEY,
 operation_id UUID NOT NULL REFERENCES payment_operations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 kind VARCHAR(16) NOT NULL CHECK(kind IN ('CREATE','REFUND')),
 key VARCHAR(180) NOT NULL UNIQUE,
 status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','RUNNING','UNKNOWN','SUCCEEDED','BLOCKED')),
 lease_token UUID, lease_until TIMESTAMPTZ(3), checkout_url VARCHAR(1024), last_error VARCHAR(64),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ(3) NOT NULL,
 UNIQUE(operation_id,kind)
);
CREATE INDEX provider_attempts_status_updated_at_id_idx ON provider_attempts(status,updated_at,id);
CREATE TABLE legal_acceptances (
 id UUID PRIMARY KEY,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 document_id VARCHAR(32) NOT NULL, version VARCHAR(32) NOT NULL, digest CHAR(64) NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
 channel VARCHAR(16) NOT NULL CHECK(channel IN ('TELEGRAM','WEBSITE')),
 accepted_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(order_id,document_id)
);
CREATE INDEX legal_acceptances_user_id_accepted_at_idx ON legal_acceptances(user_id,accepted_at);
CREATE TRIGGER immutable_legal_acceptance BEFORE UPDATE OR DELETE ON legal_acceptances FOR EACH ROW EXECUTE FUNCTION foundation_immutable();
