# Copilot Instructions — ASOMARK

## Project Overview

ASOMARK is an autonomous ASO/SEO intelligence platform built as a TypeScript monorepo with Yarn 4 workspaces. It uses AI agents to automate app store optimization across the full lifecycle.

## Repository Structure

- `packages/shared/` — Shared TypeScript types and constants
- `packages/backend/` — Fastify API server + Drizzle ORM + BullMQ workers
- `packages/dashboard/` — TanStack Start (React) web UI with shadcn/ui + Tailwind CSS

## Tech Stack

- **Runtime**: Node.js 22+, TypeScript (strict mode)
- **Backend**: Fastify, Drizzle ORM (PostgreSQL), BullMQ + ioredis
- **Frontend**: TanStack Start, TanStack Router (file-based), TanStack Query, TanStack Table, Recharts
- **UI**: shadcn/ui components, Tailwind CSS v4, lucide-react icons
- **AI**: @anthropic-ai/sdk (Claude), openai (pluggable)
- **Scraping**: Playwright, Cheerio, undici, protobufjs

## Code Style & Conventions

### General
- ES modules (`import`/`export`), never CommonJS (`require`)
- Strict TypeScript — no `any`, use proper generics and type narrowing
- UUIDs for all entity IDs (PostgreSQL `gen_random_uuid()`)
- camelCase in TypeScript code, snake_case for database column names
- Prefer `const` over `let`, never use `var`
- Use Zod for runtime validation at API boundaries

### Backend (packages/backend/)
- Routes are Fastify plugins registered in `src/routes/`
- Use Fastify's built-in Pino logger (`request.log`, `server.log`)
- Use `fastify.httpErrors` for HTTP error responses
- Database queries use Drizzle ORM query builder — no raw SQL
- Background jobs use BullMQ queues defined in `src/lib/queue.ts`
- Each AI agent is a self-contained module in `src/agents/`
- Each data source scraper is in `src/scrapers/`
- Env vars validated at startup via Zod in `src/config/env.ts`

### Dashboard (packages/dashboard/)
- File-based routing with TanStack Router (`src/routes/`)
- Use `createFileRoute` for route definitions
- Server state via TanStack Query (useQuery/useMutation)
- Use `cn()` helper from `#/lib/utils` for conditional Tailwind classes
- Use `#/*` path alias for dashboard imports (e.g., `import { cn } from '#/lib/utils'`)
- Vite config uses `tanstackStart()` plugin from `@tanstack/react-start/plugin/vite`
- Components use shadcn/ui patterns (CVA variants, Radix primitives)
- Icons from lucide-react
- Charts with Recharts
- Data tables with TanStack Table

### Database Schema (packages/backend/src/db/schema/)
- All tables defined with Drizzle ORM's `pgTable`
- Foreign keys use `.references()` with proper cascade rules
- JSON columns use `json` type for flexible data
- Timestamps use `timestamp('col', { withTimezone: true })`
- Each domain has its own schema file (apps.ts, keywords.ts, etc.)

## Key Patterns

### Adding a New API Endpoint
```typescript
// packages/backend/src/routes/my-route.ts
import type { FastifyPluginAsync } from 'fastify';

const myRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/my-endpoint', async (request, reply) => {
    // use fastify.log, db queries, etc.
    return { data: [] };
  });
};

export default myRoute;
```

### Adding a New Dashboard Page
```typescript
// packages/dashboard/src/routes/my-page.tsx
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/my-page')({
  component: MyPage,
});

function MyPage() {
  return <div>My Page</div>;
}
```

### Adding a New Database Table
```typescript
// packages/backend/src/db/schema/my-table.ts
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const myTable = pgTable('my_table', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

## AI Agent Architecture

The system has 12 AI agents orchestrated by a central "Brain":
- **Recon Agent**: Competitor discovery & analysis
- **Keyword Agent**: Research, mining, scoring (15+ data sources)
- **Creative Agent**: Listing copy & visual optimization
- **Experiment Agent**: A/B test management via Google Play / App Store Connect APIs
- **Tracker Agent**: Rank tracking & competitor spy (every 6h)
- **Review Agent**: Sentiment analysis & pain point mining
- **SEO Agent**: Web search optimization
- **Localization Agent**: Multi-language keyword exploitation
- **Correlation Engine**: Change → impact analysis
- **Health Scorer**: ASO health score (0-100)
- **Risk Agent**: Anti-ban & compliance
- **Cannibalization Detector**: Keyword overlap detection

### Authority Levels for Autonomous Actions
- **L0**: Auto-execute silently (tracking, scraping)
- **L1**: Execute & notify (reports, alerts)
- **L2**: Suggest & wait for approval (title changes, experiments)
- **L3**: Require explicit confirmation (apply changes to live listing)

## Reference Files

- `PLAN.md` — Complete product plan with all modules, algorithms, and data sources
- `ARCHITECTURE.md` — System diagrams (Mermaid): architecture, data flow, agents, scheduling, ER diagram
- `CLAUDE.md` — Detailed project context for AI coding agents

## Do NOT

- Use CommonJS requires
- Use `any` type — find the proper type or create one in shared/
- Write raw SQL — use Drizzle ORM query builder
- Put business logic in route handlers — delegate to agents/services
- Hardcode configuration — use env vars via config/env.ts
- Skip Zod validation on API inputs
- Use inline styles in the dashboard — use Tailwind classes
