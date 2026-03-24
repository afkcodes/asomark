# ASOMARK — Personal Use Implementation Plan

## Context

ASOMARK backend is ~80% complete (9 agents, 14 scrapers, 4 workers, 15 routes, 12 DB schemas) but has no dashboard and a basic 2-signal keyword difficulty algorithm. This plan focuses on making it a usable personal ASO tool for 6 months of testing, with a proper difficulty algorithm and enough UI to work with daily — while keeping the architecture clean for potential product conversion later.

**What we're NOT building (yet):** auth, teams, PDF reports, review reply management, email notifications.

**Building last (Phase 5):** Store API experiment execution, SEO agent — once all core features are solid.

---

## Phase 1: Enhanced Keyword Difficulty Algorithm

### The Problem
Current difficulty uses only 2 signals:
- Title optimization rate (70%) — % of top 10 with keyword in title
- Average rating factor (30%) — normalized from 3-5 scale

This misses install authority, review volume, market saturation, and competitive landscape — all available from the data we already scrape.

### The Algorithm: 7 Signals, All Data-Driven

| Signal | Weight | What It Measures | Data Source |
|--------|--------|------------------|-------------|
| **Title Optimization** | 0.25 | % of top 10 with keyword in title | `ParsedSearchResult.title` |
| **Install Authority** | 0.20 | Avg installs of top 10 (log scale) | `ParsedSearchResult.installs` |
| **Rating Quality** | 0.15 | Avg rating (40%) + review count (60%) | `ParsedSearchResult.score` + `ParsedAppDetails.ratings` |
| **Result Saturation** | 0.10 | Total results returned / 250 | `searchResults.length` |
| **Top App Dominance** | 0.10 | Install gap between #1 and #10 (log) | `ParsedSearchResult.installs` |
| **Description Optimization** | 0.10 | % of top 10 with keyword in short desc | `ParsedAppDetails.shortDescription` |
| **Developer Diversity** | 0.10 | Unique developers in top 10 / 10 | `ParsedSearchResult.developer` |

**Install parsing:** `"1,000,000+"` → `1000000`, then `log10(avg) / log10(1B) * 100`

**Two modes:**
- **Fast** (5 signals, no detail fetches) — for bulk discovery. Skips description optimization, estimates rating quality from `score` only without review count
- **Full** (all 7 signals) — fetches `getBulkDetails()` for top 10. Used for tracked keywords and weekly re-scoring

### Files to create/modify

| File | Action |
|------|--------|
| `packages/backend/src/lib/keyword-difficulty.ts` | **NEW** — `KeywordDifficultyScorer` class with `scoreFast()` and `scoreFull()` |
| `packages/backend/src/lib/keyword-scorer.ts` | **MODIFY** — delegate `difficultyFromSearchResults()` to new scorer |
| `packages/backend/src/agents/keyword.ts` | **MODIFY** — use `scoreFast()` for bulk, `scoreFull()` for top 15 |
| `packages/backend/src/db/schema/keywords.ts` | **MODIFY** — add `difficultySignals` (json) and `difficultyMode` (text) columns |
| `packages/backend/src/routes/keywords.ts` | **MODIFY** — return `difficultySignals` in responses |

---

## Phase 1B: Historical Keyword Intelligence Database

### The Problem
We scrape rich data (Google Trends timelines, related queries, suggest positions, top-10 composition) but **store only the latest value** in the `keywords` table. No history = no ability to build our own volume/difficulty models over time. AppTweak's moat IS their historical data — we need to start accumulating ours from day one.

### What We Currently Fetch But Discard
- Google Trends full `timelineData[]` (90 days of weekly points) — compressed to 1 number
- Google Trends `relatedQueries` (rising + top) — completely discarded
- Autocomplete suggest positions (Google, Play Store, YouTube) — never stored
- Top 10 search result composition per keyword — computed then thrown away
- Play Store result count — available but not extracted

### New Tables

**1. `keyword_snapshots`** — daily/weekly point-in-time capture of all keyword metrics
```
id, keywordId, platform, region, snapshotDate,
trendsInterestScore (0-100), trendDirection,
trendsTimelineJson (jsonb — full TrendPoint[]),
topTenTitleOptRate, topTenAvgRating, topTenAvgInstalls,
topTenAppIds (jsonb — ordered array of package names in top 10),
resultCount (total Play Store results for keyword),
difficultyScore (frozen computation from that day),
difficultySignals (jsonb — all 7 signal values),
googleSuggestPosition, playstoreSuggestPosition, youtubeSuggestPosition,
searchVolumeProxy (weighted combination),
createdAt
```

**2. `keyword_related_queries`** — related query snapshots from Google Trends
```
id, keywordSnapshotId (FK), relatedQuery, category ('rising'|'top'),
value (% for rising, score for top), position (1-5), snapshotDate
```
Purpose: Track intent shifts over time. "photo editor" related queries shift from "filters" → "AI photo editor" — early signal for keyword opportunities.

**3. `keyword_suggest_history`** — autocomplete position tracking
```
id, parentKeyword, suggestedKeyword,
source ('google'|'playstore'|'youtube'),
position (1-based), region, snapshotDate
```
Purpose: When a keyword first appears in autocomplete = emerging keyword. Position rising = volume increasing. This becomes our own "search volume proxy" signal.

### Volume Estimation Algorithm (Data-Driven, Improves Over Time)

Since we can't get real search volume (only Apple Search Ads gives that, and only for iOS), we build our own **composite volume proxy** that gets more accurate as we accumulate data:

```
volumeScore = weighted_sum(
  googleTrendsInterest      * 0.25   // 0-100 from Trends API
  suggestPresenceScore      * 0.25   // across Google + Play + YouTube
  suggestPositionScore      * 0.20   // higher position = more volume
  relatedQueryDensity       * 0.10   // more related queries = broader search interest
  topTenInstallVolume       * 0.10   // high installs in top 10 = high-volume keyword
  suggestEmergenceVelocity  * 0.10   // how fast keyword climbed in autocomplete
)
```

**Signal details:**
- `suggestPresenceScore`: present in 3/3 sources = 100, 2/3 = 67, 1/3 = 33, 0/3 = 0
- `suggestPositionScore`: avg position across sources, `max(0, 100 - (avgPos * 8))`
- `relatedQueryDensity`: count of related queries in Trends / max expected (25) * 100
- `topTenInstallVolume`: `min(100, log10(avgInstalls) / 9 * 100)` — same log scale as difficulty
- `suggestEmergenceVelocity`: compare current suggest position vs 30 days ago — requires historical data (0 for first 30 days)

**Key insight:** `suggestEmergenceVelocity` is **only possible with our historical database**. After 30+ days of data, we can detect keywords rising in autocomplete BEFORE they show volume in Trends. This is our competitive advantage.

### App-Specific Difficulty

Generic difficulty (how hard is keyword X?) is useful, but **app-specific difficulty** (how hard is keyword X for MY app?) is what actually matters. Two apps competing for "photo editor" face very different difficulty:

```
appSpecificDifficulty = genericDifficulty * appRelevancePenalty * appAuthorityBonus

where:
  appRelevancePenalty = 1.0 + (1.0 - relevanceScore/100) * 0.5
    // irrelevant app faces 50% higher difficulty

  appAuthorityBonus = max(0.5, 1.0 - (log10(ourInstalls) / log10(topInstalls)) * 0.3)
    // our install count vs top result — more installs = easier to rank
    // capped at 0.5 (50% reduction) — you still need optimization
```

This means a photo editing app with 1M installs targeting "photo editor" (difficulty 75) might see app-specific difficulty of ~55, while a music app with 1K installs targeting the same keyword sees ~95.

### Play Store Autocomplete — New Dedicated Scraper

Currently `PlayStoreSearchScraper.suggest()` hits Google's generic suggest API (`suggestqueries.google.com`) without the `ds=ah` param — it returns Google web suggestions, not Play Store-specific ones.

**Add:** A dedicated Play Store autocomplete source that hits the actual store endpoint. This gives us 4 distinct suggest sources:
1. **Google web suggest** (existing `GoogleSuggestScraper`) — web search intent
2. **Play Store suggest** (**NEW** — actual store autocomplete) — app search intent
3. **YouTube suggest** (existing `YouTubeSuggestScraper`) — video/content intent
4. **Google-as-Play proxy** (existing `PlayStoreSearchScraper.suggest()`) — keep as-is for backward compat

**New file:** `packages/backend/src/scrapers/playstore/suggest.ts`
- Hits `https://market.android.com/suggest/SuggRequest?json=1&c=3&query={term}&hl={lang}&gl={country}`
- Returns Play Store-specific autocomplete suggestions
- Also supports alphabet soup expansion
- Cached 30 min, rate limited like other Play Store scrapers

**Impact on scoring:** `suggestPresenceScore` now checks 4 sources (Google + Play Store + YouTube + Google-as-Play-proxy), and `suggest_history` tracks positions from all 4.

### Integration with Existing Code

| File | Change |
|------|--------|
| `packages/backend/src/scrapers/playstore/suggest.ts` | **NEW** — dedicated Play Store autocomplete scraper |
| `packages/backend/src/db/schema/keyword-intelligence.ts` | **NEW** — all 3 new table schemas |
| `packages/backend/src/lib/keyword-scorer.ts` | **MODIFY** — new `volumeFromHistoricalData()` method, app-specific difficulty |
| `packages/backend/src/lib/keyword-difficulty.ts` | **MODIFY** — add `scoreForApp()` method for app-specific difficulty |
| `packages/backend/src/agents/keyword.ts` | **MODIFY** — save snapshots after scoring, store suggest positions |
| `packages/backend/src/workers/tracking.ts` | **MODIFY** — capture keyword snapshots during rank checks |
| `packages/backend/src/scrapers/google-trends.ts` | **MODIFY** — return related queries (already fetched, just not passed through) |
| `packages/backend/src/routes/keywords.ts` | **MODIFY** — add endpoints for historical keyword data |

### New Routes

| Route | Purpose |
|-------|---------|
| `GET /api/keywords/:id/history?from=&to=` | Historical snapshots for a keyword |
| `GET /api/keywords/:id/suggest-history` | Autocomplete position history |
| `GET /api/keywords/:id/related-queries` | Related query evolution |
| `GET /api/keywords/trending` | Keywords with fastest-rising suggest positions |

---

## Phase 1C: Category Rank Tracking + Cannibalization Detector

### Category Rank Tracker
Track position in Top Free / Top Grossing per category per country over time.

**New scraper:** `packages/backend/src/scrapers/playstore/charts.ts`
- Scrapes `https://play.google.com/store/apps/category/{CATEGORY}/collection/topselling_free?hl={lang}&gl={country}`
- Parses ranked list of apps, returns position + app metadata
- Cached 6 hours (charts don't change frequently)
- Supports: `topselling_free`, `topselling_paid`, `topgrossing`, `topselling_new_free`

**Worker integration:** Add `category_rank` job to tracking worker (runs every 6h alongside keyword rank checks). Populates the existing `categoryRank` field in `rank_snapshots`.

**New route:** `GET /api/apps/:id/category-ranks?from=&to=` — category rank history for charts.

| File | Change |
|------|--------|
| `packages/backend/src/scrapers/playstore/charts.ts` | **NEW** — top charts scraper |
| `packages/backend/src/workers/tracking.ts` | **MODIFY** — add category_rank job |
| `packages/backend/src/routes/rankings.ts` | **MODIFY** — add category rank history endpoint |

### Cannibalization Detector
Detects wasted keyword space across title / short description / description.

**What it checks:**
1. **Title ↔ Short Description overlap** — keywords appearing in both waste character space (Google indexes title and short desc separately, repeating a word doesn't help)
2. **High-value keywords buried in description** — keywords with high volume/low difficulty that should be in title or short desc instead
3. **Character space efficiency** — how much of title (50 chars) and short desc (80 chars) character limits are actually used
4. **Cross-app cannibalization** (if multiple apps) — two of your apps targeting the same keyword split your own search presence

**New agent:** `packages/backend/src/agents/cannibalization.ts`
- Inherits from `BaseAgent`
- Pure data analysis (minimal LLM usage — just for the final report summary)
- Outputs: overlap matrix, wasted characters count, reallocation suggestions

| File | Change |
|------|--------|
| `packages/backend/src/agents/cannibalization.ts` | **NEW** — cannibalization detector agent |
| `packages/backend/src/agents/brain.ts` | **MODIFY** — register cannibalization agent |
| `packages/backend/src/routes/agents.ts` | **MODIFY** — add to runnable agents |

---

## Phase 2: Premium Dashboard

### Design Philosophy
- **NOT generic sidebar AI slop** — clean, modern, distinctive design that stands out
- Dense but readable data presentation — every pixel earns its place
- Beautiful charts via **ECharts** (not Recharts) — smooth animations, rich interactivity, polished look
- Minimal chrome, maximum signal — let the data and graphs speak
- Consistent visual language: color-coded difficulty, trend indicators, rank movement badges

### Tech Stack
- **TanStack Start** (React 19 + Vite 8 + Nitro) — scaffolded via `npx @tanstack/cli@latest create` or from `start-basic` example
- **TanStack Router** (file-based routing) + **TanStack Query** (server state) + **TanStack Table** (data tables)
- **shadcn/ui** + **Tailwind CSS v4** (`@tailwindcss/vite` plugin) — component primitives + utility styling
- **ECharts** (`echarts` + `echarts-for-react`) — premium charts with smooth animations, tooltips, zoom, data brushing
- **lucide-react** — icons
- Path alias: `~/*` → `./src/*` (TanStack Start default convention)

### Scaffolding (from TanStack Start basic example)
```json
// key deps from start-basic template
"dependencies": {
  "@tanstack/react-router", "@tanstack/react-start",
  "@tanstack/react-query", "@tanstack/react-table",
  "react": "^19", "react-dom": "^19",
  "echarts", "echarts-for-react",
  "tailwind-merge", "clsx", "zod", "lucide-react"
},
"devDependencies": {
  "@tailwindcss/vite": "^4", "tailwindcss": "^4",
  "@vitejs/plugin-react", "nitro", "typescript", "vite": "^8"
}
```

### vite.config.ts pattern
```typescript
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 3000 },
  plugins: [tailwindcss(), tanstackStart({ target: 'src' }), react()],
})
```

### Pages — All Backend Features Surfaced

**Projects List (`/projects`)** — the home view
- Clean card grid: app icon + name, keyword count, competitor count, region badge, health score ring
- Quick stats row at top: total keywords tracked, avg difficulty, rank improvements this week
- "New Project" button → dialog (package name + project name + region)

**Project Detail (`/projects/$projectId`)** — tabbed, the main workspace
1. **Overview Tab** — at-a-glance dashboard for this project:
   - Health score gauge (ECharts gauge chart, 0-100)
   - Rank movement summary (keywords up/down/unchanged)
   - Recent competitor changes feed
   - Top opportunities list (highest-scoring keywords not yet tracked)

2. **Keywords Tab** — the power view:
   - TanStack Table: keyword, my rank (with delta badge ↑↓), difficulty (color bar with 7-signal breakdown tooltip), volume proxy, trend indicator, source tag, tracking toggle
   - Difficulty breakdown: mini horizontal stacked bar showing all 7 signal contributions on hover
   - Sortable by any column, filterable by source/difficulty range/trend
   - Bulk actions: "Discover Keywords", "Check All Ranks", "Score Full Difficulty"
   - Inline search/filter

3. **Rankings Tab** — the trend view:
   - ECharts line chart, Y-axis inverted (rank 1 at top), smooth curves, area fill
   - Multi-keyword selection via checkbox list (show/hide lines)
   - Time range selector (7d / 30d / 90d / custom)
   - Change events from `change_log` as vertical marker lines with tooltips
   - Zoom/pan via ECharts dataZoom
   - Competitor rank overlay toggle (see our rank vs competitor ranks on same chart)

4. **Competitors Tab** — the spy view:
   - Competitor cards: icon, name, rating, installs, last change date
   - Expand to see inline diff of listing changes (title highlighted, description diff)
   - Keyword overlap matrix: which keywords we share with which competitors
   - "Add Competitor" button (search by package name)

5. **Strategy Tab** — the action queue:
   - Pending AI recommendations (L2/L3) with reasoning, suggested change, authority badge
   - Approve / Reject buttons with one-click action
   - History of past decisions (approved/rejected/executed)

6. **Reviews Tab** — sentiment intelligence:
   - Sentiment trend chart (ECharts area chart)
   - Topic clusters with pain point tags
   - Recent reviews feed with sentiment color-coding

**Daily Briefing (`/` — the home page)**
- Your morning dashboard — what happened overnight
- Rank movement summary: keywords up / down / unchanged across all projects (ECharts bar chart)
- Alert feed: significant rank drops (>5 positions), competitor listing changes, new keywords appearing in autocomplete
- Category rank movement: position change in Top Free/Grossing
- Cannibalization warnings: any detected keyword waste
- Quick actions: pending L2/L3 strategy approvals
- Health score trend sparkline per project

**Global Strategy Queue (`/strategy`)**
- Cross-project view of all pending L2/L3 actions

**Global Rankings (`/rankings`)**
- Aggregate rank performance across all projects

### New Backend Routes Needed

| Route | Purpose |
|-------|---------|
| `GET /api/projects/:id/rank-history?from=&to=` | Rank snapshots for tracked keywords, grouped by keyword |
| `GET /api/projects/:id/competitors/changes` | Recent listing changes for all project competitors |
| `GET /api/projects/:id/overview` | Aggregated stats for project overview tab |
| `GET /api/projects/:id/keyword-overlap` | Keyword overlap matrix between our app and competitors |

### Dashboard file structure
```
packages/dashboard/
  package.json, tsconfig.json, vite.config.ts
  src/
    app.css                          # Tailwind v4 + custom design tokens
    router.tsx                       # createRouter with routeTree
    routes/
      __root.tsx                     # Root layout (navigation shell)
      index.tsx                      # Redirect to /projects
      projects/
        index.tsx                    # Project list
        $projectId.tsx               # Project detail (tabbed)
      strategy/
        index.tsx                    # Global strategy queue
      rankings/
        index.tsx                    # Global rankings view
    components/
      ui/                            # shadcn primitives (button, card, table, badge, dialog, tabs, input, tooltip, dropdown-menu)
      layout/
        app-shell.tsx                # Main layout with navigation
        nav.tsx                      # Navigation component (not a generic sidebar — clean top nav or compact rail)
      charts/
        rank-chart.tsx               # ECharts rank history (inverted Y, markers)
        health-gauge.tsx             # ECharts gauge for health score
        sentiment-chart.tsx          # ECharts area chart for review sentiment
        difficulty-bar.tsx           # Mini stacked bar for difficulty signals
      keywords/
        keyword-table.tsx            # TanStack Table wrapper
        difficulty-tooltip.tsx       # 7-signal breakdown tooltip
        rank-delta-badge.tsx         # ↑5 / ↓3 / — badge
        trend-indicator.tsx          # Rising/falling/stable arrow
      competitors/
        competitor-card.tsx          # Competitor summary card
        listing-diff.tsx             # Inline diff viewer
        keyword-overlap.tsx          # Overlap matrix
      projects/
        project-card.tsx             # Project summary card
        create-project-dialog.tsx    # New project form
      strategy/
        action-card.tsx              # Strategy recommendation card
        approval-buttons.tsx         # Approve/reject controls
    lib/
      utils.ts                       # cn() helper
      api.ts                         # Fetch wrapper to localhost:3001
      echarts.ts                     # ECharts theme + shared config
```

---

## Phase 3: Automated Pipelines

### Project Auto-Setup
When a project is created:
1. Scrape app details if app doesn't exist in DB
2. Auto-discover competitors via `getSimilarApps()` (add top 5)
3. Run keyword discovery from all competitors
4. Initial rank check for all discovered keywords
5. Send Telegram/Discord notification when complete

**Implementation:** New `packages/backend/src/workers/setup.ts` with a `project_setup` job enqueued on project creation.

### Worker Improvements
- Make tracking worker project-aware — only track `isTracking = true` keywords from `discovered_keywords`
- Add "difficulty re-score" weekly job — runs `scoreFull()` for all tracked keywords
- Add "rank re-check" every 12h for tracked keywords (lighter than full tracking)

### Notifications
- `sendProjectSetupComplete()` — project stats summary
- `sendKeywordAlert()` — keywords entering/leaving top 10
- Use existing Telegram/Discord infrastructure in `lib/notifications.ts`

---

## Phase 4: Future-Proofing (Do Now, Pay Off Later)

### Database Indexes (add now, prevents slow queries as data grows)
- `rank_snapshots(app_id, keyword_id, date)` composite
- `discovered_keywords(project_id, keyword)` (already has unique)
- `strategy_log(app_id, status, created_at)` composite
- `change_log(app_id, timestamp)` composite

### API Response Standardization
- Wrap list endpoints in `{ data: T[], meta: { total } }` format
- Prevents breaking changes when adding pagination later

### Data Retention Strategy
Historical tables (`keyword_snapshots`, `keyword_suggest_history`, `rank_snapshots`) grow fast. Retention policy:
- **0-30 days:** keep daily snapshots (full granularity)
- **30-90 days:** roll up to weekly (keep best/worst/avg per week, delete daily rows)
- **90+ days:** roll up to monthly (keep monthly aggregates)
- Implemented as a scheduled BullMQ job (`data_retention`) running weekly
- New file: `packages/backend/src/workers/retention.ts`

### Event Bus
- New `packages/backend/src/lib/events.ts` — simple EventEmitter
- Agents/workers emit events (`keyword.scored`, `rank.changed`, `competitor.changed`)
- Notifications subscribe to events instead of being called directly
- Makes adding new consumers (webhooks, SSE to dashboard) trivial later

---

## Phase 5: Store API Experiments & SEO Agent (After Core Is Solid)

### Store API Experiment Execution
- **Google Play Developer API** — create/monitor/apply store listing experiments via `androidpublisher v3`
- **App Store Connect API** — create/monitor product page optimization tests
- Wire into ExperimentAgent so it can actually push experiments, not just plan them
- Dashboard: experiment management page (create, monitor progress, view results, apply winner)
- Requires real API credentials and a live app to test with

### SEO Agent
- Implement the missing `packages/backend/src/agents/seo.ts`
- Web search rank tracking for app-related queries
- Deep link validation and suggestions
- App indexing optimization guidance
- Dashboard: SEO tab in project detail view

### Files to create/modify

| File | Action |
|------|--------|
| `packages/backend/src/agents/seo.ts` | **NEW** — SEO Agent |
| `packages/backend/src/agents/brain.ts` | **MODIFY** — register SEO agent in orchestrator |
| `packages/backend/src/routes/agents.ts` | **MODIFY** — add SEO to runnable agents |
| `packages/backend/src/lib/store-api/` | **NEW** — Google Play Developer API + App Store Connect API clients |
| `packages/backend/src/agents/experiment.ts` | **MODIFY** — wire real store API calls for create/apply |
| `packages/dashboard/src/routes/projects/$projectId.tsx` | **MODIFY** — add Experiments tab + SEO tab |

---

## Implementation Order

```
Phase 1: Difficulty Algorithm + Keyword Intelligence DB + New Scrapers/Agents
  1. keyword-difficulty.ts (7-signal scorer, fast + full modes)
  2. keyword-intelligence.ts schema (keyword_snapshots, keyword_related_queries, keyword_suggest_history)
  3. playstore/suggest.ts (dedicated Play Store autocomplete scraper)
  4. playstore/charts.ts (category top charts scraper)
  5. cannibalization.ts agent
  6. DB migration for all new columns + tables
  7. Integrate with keyword-scorer.ts (volume from historical data, app-specific difficulty)
  8. Update keyword agent to save snapshots + suggest positions
  9. Update tracking worker to capture keyword + category rank snapshots
  10. Update Google Trends scraper to pass through related queries
  11. New keyword history + category rank routes

Phase 2a: Dashboard Bootstrap + Projects
  1. Scaffold via TanStack Start (start-basic template)
  2. Install deps: ECharts, TanStack Query/Table, shadcn/ui, lucide
  3. App shell layout (clean nav, not generic sidebar)
  4. API client + TanStack Query setup
  5. Projects list page + create project dialog
  6. Project detail — overview tab + keywords tab

Phase 2b: Charts, Competitors & Strategy
  1. ECharts theme + shared config
  2. Rank history chart (inverted Y, markers, zoom)
  3. Health gauge, sentiment chart, difficulty breakdown bar
  4. Competitor cards + listing diff view + keyword overlap
  5. Strategy approval queue
  6. Reviews tab (sentiment trend + topic clusters)
  7. New backend routes for dashboard data

Phase 3: Automation
  1. Project setup worker
  2. Worker improvements
  3. Notification templates

Phase 4: Future-proofing
  1. DB indexes
  2. Response format standardization
  3. Event bus skeleton

Phase 5: Store APIs & SEO (after core is tested)
  1. Google Play Developer API client
  2. App Store Connect API client
  3. Wire ExperimentAgent to real APIs
  4. SEO Agent implementation
  5. Dashboard experiment + SEO views
```

---

## Verification

1. **Difficulty algorithm**: Create a project, discover keywords, compare difficulty scores against manual assessment. Check that high-competition keywords (e.g., "weather app") score 70+ and niche keywords score <30
2. **Dashboard**: `yarn dev` starts both backend (3001) and dashboard (3000). Navigate to /projects, create project, see keywords populate, check rank chart renders
3. **Automation**: Create new project → watch setup worker auto-discover competitors and keywords → verify Telegram notification arrives
4. **Typecheck**: `yarn typecheck` passes across all packages
