# Roadmap

## Phase 1 - Foundation

- Project scaffold.
- Professional dashboard shell.
- Multi-tenant database schema.
- AI workflow module.
- Message analysis API.
- Shared SaaS app shell.
- Leads workspace with local create/filter/status update.
- Conversation inbox UI with AI summary.
- Agent testing lab connected to `/api/agent/analyze`.
- Web chat page connected to `/api/chat/message`.
- AI settings, services, routing rules, and bookings screens.
- Docker Compose definition for local PostgreSQL.
- Authenticated Web Chat persistence into Leads, Conversations, Messages, and AiRun.
- Inbox and Leads read real PostgreSQL data.

## Phase 2 - Real CRM MVP

- Authentication.
- Company onboarding.
- CRUD for services and leads.
- Real conversation inbox.
- Persist AI decisions in `AiRun`.
- Connect pages to PostgreSQL through Prisma.
- Add seed data for local development.
- Add manual human replies from Inbox.
- Add conversation detail routing and assignment.

## Phase 3 - Channels

- Web chat widget.
- WhatsApp Cloud API webhook.
- Email intake.
- Notification system for sales agents.

## Phase 4 - Automation

- Follow-up scheduler.
- Handoff queue.
- Calendar booking.
- Deal pipeline and lost-deal tracking.

## Phase 5 - Production SaaS

- Billing and subscriptions.
- Audit logs and admin controls.
- Monitoring and error tracking.
- Backups.
- Security hardening.
