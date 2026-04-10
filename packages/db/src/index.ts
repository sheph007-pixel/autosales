import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "./schema/index";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _tablesReady = false;

function getDb() {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    const client = postgres(connectionString, { max: 10 });
    _db = drizzle(client, { schema });
  }
  return _db;
}

const SCHEMA_VERSION = "v3"; // Bump this to force a schema reset

const FULL_SCHEMA_SQL = `
DROP TABLE IF EXISTS job_runs CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS suppression_events CASCADE;
DROP TABLE IF EXISTS classifications CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS enrollments CASCADE;
DROP TABLE IF EXISTS cadence_steps CASCADE;
DROP TABLE IF EXISTS cadences CASCADE;
DROP TABLE IF EXISTS domain_memory CASCADE;
DROP TABLE IF EXISTS email_messages CASCADE;
DROP TABLE IF EXISTS email_threads CASCADE;
DROP TABLE IF EXISTS contacts CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS oauth_accounts CASCADE;
DROP TABLE IF EXISTS _schema_version CASCADE;

CREATE TABLE _schema_version (version TEXT NOT NULL);
INSERT INTO _schema_version VALUES ('${SCHEMA_VERSION}');

CREATE TABLE oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  provider_account_id VARCHAR(255),
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  email VARCHAR(255),
  delta_token TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain VARCHAR(255) NOT NULL UNIQUE,
  company_name VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'lead',
  renewal_month INTEGER,
  has_group_health_plan BOOLEAN,
  interest_status VARCHAR(50) DEFAULT 'unknown',
  next_action_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  do_not_contact BOOLEAN NOT NULL DEFAULT false,
  summary TEXT,
  primary_contact_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  title VARCHAR(255),
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(50),
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  last_contacted_at TIMESTAMPTZ,
  last_replied_at TIMESTAMPTZ,
  do_not_contact BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider_thread_id VARCHAR(500),
  subject TEXT,
  last_message_at TIMESTAMPTZ,
  message_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES email_threads(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  provider_message_id VARCHAR(500) UNIQUE,
  direction VARCHAR(10) NOT NULL,
  from_address VARCHAR(255) NOT NULL,
  to_addresses JSONB NOT NULL,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  is_auto_generated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE domain_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  summary TEXT,
  key_facts JSONB DEFAULT '{}',
  renewal_info JSONB DEFAULT '{}',
  conversation_status TEXT,
  next_steps TEXT,
  last_updated_from_message_id UUID REFERENCES email_messages(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cadences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  trigger_type VARCHAR(50) NOT NULL DEFAULT 'manual',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cadence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cadence_id UUID NOT NULL REFERENCES cadences(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  delay_days INTEGER NOT NULL DEFAULT 0,
  action_type VARCHAR(50) NOT NULL DEFAULT 'send_email',
  template_prompt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cadence_id UUID NOT NULL REFERENCES cadences(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  current_step INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  next_step_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  category VARCHAR(50) NOT NULL,
  confidence NUMERIC(3,2) NOT NULL,
  renewal_month_detected INTEGER,
  has_plan_detected BOOLEAN,
  follow_up_date TIMESTAMPTZ,
  raw_evidence TEXT,
  extracted_facts JSONB DEFAULT '{}',
  model_version VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  description TEXT,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE suppression_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  reason VARCHAR(100) NOT NULL,
  source VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,
  details JSONB DEFAULT '{}',
  performed_by VARCHAR(100) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

// Idempotent migration: adds primary_contact_id, remaps statuses, backfills.
// Safe to run on every startup — all statements use IF NOT EXISTS or are idempotent.
const GROUPS_MIGRATION_SQL = `
ALTER TABLE companies ADD COLUMN IF NOT EXISTS primary_contact_id UUID;
ALTER TABLE companies ALTER COLUMN status SET DEFAULT 'lead';
UPDATE companies SET status = 'current_client' WHERE status = 'client';
UPDATE companies SET status = 'old_client' WHERE status = 'dormant';
UPDATE companies SET status = 'lead' WHERE status IN ('prospect','active_opportunity','quoted');
UPDATE companies SET status = 'not_qualified' WHERE status = 'suppressed';
UPDATE companies c
  SET primary_contact_id = (
    SELECT id FROM contacts
    WHERE company_id = c.id
    ORDER BY created_at ASC
    LIMIT 1
  )
  WHERE primary_contact_id IS NULL;
`;

export async function ensureTables() {
  if (_tablesReady) return;
  try {
    const database = getDb();

    // Check if schema version matches
    let versionMatches = false;
    try {
      const result = await database.execute(sql`SELECT version FROM _schema_version LIMIT 1`);
      const rows = result as unknown as Array<{ version: string }>;
      if (rows.length > 0 && rows[0]?.version === SCHEMA_VERSION) {
        versionMatches = true;
      }
    } catch {
      // Table doesn't exist — need to create schema
    }

    if (!versionMatches) {
      console.log("Schema version mismatch or missing. Recreating all tables...");
      await database.execute(sql.raw(FULL_SCHEMA_SQL));
      console.log("All tables created successfully.");
    }

    // Always run idempotent migration for Groups refactor (v3 → Groups)
    try {
      await database.execute(sql.raw(GROUPS_MIGRATION_SQL));
    } catch (err) {
      console.error("Groups migration failed:", err);
    }

    _tablesReady = true;
  } catch (err) {
    console.error("Failed to ensure tables:", err);
  }
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_, prop) {
    const instance = getDb();
    if (!_tablesReady) {
      ensureTables().catch(() => {});
    }
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});

export type Database = typeof db;

export * from "./schema/index";
