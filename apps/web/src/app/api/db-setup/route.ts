import { NextResponse } from "next/server";
import { db } from "@autosales/db";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    // Create all tables if they don't exist
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS companies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        domain VARCHAR(255) NOT NULL UNIQUE,
        company_name VARCHAR(255),
        status VARCHAR(50) NOT NULL DEFAULT 'prospect',
        renewal_month INTEGER,
        has_group_health_plan BOOLEAN,
        interest_status VARCHAR(50) DEFAULT 'unknown',
        next_action_at TIMESTAMPTZ,
        last_activity_at TIMESTAMPTZ,
        do_not_contact BOOLEAN NOT NULL DEFAULT false,
        summary TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contacts (
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
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS email_threads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        provider_thread_id VARCHAR(500),
        subject TEXT,
        last_message_at TIMESTAMPTZ,
        message_count INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS email_messages (
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
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS domain_memory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
        summary TEXT,
        key_facts JSONB DEFAULT '{}',
        renewal_info JSONB DEFAULT '{}',
        conversation_status TEXT,
        next_steps TEXT,
        last_updated_from_message_id UUID REFERENCES email_messages(id) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS cadences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        trigger_type VARCHAR(50) NOT NULL DEFAULT 'manual',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS cadence_steps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cadence_id UUID NOT NULL REFERENCES cadences(id) ON DELETE CASCADE,
        step_number INTEGER NOT NULL,
        delay_days INTEGER NOT NULL DEFAULT 0,
        action_type VARCHAR(50) NOT NULL DEFAULT 'send_email',
        template_prompt TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS enrollments (
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
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS classifications (
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
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS tasks (
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
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS suppression_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
        reason VARCHAR(100) NOT NULL,
        source VARCHAR(50) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type VARCHAR(50) NOT NULL,
        entity_id UUID NOT NULL,
        action VARCHAR(100) NOT NULL,
        details JSONB DEFAULT '{}',
        performed_by VARCHAR(100) NOT NULL DEFAULT 'system',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS oauth_accounts (
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
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS job_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_type VARCHAR(100) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'running',
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        completed_at TIMESTAMPTZ,
        error TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // Verify
    const result = await db.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    const tables = (result as unknown as Array<{ table_name: string }>).map(r => r.table_name);

    return NextResponse.json({
      status: "ok",
      message: "All tables created",
      tableCount: tables.length,
      tables,
    });
  } catch (err) {
    return NextResponse.json({
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
