# Kennion AutoSales

AI-powered group health brokerage platform. Domain-centric, renewal-driven operating system that automates employer prospect and client management.

## Architecture

Monorepo with 2 deployable services + 4 shared packages:

```
apps/web        → Next.js 14 operator console (Railway web service)
apps/worker     → pg-boss background worker (Railway worker service)
packages/db     → Drizzle ORM schema + PostgreSQL connection
packages/core   → Business logic services, types, utilities
packages/ai     → OpenAI extraction, classification, email generation
packages/mail   → Microsoft Graph API client, OAuth, email sync
```

### Tech Stack

- **Runtime**: Node.js 22, TypeScript
- **Web**: Next.js 14 (App Router), Tailwind CSS, NextAuth.js
- **Database**: PostgreSQL (Railway), Drizzle ORM
- **Jobs**: pg-boss (Postgres-backed queue)
- **AI**: OpenAI GPT-4o with structured outputs (Zod schemas)
- **Email**: Microsoft Graph API (Outlook integration)
- **Monorepo**: pnpm workspaces + Turborepo
- **Deployment**: Railway (web + worker services)

### Database Schema (14 tables)

| Table | Purpose |
|-------|---------|
| companies | Domain-centric company records (top-level entity) |
| contacts | People linked to companies by email domain |
| email_threads | Grouped conversations per company |
| email_messages | Individual emails with provider IDs |
| domain_memory | AI-generated living summary per company |
| cadences | Multi-step outreach sequences |
| cadence_steps | Individual steps within cadences |
| enrollments | Contact enrollment in cadences |
| classifications | AI classification of inbound messages |
| tasks | Pending actions and follow-ups |
| suppression_events | Do-not-contact records |
| audit_logs | System action history |
| oauth_accounts | Microsoft OAuth tokens + sync state |
| job_runs | Background job execution history |

## Local Development

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- PostgreSQL (or Railway Postgres)

### Setup

```bash
# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env
# Edit .env with your values (see Environment Variables below)

# Push schema to database (no migrations needed for dev)
pnpm db:push

# Start development
pnpm dev
```

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/autosales

# NextAuth (generate secret: openssl rand -base64 32)
NEXTAUTH_SECRET=your-random-secret
NEXTAUTH_URL=http://localhost:3000
ADMIN_EMAIL=admin@kennion.com
ADMIN_PASSWORD_HASH=<bcrypt hash of your password>

# Microsoft Graph (Azure AD App Registration)
MICROSOFT_CLIENT_ID=your-app-client-id
MICROSOFT_CLIENT_SECRET=your-app-client-secret
MICROSOFT_TENANT_ID=your-tenant-id-or-common
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/outlook/callback

# OpenAI
OPENAI_API_KEY=sk-your-key

# App
APP_URL=http://localhost:3000
```

To generate a password hash:
```bash
node -e "require('bcryptjs').hash('yourpassword', 10).then(console.log)"
```

### Microsoft Azure Setup

1. Go to Azure Portal → Azure Active Directory → App registrations
2. Create new registration
3. Redirect URI: `http://localhost:3000/api/outlook/callback` (Web)
4. API Permissions: Add `Mail.Read`, `Mail.Send`, `Mail.ReadWrite`, `User.Read`, `offline_access`
5. Certificates & Secrets: Create client secret
6. Copy Application (client) ID and secret to your .env

## Railway Deployment

### Setup

1. Create a Railway project
2. Add a PostgreSQL service
3. Create two services from this repo:

**Web Service:**
- Root directory: `/` (or configure build command)
- Build: `pnpm install && pnpm turbo build --filter=web...`
- Start: `node apps/web/.next/standalone/server.js`
- Health check: `/api/health`

**Worker Service:**
- Root directory: `/`
- Build: `pnpm install && pnpm turbo build --filter=worker...`
- Start: `node apps/worker/dist/index.js`

4. Add environment variables to both services (share DATABASE_URL from Postgres)
5. Update `MICROSOFT_REDIRECT_URI` to your Railway domain

## What's Implemented

### Fully Built
- Complete 14-table Drizzle schema with indexes and foreign keys
- NextAuth credentials authentication with login page
- Microsoft OAuth flow (connect, callback, token refresh)
- Graph API client for email sync (initial + delta) and send
- Email sync pipeline: fetch → extract domains → create companies → merge contacts → group threads
- AI classification pipeline with structured outputs (classify replies, extract facts)
- AI domain memory generation and refresh
- AI outbound email generation with full context
- Cadence engine: create cadences, enroll contacts, step progression, renewal-aware scheduling
- pg-boss worker with 7 job types + cron scheduling
- Operator console: Dashboard, Domains list, Domain detail, Contacts, Inbox/Reply queue, Cadences, Settings
- Server actions for status updates and cadence management
- Audit logging throughout
- Railway deployment configuration
- Lazy DB connection (builds without DATABASE_URL)

### Stubbed / Enhancement Opportunities
- Token encryption at rest (tokens stored as plaintext, marked TODO)
- Graph webhook subscriptions (using 5-min polling instead)
- Advanced contact dedup heuristics (basic email-based dedup implemented)
- Email template visual editor (using AI prompt-based generation)
- Multi-user support (single admin user for MVP)
- Advanced analytics/reporting
- Email open/click tracking

## Project Structure

```
autosales/
├── apps/
│   ├── web/                    # Next.js operator console
│   │   ├── src/app/            # App Router pages
│   │   │   ├── (app)/          # Authenticated routes with nav
│   │   │   │   ├── page.tsx              # Dashboard
│   │   │   │   ├── domains/              # Domain list + detail
│   │   │   │   ├── contacts/             # Contact list
│   │   │   │   ├── inbox/                # Reply queue
│   │   │   │   ├── cadences/             # Cadence management
│   │   │   │   └── settings/             # Outlook connection
│   │   │   ├── api/            # API routes
│   │   │   └── login/          # Login page
│   │   └── src/components/     # UI components
│   └── worker/                 # Background worker
│       └── src/jobs/           # Job handlers
├── packages/
│   ├── db/                     # Schema + connection
│   ├── core/                   # Business logic
│   ├── ai/                     # AI pipelines
│   └── mail/                   # Microsoft Graph
└── turbo.json                  # Build orchestration
```
