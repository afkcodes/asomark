# ASOMARK

Autonomous AI-powered App Store Optimization platform. ASOMARK uses a multi-agent system to handle the full ASO lifecycle — competitor intelligence, keyword research, listing optimization, A/B experiments, rank tracking, and continuous strategy improvement.

Instead of guessing, ASOMARK grounds every decision in real data: actual Play Store search results, Google Trends interest scores, competitor keyword density, and paginated review sentiment analysis.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Dashboard (:3000)                        │
│         TanStack Start · shadcn/ui · Recharts · Tailwind        │
└──────────────────────────────┬──────────────────────────────────┘
                               │ REST API
┌──────────────────────────────▼──────────────────────────────────┐
│                     Fastify Backend (:3001)                      │
│                                                                  │
│  ┌──────────────── Brain (Orchestrator) ──────────────────┐     │
│  │                                                         │     │
│  │  Recon ──→ Keyword ──→ Creative ──→ Correlation        │     │
│  │  Review ──→ Health ──→ Risk                            │     │
│  │                                                         │     │
│  │  Authority Levels: L0 auto · L1 notify · L2 suggest    │     │
│  │                    L3 confirm before live changes       │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                  │
│  ┌─── Scrapers ───┐  ┌─── Lib ──────────────┐  ┌── Workers ──┐ │
│  │ Play Store     │  │ ContentAnalyzer       │  │ Tracking    │ │
│  │ App Store      │  │ KeywordScorer         │  │ Scraping    │ │
│  │ Google Trends  │  │ KeywordDiscoverer     │  │ Analysis    │ │
│  │ Google Suggest │  │ ChangeDetector        │  │ Experiments │ │
│  │ YouTube        │  │ LLM (Claude/OpenAI)   │  │             │ │
│  │ Reddit         │  │ Countries (36 regions)│  │             │ │
│  └────────────────┘  └───────────────────────┘  └─────────────┘ │
└────────────┬───────────────────────────────┬────────────────────┘
             │                               │
     ┌───────▼───────┐              ┌───────▼───────┐
     │ PostgreSQL 17 │              │   Redis 7     │
     │  16 tables    │              │ Cache + Queue │
     └───────────────┘              └───────────────┘
```

## AI Agents

ASOMARK runs 7 specialized agents coordinated by a central Brain orchestrator:

### Recon Agent
Discovers competitors by scraping the Play Store for similar apps in the same category. Extracts common keywords from competitor titles using N-gram analysis, identifies strategy gaps, and maps the competitive landscape. Outputs a competitor matrix with keyword overlap data.

### Keyword Agent
Data-driven keyword research that replaces LLM guesswork with real signals:
- **Search volume**: Google Trends interest score (60%) + autocomplete suggest position (40%)
- **Difficulty**: Title optimization rate from top-10 search results (how many have the keyword in their title)
- **Competitor gap**: Difference between our rank and average competitor rank
- **Trend momentum**: Rising/falling/stable from 90-day Trends data

Sources: alphabet soup mining, Google suggest, Play Store autocomplete, category mining, competitor title extraction. The LLM is only used for relevance scoring and placement recommendations.

### Review Agent
Fetches up to 150 reviews using Play Store's internal `batchexecute` pagination API (vs ~40 from HTML parsing). Tags each review by sentiment — `[CRITICAL]` (1-3 stars), `[NEUTRAL]` (4 stars), `[POSITIVE]` (5 stars) — before sending to the LLM for pain point extraction and feature request mining.

### Creative Agent
Generates 5 listing variants with different keyword strategies:
1. Maximum keyword coverage
2. Conversion-focused (benefits + social proof)
3. Competitive positioning
4. Long-tail focused
5. Brand-first

Enforces strict constraints: character limits (50 chars Android title / 30 chars iOS), banned words ("Best", "#1", "Free", "Top"), front-loaded keywords. After generation, recomputes actual keyword density with ContentAnalyzer and truncates any variants that exceed limits.

### Health Scorer
Calculates an ASO health score (0-100) across 8 dimensions:
- Title optimization (character utilization, keyword front-loading)
- Short description optimization
- Description quality (keyword density, natural flow)
- Keyword coverage (title keywords appearing in description)
- Visual assets (screenshots, video, icon)
- Ratings health
- Update recency
- Competitive position

Feeds real density/N-gram data to the LLM so it scores facts, not guesses.

### Risk Agent
Audits the listing for policy violations, keyword stuffing, misleading claims, and compliance issues. Returns a risk score (0-100) with severity-graded flags.

### Correlation Engine
Compares listing changes against rank movements over time to identify what actually moves the needle. Requires historical snapshot data.

### Brain (Orchestrator)
Coordinates all agents in optimal order with data flowing between them:
1. **Phase 1**: Recon + Review + Health + Risk (parallel)
2. **Phase 2**: Keyword research (benefits from recon data)
3. **Phase 3**: Creative (needs keyword results)
4. **Phase 4**: Correlation (independent, needs history)
5. **Phase 5**: Synthesize findings into executive summary + prioritized next steps

Supports streaming progress via SSE for real-time UI updates.

## Data Pipeline

### Scrapers
All scrapers extend a base class with rate limiting, retry logic, Redis caching, and user-agent rotation:

| Scraper | Source | Data |
|---------|--------|------|
| Play Store Details | Google Play HTML + AF_initDataCallback | Full app metadata, screenshots, ratings, histogram |
| Play Store Search | Google Play search pages | Ranked search results for keywords |
| Play Store Reviews | batchexecute API (`UsvDTd` RPC) | Paginated reviews with sort (newest/relevance/rating) |
| App Store | iTunes Search API | iOS app metadata |
| Google Trends | google-trends-api | 90-day interest over time, related queries |
| Google/YouTube Suggest | Autocomplete APIs | Keyword suggestions |
| Reddit | Reddit web scraping | Community discussions, natural keywords |

### Content Analyzer
Local text analysis (no LLM needed):
- `calculateDensity(text, keyword)` — exact density percentage
- `analyzeNgrams(text)` — unigrams, bigrams, trigrams with frequency
- `extractCommonKeywords(titles[])` — frequency across competitor titles
- `extractKeywords(text)` — stop-word filtered keyword extraction (179+ stop words including app-store-specific terms)

### Keyword Scorer
Computes data-driven scores replacing LLM estimates:
- `searchVolumeProxy()` — Trends interest + suggest position
- `difficultyFromSearchResults()` — title optimization rate of top-10 results
- `competitorGap()` — rank differential
- `trendMomentumFromDirection()` — rising=80, stable=50, falling=20

### Change Detector
Compares consecutive listing snapshots field-by-field (title, description, screenshots, ratings, version, installs). Writes detected changes to the `change_log` table for correlation analysis.

## Project Workflow

ASOMARK supports project-based organization — group an app with its competitors and discovered keywords:

```bash
# Create a project
POST /api/projects { appId, name, region }

# Add competitors
POST /api/projects/:id/competitors { competitorAppId }

# Discover keywords from all competitors
POST /api/projects/:id/discover-all
# → Extracts keywords from titles/descriptions, generates N-grams,
#   fetches autocomplete, verifies ranks in chunks of 5

# Check your ranks for discovered keywords
POST /api/projects/:id/check-my-ranks

# Toggle keyword tracking
POST /api/projects/:id/keywords/:keywordId/track
```

## Multi-Region Support

36 countries across 3 ARPU tiers:

| Tier | Countries | Description |
|------|-----------|-------------|
| **T1** | US, GB, JP, KR, DE, AU, CA, FR, NL, SE, NO, DK, CH, AT, SG, IL | Premium markets ($15+ ARPU) |
| **T2** | IN, BR, MX, ID, TR, RU, PL, AR, CO, ZA | High-volume markets |
| **T3** | TH, VN, MY, PH, EG, NG, PK, BD, KE, UA | Emerging markets |

Region flows through the entire stack: agent context, scraper parameters, keyword scoring, rank snapshots.

## Authority Levels

Every agent action is tagged with an authority level controlling automation:

| Level | Behavior | Example |
|-------|----------|---------|
| **L0 Auto** | Execute silently | Rank tracking, data scraping |
| **L1 Notify** | Execute and inform | Health reports, alerts |
| **L2 Suggest** | Wait for approval | Title changes, new experiments |
| **L3 Confirm** | Require explicit OK | Apply experiment results, modify live listing |

## Database

16 PostgreSQL tables managed via Drizzle ORM:

| Table | Purpose |
|-------|---------|
| `apps` | Tracked apps (ours + competitors) |
| `keywords` | Keyword universe with data-driven scores |
| `rank_snapshots` | Daily keyword rankings per app |
| `listing_snapshots` | Point-in-time listing captures |
| `experiments` | A/B test lifecycle |
| `experiment_changes` | Experiment variant changes |
| `reviews` | User reviews with sentiment |
| `keyword_opportunities` | Scored opportunities |
| `health_scores` | ASO health over time |
| `change_log` | Every listing change timestamped |
| `rank_correlations` | Change-to-rank impact analysis |
| `strategy_log` | AI actions with authority levels |
| `scrape_jobs` | Scraping job tracking |
| `projects` | Project-based workflow |
| `project_competitors` | Project-competitor associations |
| `discovered_keywords` | Keywords discovered per project |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Yarn 4 workspaces |
| Language | TypeScript (strict mode), Node 22+ |
| Backend | Fastify, Drizzle ORM, BullMQ + Redis |
| Dashboard | TanStack Start, TanStack Router, TanStack Query |
| UI | shadcn/ui, Tailwind CSS v4, Recharts, Lucide |
| AI | Claude SDK + OpenAI SDK (pluggable via OpenRouter) |
| Scraping | undici (HTTP), Cheerio (HTML), Playwright (dynamic) |
| Database | PostgreSQL 17, Redis 7 |

## Getting Started

### Prerequisites
- Node.js 22+
- Docker (for PostgreSQL + Redis)
- At least one LLM API key (Anthropic, OpenAI, or OpenRouter)

### Setup

```bash
# Clone and install
git clone <repo-url> && cd asomark
yarn install

# Start infrastructure
docker compose up -d

# Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL, REDIS_URL, and at least one API key

# Run migrations
yarn db:generate
yarn db:migrate

# Start development
yarn dev              # All packages
yarn dev:backend      # Backend only (:3001)
yarn dev:dashboard    # Dashboard only (:3000)
```

### Testing Agents

```bash
# Add an app first
curl -X POST http://localhost:3001/api/apps \
  -H 'Content-Type: application/json' \
  -d '{"packageName":"com.example.app","name":"My App","platform":"android","isOurs":true}'

# Run individual agents (replace APP_ID with the returned id)
curl -X POST http://localhost:3001/api/agents/health/run \
  -H 'Content-Type: application/json' \
  -d '{"appId":"APP_ID"}'

curl -X POST http://localhost:3001/api/agents/review/run \
  -H 'Content-Type: application/json' \
  -d '{"appId":"APP_ID"}'

curl -X POST http://localhost:3001/api/agents/recon/run \
  -H 'Content-Type: application/json' \
  -d '{"appId":"APP_ID"}'

curl -X POST http://localhost:3001/api/agents/keyword/run \
  -H 'Content-Type: application/json' \
  -d '{"appId":"APP_ID"}'

# Run full analysis (all agents in sequence)
curl -X POST http://localhost:3001/api/agents/full-analysis \
  -H 'Content-Type: application/json' \
  -d '{"appId":"APP_ID"}'
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET/POST` | `/api/apps` | App CRUD |
| `GET/POST` | `/api/keywords` | Keyword management |
| `GET` | `/api/rankings` | Rank snapshots |
| `GET/POST` | `/api/listings` | Listing snapshots |
| `GET` | `/api/reviews` | Reviews with sentiment |
| `GET/POST/PATCH` | `/api/experiments` | A/B experiments |
| `GET` | `/api/opportunities` | Keyword opportunities |
| `GET` | `/api/health` | Health score history |
| `GET` | `/api/changelog` | Change history |
| `GET/POST` | `/api/strategy` | Strategy actions |
| `POST` | `/api/agents/:agent/run` | Run single agent |
| `POST` | `/api/agents/full-analysis` | Run all agents |
| `GET/POST` | `/api/projects` | Project workflow |
| `POST` | `/api/projects/:id/discover-all` | Keyword discovery |
| `GET` | `/api/stream/full-analysis` | SSE streaming |
| `GET` | `/api/countries` | Supported regions |
| `POST` | `/api/scrape-jobs` | Queue scrape jobs |

## Project Structure

```
asomark/
├── packages/
│   ├── backend/
│   │   └── src/
│   │       ├── agents/        # 7 AI agents + Brain orchestrator
│   │       ├── scrapers/      # Play Store, App Store, Trends, Reddit
│   │       ├── routes/        # 15 Fastify route plugins
│   │       ├── db/schema/     # 16 Drizzle ORM tables
│   │       ├── lib/           # Analyzer, Scorer, Discovery, LLM
│   │       ├── workers/       # BullMQ job processors
│   │       └── config/        # Zod env validation
│   ├── dashboard/
│   │   └── src/
│   │       ├── routes/        # 8 file-based routes
│   │       ├── components/    # shadcn/ui components
│   │       └── lib/           # Utils, API client
│   └── shared/
│       └── src/types/         # Shared TypeScript interfaces
├── docker-compose.yml         # PostgreSQL 17 + Redis 7
├── .env.example               # Environment template
└── drizzle/                   # Migration files
```

## Commands

```bash
yarn dev                  # Start all packages
yarn dev:backend          # Backend only
yarn dev:dashboard        # Dashboard only
yarn typecheck            # TypeScript check all packages
yarn lint                 # Lint all packages
yarn build                # Build all packages
yarn db:generate          # Generate Drizzle migrations
yarn db:migrate           # Run migrations
yarn db:studio            # Open Drizzle Studio
```

## License

Private — All rights reserved.
