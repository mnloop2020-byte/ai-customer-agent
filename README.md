# AI Customer Agent

Professional SaaS platform for an AI customer and sales agent.

The first version includes a dashboard shell, SaaS-ready Prisma schema, an AI workflow module, and a test API for analyzing incoming customer messages.

## Getting Started

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Useful Commands

```bash
npm run lint
npm run build
npm run db:generate
npm run db:migrate
npm run db:push
npm run db:studio
npm run db:up
npm run db:down
```

## Key Files

- `src/app/page.tsx` - operational dashboard.
- `src/domain/agent.ts` - AI decision workflow.
- `src/domain/company.ts` - company knowledge profile and validation.
- `src/domain/chat.ts` - web chat request and reply contracts.
- `src/lib/company-profile-store.ts` - temporary local storage adapter for company settings.
- `src/lib/ai/provider.ts` - server-side Gemini/Groq provider adapter.
- `src/app/api/agent/analyze/route.ts` - message analysis API.
- `src/app/api/chat/message/route.ts` - customer-facing chat reply API.
- `src/lib/db.ts` - Prisma client helper for PostgreSQL.
- `prisma/schema.prisma` - SaaS database model.
- `docker-compose.yml` - local PostgreSQL service.
- `docs/` - product, architecture, and roadmap notes.

## MVP Direction

This codebase is designed to grow into:

- Web chat and WhatsApp intake.
- CRM for leads and conversations.
- AI qualification, scoring, routing, and response generation.
- Persisted Web Chat conversations.
- Real Leads and Inbox backed by PostgreSQL.
- Automated follow-ups.
- Human handoff.
- Booking, payment, and reporting integrations.

See `docs/roadmap.md` for the staged build plan.
