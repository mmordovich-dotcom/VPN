-- Stage 1.5: additive business history. No resets, deletes or reassignment.
BEGIN;
ALTER TABLE support_tickets ADD COLUMN category varchar(32) NOT NULL DEFAULT 'OTHER', ADD COLUMN updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN incident_id uuid;
UPDATE support_tickets SET updated_at = created_at;
ALTER TABLE support_tickets ADD CONSTRAINT support_ticket_category_valid CHECK (category IN ('SUBSCRIPTION','ACCOUNT','INSTRUCTIONS','UNAVAILABLE','APP','OTHER'));
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_status_expanded CHECK (status IN ('OPEN','WAITING_ADMIN','IN_PROGRESS','WAITING_PROVIDER','WAITING_USER','CLOSED'));
ALTER TABLE support_tickets DROP CONSTRAINT support_tickets_status_valid;
ALTER TABLE support_tickets RENAME CONSTRAINT support_tickets_status_expanded TO support_tickets_status_valid;
ALTER TABLE bot_states ADD COLUMN support_category varchar(32) NOT NULL DEFAULT 'OTHER', ADD COLUMN active_ticket_id uuid;
CREATE TABLE support_messages (
 id uuid PRIMARY KEY, ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 author_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 author_role varchar(16) NOT NULL CHECK (author_role IN ('USER','ADMIN')), text varchar(4000) NOT NULL CHECK (length(text) BETWEEN 1 AND 4000),
 operation_key varchar(180) NOT NULL UNIQUE, created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX support_messages_ticket_id_created_at_id_idx ON support_messages(ticket_id,created_at,id);
-- Original text and ticket ID/number remain intact; preserve timestamps in the first message.
INSERT INTO support_messages(id,ticket_id,author_id,author_role,text,operation_key,created_at)
 SELECT gen_random_uuid(),id,user_id,'USER',text,'migration:ticket:' || id::text,created_at FROM support_tickets;
CREATE TABLE service_incidents (
 id uuid PRIMARY KEY, operation_key varchar(180) NOT NULL UNIQUE, component varchar(32) NOT NULL CHECK (component IN ('WEB','API','POSTGRES','TELEGRAM','PROVIDER','UNKNOWN')),
 server_id uuid REFERENCES servers(id) ON DELETE RESTRICT ON UPDATE CASCADE, source varchar(16) NOT NULL DEFAULT 'DEMO' CHECK (source = 'DEMO'),
 status varchar(16) NOT NULL DEFAULT 'SUSPECTED' CHECK (status IN ('SUSPECTED','CONFIRMED','RESOLVED')),
 diagnosis varchar(32) NOT NULL DEFAULT 'UNKNOWN' CHECK (diagnosis IN ('UNKNOWN','SERVICE_FAILURE','RECOVERED')),
 started_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, confirmed_at timestamptz(3), resolved_at timestamptz(3),
 last_checked_at timestamptz(3),last_success_at timestamptz(3),last_result varchar(16) NOT NULL DEFAULT 'UNKNOWN' CHECK (last_result IN ('UNKNOWN','SUCCESS','FAILURE')),
 created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT incident_dates_valid CHECK ((confirmed_at IS NULL OR confirmed_at >= started_at) AND (resolved_at IS NULL OR resolved_at >= confirmed_at)),
 CONSTRAINT incident_confirmation_valid CHECK (status = 'SUSPECTED' OR confirmed_at IS NOT NULL),
 CONSTRAINT incident_resolution_valid CHECK (status <> 'RESOLVED' OR resolved_at IS NOT NULL)
);
CREATE INDEX service_incidents_status_started_at_idx ON service_incidents(status,started_at);
CREATE INDEX service_incidents_server_id_started_at_idx ON service_incidents(server_id,started_at);
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_incident_id_fkey FOREIGN KEY(incident_id) REFERENCES service_incidents(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE incident_observations (
 id uuid PRIMARY KEY, incident_id uuid NOT NULL REFERENCES service_incidents(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 operation_key varchar(180) NOT NULL UNIQUE, result varchar(16) NOT NULL CHECK (result IN ('UNKNOWN','SUCCESS','FAILURE')),
 checked_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX incident_observations_incident_id_checked_at_id_idx ON incident_observations(incident_id,checked_at,id);
CREATE TABLE provider_escalations (
 id uuid PRIMARY KEY, ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 incident_id uuid NOT NULL REFERENCES service_incidents(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 draft varchar(4000) NOT NULL, reviewed_hash varchar(64), status varchar(32) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','REVIEWED','WAITING_PROVIDER','REPLY_RECORDED')),
 provider_reply varchar(4000), created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz(3) NOT NULL,
 UNIQUE(ticket_id,incident_id)
);
CREATE TABLE subscription_compensations (
 id uuid PRIMARY KEY, incident_id uuid NOT NULL REFERENCES service_incidents(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 operation_key varchar(180) NOT NULL UNIQUE,hours integer NOT NULL CHECK (hours BETWEEN 1 AND 168),reason varchar(500) NOT NULL CHECK (length(reason) BETWEEN 5 AND 500),
 previous_expiry timestamptz(3) NOT NULL,new_expiry timestamptz(3) NOT NULL,window_start timestamptz(3) NOT NULL,window_end timestamptz(3) NOT NULL,
 created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(incident_id,subscription_id),
 CONSTRAINT compensation_dates_valid CHECK (new_expiry > previous_expiry AND window_end > window_start AND new_expiry = previous_expiry + hours * interval '1 hour')
);
CREATE INDEX subscription_compensations_subscription_id_created_at_idx ON subscription_compensations(subscription_id,created_at);
-- At most four for FUTURE explicitly approved configurations. Existing defaults stay three.
ALTER TABLE plans ADD CONSTRAINT plans_capacity_release_limit CHECK (max_users_per_server BETWEEN 1 AND 4) NOT VALID;
ALTER TABLE servers ADD CONSTRAINT servers_capacity_release_limit CHECK (capacity BETWEEN 1 AND 4) NOT VALID;
ALTER TABLE plans VALIDATE CONSTRAINT plans_capacity_release_limit;
ALTER TABLE servers VALIDATE CONSTRAINT servers_capacity_release_limit;
INSERT INTO settings(id,key,value_type,value,created_at,updated_at) VALUES(gen_random_uuid(),'server.capacity4_approved','BOOLEAN','false'::jsonb,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING;
COMMIT;
