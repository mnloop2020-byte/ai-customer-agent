# Architecture

## Current Stack

- Next.js App Router with TypeScript.
- Tailwind CSS for the interface.
- Prisma for PostgreSQL schema and future migrations.
- Prisma PostgreSQL adapter for Prisma 7.
- Zod for validation.
- Lucide React for interface icons.
- Docker Compose definition for local PostgreSQL.
- Server-side AI provider adapter for Gemini, Groq, and explicit fallback.

## Logical Layers

```txt
Channels
  Web Chat, WhatsApp, Email, Social

Intake Layer
  Webhooks, message normalization, lead lookup

AI Brain
  Intent detection, extraction, scoring support, response draft

Business Logic
  Qualification, lead scoring, routing, objections, follow-ups, handoff

Persistence
  PostgreSQL through Prisma

Reporting
  KPIs, conversion, objections, channel performance
```

## Important Design Decisions

- SaaS-first data model: every operational record belongs to a company.
- AI decisions live in `src/domain/agent.ts` so business logic stays separate from UI and API routes.
- Company knowledge lives in `src/domain/company.ts`; later it can move from local storage to PostgreSQL without changing the Agent interface.
- Business decisions are explicit in code instead of hidden inside prompts only.
- Human handoff is a first-class entity, not an afterthought.
- The first UI is an operational dashboard, not a marketing landing page.

## Code Organization

```txt
src/app
  Next.js routes and API endpoints.

src/components
  Reusable UI and feature workspaces.

src/domain
  Business types, schemas, and pure Agent logic.

src/lib
  Infrastructure helpers, storage adapters, demo data, database client.
```

The project should keep this rule: UI calls domain logic through small APIs or adapters, and domain code should not depend on React.

## First API

`POST /api/agent/analyze`

Example body:

```json
{
  "body": "نحتاج Demo لفريق من 20 شخص خلال أسبوعين",
  "channel": "WEB_CHAT",
  "leadSnapshot": {
    "score": 40,
    "status": "WARM"
  }
}
```

The response returns the detected intent, qualification signals, score delta, lead temperature, next action, and suggested reply.

## Current Routes

- `/` - operating dashboard.
- `/chat` - customer-facing web chat simulation.
- `/leads` - leads workspace.
- `/inbox` - conversation inbox.
- `/agent-lab` - AI decision testing lab.
- `/settings` - company and AI settings.
- `/bookings` - booking overview.

## Current Local Knowledge Flow

1. User edits company profile in `/settings`.
2. The profile is validated with Zod and saved in PostgreSQL.
3. `/agent-lab` and `/chat` read the profile through authenticated API routes.
4. `/api/agent/analyze` returns a full diagnostic decision for internal testing.
5. `/api/chat/message` saves the customer message, AI reply, lead, conversation, and AI run in PostgreSQL.
6. The Agent uses company services, price notes, hours, location, and handoff rules to produce a better decision.
7. `/inbox` and `/leads` read the persisted records from PostgreSQL.

## AI Provider Flow

The deterministic Agent always calculates intent, score, lead temperature, routing, and matched company knowledge first. After that, `src/lib/ai/provider.ts` asks the configured AI provider to write the customer-facing reply.

Supported providers:

- `AI_PROVIDER="groq"` with `GROQ_API_KEY`.
- `AI_PROVIDER="gemini"` with `GEMINI_API_KEY`.
- `AI_PROVIDER="mock"` for development fallback only.

The UI shows the provider used for each reply so failures do not look like real AI responses.
