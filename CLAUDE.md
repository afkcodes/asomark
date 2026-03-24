# ASOMARK — AI Agent Guide

## What is this project?

ASOMARK is an autonomous ASO (App Store Optimization) / SEO intelligence platform. It uses AI agents to handle the full lifecycle: competitor intelligence, keyword research, listing optimization, A/B experiment execution, rank tracking, and continuous improvement.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Monorepo** | Yarn 4 workspaces |
| **Language** | TypeScript (strict mode), Node 22+ |
| **Backend** | Fastify (HTTP), Drizzle ORM (PostgreSQL), BullMQ + Redis (job queues) |
| **Dashboard** | Vite 6 SPA, TanStack Router (file-based), TanStack Query, TanStack Table |
| **UI** | Radix UI primitives + Tailwind CSS v4 + ECharts + lucide-react |
| **AI** | Claude SDK (`@anthropic-ai/sdk`) + OpenAI SDK (pluggable) |
| **Scraping** | Playwright (dynamic), Cheerio (static HTML), undici (HTTP), protobufjs (Play Store) |

## Project Structure

```
asomark/
├── packages/
│   ├── shared/          # Shared TypeScript types & constants
│   │   └── src/types/   # Entity types (App, Keyword, Experiment, etc.)
│   ├── backend/         # Fastify API server + BullMQ workers
│   │   └── src/
│   │       ├── config/  # Env validation (Zod)
│   │       ├── db/      # Drizzle ORM setup + schema
│   │       ├── routes/  # Fastify route plugins
│   │       ├── agents/  # AI agent logic (Recon, Keyword, Creative, etc.)
│   │       ├── scrapers/# Data collection (Play Store, App Store, Google, etc.)
│   │       ├── workers/ # BullMQ job processors
│   │       └── lib/     # Redis, queue helpers, utilities
│   └── dashboard/       # TanStack Start web UI
│       └── src/
│           ├── routes/  # File-based routes (/, /apps, /keywords, etc.)
│           ├── components/ # React components + shadcn/ui
│           └── lib/     # Utils (cn helper, API client, etc.)
├── docker-compose.yml   # PostgreSQL 17 + Redis 7
├── PLAN.md              # Full product plan & module breakdown
└── ARCHITECTURE.md      # Mermaid diagrams for all system flows
```

## Key Commands

```bash
# Infrastructure
docker compose up -d              # Start PostgreSQL & Redis

# Development
yarn dev                          # Start all packages in parallel
yarn dev:backend                  # Backend only (Fastify on :3001)
yarn dev:dashboard                # Dashboard only (TanStack Start on :3000)

# Database
yarn db:generate                  # Generate Drizzle migrations
yarn db:migrate                   # Run migrations
yarn db:studio                    # Open Drizzle Studio

# Quality
yarn typecheck                    # TypeScript check all packages
yarn lint                         # Lint all packages
yarn build                        # Build all packages
```

## Architecture Concepts

### AI Agents (packages/backend/src/agents/)
Each agent is a self-contained module handling one domain:
- **Recon Agent** — Competitor discovery & analysis
- **Keyword Agent** — Keyword research, mining, scoring
- **Creative Agent** — Listing copy & visual analysis
- **Experiment Agent** — A/B test management via store APIs
- **Tracker Agent** — Daily rank tracking & competitor spy
- **Review Agent** — Sentiment analysis & pain point mining
- **SEO Agent** — Web search optimization
- **Localization Agent** — Multi-language keyword exploitation
- **Correlation Engine** — Change → impact analysis
- **Health Scorer** — ASO health score (0-100)
- **Risk Agent** — Anti-ban & compliance checking
- **Cannibalization Detector** — Keyword overlap detection

### Authority Levels (Decision Engine)
- **L0 (Auto)**: Execute silently (tracking, scraping)
- **L1 (Notify)**: Execute & inform user (reports, alerts)
- **L2 (Suggest)**: Wait for approval (title changes, new experiments)
- **L3 (Confirm)**: Require explicit OK (apply experiment results, change live listing)

### BullMQ Workers (packages/backend/src/workers/)
- **Tracking Worker**: Every 6h — scrape rankings, check competitors, update trends
- **Scraping Worker**: On-demand — data collection jobs
- **Analysis Worker**: Daily — keyword opportunity scan, review mining, health scores
- **Experiment Worker**: Daily — check experiment status, analyze results

### Data Sources (packages/backend/src/scrapers/)
- Google Play Protobuf API (`/fdfe/` endpoints)
- iTunes Search API + App Store web scraping
- Google/YouTube Autocomplete APIs
- Google Trends
- Reddit scraping
- Apple Search Ads API
- Google Play Developer API & App Store Connect API

## Database Schema

All tables are defined in `packages/backend/src/db/schema/`. Key entities:
- `apps` — Tracked apps (ours + competitors)
- `keywords` — Keyword universe with volume/difficulty estimates
- `rank_snapshots` — Daily keyword rankings per app
- `listing_snapshots` — Point-in-time listing captures
- `experiments` — A/B test lifecycle tracking
- `reviews` — User reviews with sentiment scores
- `keyword_opportunities` — Scored opportunities
- `health_scores` — ASO health over time
- `change_log` — Every listing change timestamped
- `rank_correlations` — Change → rank impact analysis
- `strategy_log` — AI recommendations with authority levels
- `scrape_jobs` — Scraping job tracking

## Conventions

- **Imports**: Use ES module imports (`import/export`), not CommonJS
- **IDs**: UUIDs everywhere (generated by PostgreSQL `gen_random_uuid()`)
- **Naming**: camelCase in TypeScript, snake_case in database columns
- **Env vars**: Validated at startup via Zod schema in `packages/backend/src/config/env.ts`
- **Error handling**: Use Fastify's built-in error handling; throw `Fastify.httpErrors` for HTTP errors
- **Logging**: Use Fastify's built-in Pino logger (`request.log` or `server.log`)
- **API responses**: Return plain JSON objects; Fastify serializes automatically
- **Routes**: Each domain gets its own Fastify plugin file in `routes/`
- **Dashboard routes**: File-based routing via TanStack Router
- **Components**: Use shadcn/ui primitives; add new ones with the shadcn CLI pattern
- **Styling**: Tailwind CSS v4 utility classes; use `cn()` helper from `src/lib/utils.ts` for conditional classes
- **Imports**: Dashboard uses `#/*` path alias (e.g., `import { cn } from '#/lib/utils'`)
- **Vite config**: `vite.config.ts` with `tanstackStart()` plugin (NOT the old `app.config.ts` / vinxi approach)

## When Adding New Features

1. If it involves a new DB entity: add Drizzle schema in `packages/backend/src/db/schema/`, add types in `packages/shared/src/types/`, run `yarn db:generate` then `yarn db:migrate`
2. If it's a new API endpoint: create a route plugin in `packages/backend/src/routes/`
3. If it's a new agent: create module in `packages/backend/src/agents/`
4. If it's a new background job: add worker in `packages/backend/src/workers/`, define queue in `packages/backend/src/lib/queue.ts`
5. If it's a new dashboard page: add route file in `packages/dashboard/src/routes/`
6. If it's a new UI component: add in `packages/dashboard/src/components/`

## Reference Documents

- `PLAN.md` — Full product plan with all 18 modules, scraping strategies, scoring algorithms, and data source details
- `ARCHITECTURE.md` — Mermaid diagrams: system architecture, data flow, agent interactions, scheduling, keyword pipeline, experiment lifecycle, ER diagram, scraper architecture, dashboard page map, deployment
