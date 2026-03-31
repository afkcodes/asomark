# ASOMARK: Plan vs Implementation — Gap Analysis

> Generated: 2026-03-31 | Baseline: PLAN.md

## Overall Status: ~75% of the plan is implemented, with strong core and notable gaps

---

## Fully Implemented (Matches or Exceeds Plan)

### Agents (12/12 planned agents built)

| Agent | Plan Module | Status | Notes |
|-------|-------------|--------|-------|
| Recon | Module 1 | **Done** | Competitor discovery, n-gram analysis, listing snapshots |
| Keyword | Module 2 | **Done** | 12-dimension scoring, 7-signal difficulty, weighted composite |
| Creative | Module 3 | **Done** | 5 strategy variants, real density verification |
| Experiment | Module 4 | **Done** | Plan/track/analyze lifecycle, 7-day minimum |
| Tracker | Module 5 | **Done** | Rank tracking, 4-level alerts, competitor spy |
| Review | Module 6 | **Done** | Sentiment, topic clustering, pain point extraction |
| SEO | Module 7 | **Done** | 3+ LLM calls, content planning, schema markup |
| Health | Module 12 | **Done** | 8-dimension breakdown, A-F grading |
| Cannibalization | Module 13 | **Done** | Title/desc overlap, cross-app detection |
| Correlation | Module 15 | **Done** | Causal inference, attribution windows, confidence scoring |
| Risk | Module 17 | **Done** | 9 policy categories, severity mapping |
| ListingCreator | Module 9 (partial) | **Done** | 977 lines, 5 strategies, 3 LLM calls — most sophisticated agent |
| Brain | Orchestrator | **Done** | 4-phase pipeline, streaming, action management |

### Backend Infrastructure

- **17 route files** with 50+ endpoints — full CRUD for all entities
- **6 workers**: setup, tracking, analysis, scraping, experiments, retention
- **11 scrapers**: Play Store (5), Google Suggest, YouTube Suggest, Google Trends, App Store, Reddit, Web
- **Database**: 20+ tables with proper indexing and relationships
- **LLM**: Multi-provider (Claude/OpenAI/OpenRouter) with token tracking
- **Notifications**: Telegram, Discord, Email alerts
- **Keyword difficulty**: Data-driven 7-signal model (not just LLM guessing)

### Dashboard

- **6 pages**: Projects, Project Detail (11 tabs), Rankings, Strategy, Settings
- **Listing Editor**: Auto-save drafts, AI generation, variant scoring, device simulator
- **Keyword Table**: TanStack Table with sorting, filtering, tracking toggle
- **Charts**: ECharts (rank trends, health gauge, sentiment)
- **Strategy**: 10 agent cards with run/approve/reject workflow

---

## Gaps & Missing Features

### High Priority Gaps

| Plan Module | What's Missing | Impact |
|-------------|---------------|--------|
| **Module 8: Localization Agent** | **Not implemented at all** — no `localization.ts` agent file exists. The plan calls for multi-language keyword exploitation, locale keyword stacking, backend keywords per locale, cultural adaptation. This is one of the most powerful ASO hacks. | **High** — locale stacking is a major competitive advantage |
| **Protobuf API** | Plan specifies using Google Play's internal protobuf API (`/fdfe/` endpoints) for structured data. **Not implemented** — scrapers use HTML scraping + data block extraction instead. | **Medium** — HTML scraping works but is more fragile and slower than protobuf |
| **Store API Integration** | No `store-apis/` directory. Plan calls for Google Play Developer API (experiments), App Store Connect API (metadata management), Apple Search Ads API. These enable **actual experiment execution**, not just planning. | **High** — without these, experiments are plan-only, not executable |
| **Proxy Manager** | Plan references `proxy-manager.ts` for IP rotation. **Not implemented** — scrapers use user-agent rotation only. | **Medium** — increases ban risk at scale |

### Medium Priority Gaps

| Plan Module | What's Missing | Impact |
|-------------|---------------|--------|
| **Module 3: Visual Analysis** | Creative Agent generates copy variants but **no screenshot/icon vision analysis**. Plan calls for: download competitor screenshots, use vision AI to analyze text overlays/color schemes, icon color analysis, contrast scoring. | **Medium** — visual optimization is a conversion lever |
| **Module 3: Mock Store Page** | Plan calls for HTML mock of how listing would appear in-store, side-by-side with competitors. **Not implemented**. Dashboard has a `device-simulator.tsx` but it's a basic preview, not a full mock page renderer. | **Low-Med** |
| **Module 10: Release Notes Optimizer** | **Not implemented** — no agent for keyword-optimized "What's New" text. Plan notes Google indexes this field. | **Low-Med** |
| **Module 11: In-App Events/LiveOps** | **Not implemented** — no agent for keyword-optimized event names/descriptions. These appear in search results. | **Low-Med** |
| **Module 14: Search Ads Intelligence** | **Not implemented** — no Apple Search Ads integration for keyword validation or competitor bid detection. | **Medium** — only reliable iOS volume signal |
| **Module 16: Seasonal Intelligence** | **Partially covered** — Google Trends scraper exists and keyword agent uses trend data, but no dedicated seasonal planning or peak pre-optimization system. | **Low** |
| **Module 18: Competitor App Intelligence** | **Partially covered** — Recon agent analyzes listings but doesn't scrape app size, permissions, data safety labels, or privacy policy differences. | **Low** |

### Dashboard Gaps

| Feature | Status |
|---------|--------|
| **Experiments page** | Plan shows dedicated `/experiments` and `/experiments/:expId` routes. **Not built** — experiment data exists in DB and agent but no dedicated experiment management UI. Experiment planning is accessible only via Strategy tab agent runner. |
| **Reports/Export** | Plan mentions report generation endpoint and export functionality. **No reports route or export feature built**. |
| **Command palette** | Plan lists `cmdk` for command palette search. **Not implemented**. |

### Autonomous Loop Gaps

| Scheduled Task | Plan | Status |
|----------------|------|--------|
| Every 6h: rank tracking | Workers exist with scheduling | **Implemented** |
| Every 24h: keyword scan, review mining, experiment check | Analysis worker handles this | **Implemented** |
| Every 7 days: full competitor audit, strategy reassessment | **No weekly scheduling found** | **Gap** |
| Daily briefing generation | sendDailyBriefing exists in notifications | **Implemented** |
| Data retention/rollup | Retention worker with daily/monthly jobs | **Implemented** |

---

## Quality Assessment

### Strengths

1. **Agent sophistication** — All 12 agents are production-quality, not stubs. System prompts are detailed (44-200+ lines each).
2. **Data-driven scoring** — Keyword difficulty uses 7 real signals, not just LLM opinion. Health scorer computes real metrics before asking LLM.
3. **Scraper infrastructure** — Rate limiting, caching (Redis), retry logic, user-agent rotation across all scrapers.
4. **Dashboard quality** — Premium UI with ECharts, device simulator, auto-save drafts, real-time scoring.
5. **Multi-provider LLM** — Claude, OpenAI, and OpenRouter all supported with API keys stored in DB.

### Concerns

1. **No tests** — Zero test files found. Plan mentions `tests/` directory but nothing exists.
2. **iOS coverage is thin** — App Store scraper exists but most scrapers/agents are Play Store-focused. No backend keyword field support (iOS-only feature).
3. **No protobuf API** — All Play Store scraping is HTML-based, making it more fragile to Google's layout changes.
4. **No actual store API integration** — Experiments are planned by AI but can't be created/executed through the API. The user must manually create them in Play Console.

---

## Prioritized Recommendations

1. **Localization Agent** — The biggest missing piece. Locale keyword stacking is one of the highest-ROI ASO tactics and is uniquely automatable.
2. **Store API Integration** — Google Play Developer API for creating experiments and managing listings programmatically. This is what makes the platform truly autonomous.
3. **Tests** — At minimum, integration tests for scrapers (they're the most breakage-prone) and unit tests for scoring algorithms.
4. **Protobuf API** — Replace or supplement HTML scraping with the protobuf API for Play Store data. More reliable, faster, structured.
5. **Search Ads Intelligence** — Apple Search Ads is the only way to get real iOS search volume data.
