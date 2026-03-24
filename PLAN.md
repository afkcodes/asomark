# ASOMARK — Autonomous ASO/SEO Intelligence Platform

## Vision

A fully autonomous AI-powered App Store Optimization platform that handles the entire lifecycle: competitor intelligence → keyword research → listing optimization → experiment execution → rank tracking → continuous improvement. Zero manual work. You approve, it executes.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ASOMARK BRAIN                            │
│                  (AI Orchestrator / LLM Agent)                  │
│                                                                 │
│  Understands context, makes decisions, plans experiments,       │
│  generates copy, analyzes results, adapts strategy              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ Recon    │ │ Keyword  │ │ Creative │ │ Experiment       │   │
│  │ Agent    │ │ Agent    │ │ Agent    │ │ Agent            │   │
│  ├──────────┤ ├──────────┤ ├──────────┤ ├──────────────────┤   │
│  │Competitor│ │Research  │ │Icons     │ │A/B tests         │   │
│  │discovery │ │Mining    │ │Screens   │ │Store experiments │   │
│  │Analysis  │ │Scoring   │ │Title/Sub │ │Result tracking   │   │
│  │Review    │ │Gaps      │ │Mock page │ │Rollback/apply    │   │
│  │mining    │ │Trends    │ │Video     │ │Change log        │   │
│  └──────────┘ └──────────┘ │graphics  │ └──────────────────┘   │
│                             └──────────┘                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ Tracker  │ │ SEO      │ │ Review   │ │ Localization     │   │
│  │ Agent    │ │ Agent    │ │ Agent    │ │ Agent            │   │
│  ├──────────┤ ├──────────┤ ├──────────┤ ├──────────────────┤   │
│  │Daily rank│ │Web SEO   │ │Sentiment │ │Multi-lang        │   │
│  │tracking  │ │Backlinks │ │Pain pts  │ │keyword reach     │   │
│  │Keyword   │ │Deep links│ │Response  │ │Translation       │   │
│  │spy       │ │Indexing  │ │templates │ │Locale hacks      │   │
│  │Alerts    │ │Rich rslt │ │Trends    │ │Cultural adapt    │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │Correlat° │ │ Health   │ │ Risk &   │ │ Cannibalization  │   │
│  │ Engine   │ │ Score    │ │ Compli-  │ │ Detector         │   │
│  ├──────────┤ ├──────────┤ │ ance     │ ├──────────────────┤   │
│  │Cause →   │ │0-100     │ ├──────────┤ │Keyword overlap   │   │
│  │effect    │ │score     │ │Anti-ban  │ │Title vs subtitle │   │
│  │Timeline  │ │Priority  │ │Policy    │ │Cross-app         │   │
│  │Knowledge │ │fixes     │ │Density   │ │Coverage max      │   │
│  │base      │ │Benchmark │ │limits    │ │                  │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                      DATA LAYER                                 │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────────┐  │
│  │ PostgreSQL │  │   Redis    │  │  File Storage            │  │
│  │ (core data)│  │ (cache/q)  │  │  (screenshots/assets)    │  │
│  └────────────┘  └────────────┘  └──────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                      SCRAPER LAYER                              │
│  Protobuf  │ App Store │ Google │ YouTube │ Reddit │ Web       │
│  Play API  │ Scraper   │ Suggest│ Suggest │ Scraper│ Crawler   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Language** | Node.js 20+ (TypeScript) | Async-first, great scraping/web ecosystem, unified stack with frontend |
| **Framework** | Fastify | Fast, low-overhead, plugin architecture, schema validation built-in |
| **AI Engine** | Claude/OpenAI (pluggable) | LLM brain for all intelligence |
| **Task Queue** | BullMQ + Redis | Robust job queue with scheduling, retries, concurrency control |
| **Database** | PostgreSQL | Relational data, time-series rank data |
| **ORM** | Drizzle ORM | Type-safe, lightweight, great migration support |
| **Cache** | Redis | Scraping cache, rate limiting, task broker |
| **Scraping** | Playwright + Cheerio + undici | Dynamic + static scraping, fast HTTP client |
| **Play Store Data** | Google Internal Protobuf API | Same API google-play-scraper uses — fast, structured, no browser needed |
| **Dashboard** | TanStack Start + shadcn/ui + Tailwind CSS | Full-stack React framework with file-based routing, beautiful UI primitives |
| **Store APIs** | Google Play Developer API, App Store Connect API | Official experiment & metadata access |
| **Charts** | Recharts | Lightweight, composable, React-native charting |
| **Data Tables** | TanStack Table | Headless, type-safe, sortable/filterable tables |
| **State/Fetching** | TanStack Query | Server state management, caching, auto-refetch |

### Key npm Packages

**Backend:**
| Package | Purpose |
|---------|---------|
| `fastify` | HTTP framework |
| `drizzle-orm` + `drizzle-kit` | ORM & migration tooling |
| `bullmq` | Job queues & scheduled tasks |
| `ioredis` | Redis client |
| `playwright` | Browser automation for dynamic scraping |
| `cheerio` | HTML parsing (lightweight, no browser) |
| `undici` | Fast HTTP client (Node built-in fetch on steroids) |
| `protobufjs` | Decode/encode Google Play protobuf responses |
| `@anthropic-ai/sdk` | Claude API client |
| `openai` | OpenAI API client |
| `googleapis` | Google Play Developer API, Google Ads API |
| `app-store-scraper` | iTunes/App Store data (fallback + supplement) |
| `google-play-scraper` | Reference impl for protobuf API patterns |
| `google-trends-api` | Google Trends data |
| `natural` | NLP toolkit (tokenization, sentiment, TF-IDF) |
| `compromise` | Lightweight NLP for keyword extraction |
| `p-queue` | Promise-based concurrency control |
| `p-retry` | Retry with exponential backoff |
| `cron` | Cron expression parsing for BullMQ repeatable jobs |
| `zod` | Runtime schema validation |
| `pino` | Structured logging (Fastify default) |
| `dotenv` | Environment variable loading |
| `nanoid` | Compact unique ID generation |
| `date-fns` | Date manipulation |
| `diff` | Text diff for listing change detection |

**Dashboard (TanStack Start):**
| Package | Purpose |
|---------|---------|
| `@tanstack/react-start` | Full-stack React framework |
| `@tanstack/react-router` | Type-safe file-based routing |
| `@tanstack/react-query` | Server state, caching, mutations |
| `@tanstack/react-table` | Headless data tables |
| `tailwindcss` + `@tailwindcss/typography` | Utility-first CSS |
| `shadcn/ui` components | Button, Card, Dialog, Table, Tabs, Toast, etc. |
| `recharts` | Composable chart components |
| `lucide-react` | Icon library (shadcn default) |
| `class-variance-authority` | Component variant management |
| `clsx` + `tailwind-merge` | Conditional class merging |
| `cmdk` | Command palette (⌘K search) |
| `sonner` | Toast notifications |
| `react-day-picker` | Date range picker for tracking views |

---

## Module Breakdown

### 1. RECON AGENT — Competitor Intelligence

**What it does:**
- Given your app category/description, autonomously discovers top competitors
- Pulls their full listing metadata (title, subtitle, description, keywords, screenshots, ratings, reviews)
- Tracks their listing changes over time (keyword changes, screenshot updates, description edits)
- Identifies their ASO strategy by reverse-engineering keyword patterns

**Data Sources:**
- Google Play Protobuf API (search results, category rankings, similar apps)
- Apple App Store scraping (iTunes Search API + web scraping)
- SimilarWeb/data.ai public data where available
- Google search `site:play.google.com` queries
- App review aggregator sites

**Hacks & Techniques:**
- Scrape "Similar apps" and "Users also installed" sections
- Track competitor installs via download badge scraping
- Monitor their store listing experiments (detect A/B test variants by hitting store from different IPs/devices)
- Build competitor keyword map by analyzing their title + short desc + long desc n-grams

**Output:**
```
competitor_report = {
    "competitors": [...],
    "their_keywords": [...],
    "their_strategy": "...",
    "gaps_we_can_exploit": [...],
    "their_weaknesses": [...]  # from review analysis
}
```

---

### 2. KEYWORD AGENT — Research & Mining

**What it does:**
- Mines keywords from every possible source
- Scores them (volume, difficulty, relevance)
- Finds long-tail opportunities competitors miss
- Suggests keyword groupings for title, subtitle, description
- Tracks keyword trends over time

**Data Sources (the exhaustive list):**

| Source | Method | What we get |
|--------|--------|-------------|
| Google Play Auto-Suggest | Scrape `play.google.com/store/search?q=` with alphabet permutations | Related search terms |
| Apple Search Ads | Apple Search Ads API (if available) | Search popularity scores |
| iTunes Search API | `itunes.apple.com/search?term=` | App results for keywords |
| Google Autocomplete | `google.com/complete/search?q=` | Web search suggestions |
| YouTube Autocomplete | `youtube.com/complete/search?q=` | Video search suggestions |
| Google Trends | `trends.google.com` scraping or google-trends-api | Trend data, related queries |
| Google Keyword Planner | Unofficial scraping or Ads API | Search volume estimates |
| Competitor Descriptions | NLP extraction from competitor listings | Keywords they target |
| Competitor Reviews | NLP extraction from user reviews | Language users actually use |
| Reddit/Forums | Scrape relevant subreddits | How users describe needs |
| Ubersuggest/AnswerThePublic | Scraping | Question-based keywords |
| App Store category browsing | Scrape top apps in each sub-category | Category-specific terms |
| Wikipedia/Knowledge Graph | Related concept mining | Semantic keyword expansion |
| Google Play Instant Suggestions | Real-time suggest API | Store-specific suggestions |

**Keyword Scoring Algorithm:**
```
score = (
    search_volume_normalized * 0.30 +
    relevance_to_app * 0.25 +
    difficulty_inverse * 0.20 +
    competitor_gap_score * 0.15 +
    trend_momentum * 0.10
)
```

**Hacks:**
- Alphabet soup technique: query `a`, `b`, ... `z`, `aa`, `ab`, ... for autocomplete
- Combine with app category prefixes: `"best [keyword] app"`, `"[keyword] tool"`
- Mine misspellings that still rank
- Find keywords where competitors rank but have weak listings (opportunity keywords)
- Use Google NLP API to extract entities from top-ranking descriptions
- Cross-language keyword discovery (find English keywords that accidentally rank in other locales)

---

### 3. CREATIVE AGENT — Visual & Copy Intelligence

**What it does:**
- Analyzes competitor screenshots, icons, feature graphics
- Generates title/subtitle/description copy variants
- Creates mock store pages showing how the listing would look
- Suggests screenshot messaging hierarchy
- A/B test copy generation

**Capabilities:**

**Title Optimization:**
- Analyze character limits (30 chars iOS, 50 chars Android title)
- Front-load highest-value keyword
- Generate 10+ title variants with different keyword combinations
- Score each variant: keyword value × brand recognition × click appeal

**Subtitle/Short Description:**
- iOS: 30 char subtitle — complements title keywords
- Android: 80 char short description — keyword-rich, compelling
- Generate variants that cover different keyword combinations

**Long Description (Android):**
- Keyword density analysis (target 2-4% for primary keywords)
- Natural keyword placement — not stuffing
- HTML formatting for readability
- Feature-benefit copy structure
- Track which description version is live and its rank correlation

**Screenshot Analysis:**
- Download competitor screenshots
- Use vision AI to analyze: text overlays, color schemes, feature highlights
- Identify patterns in top-performing apps
- Suggest caption text for each screenshot
- Recommend screenshot order (most compelling first)

**Icon Analysis:**
- Color analysis of top apps in category
- Contrast scoring
- Trend detection (are competitors using gradients? flat? 3D?)

**Mock Store Page:**
- Generate HTML mock of how the app listing would appear
- Preview both Play Store and App Store layouts
- Render with actual screenshot assets
- Side-by-side comparison with competitors

---

### 4. EXPERIMENT AGENT — A/B Testing & Execution

**What it does:**
- Creates and manages Google Play Store experiments via API
- Tracks experiment results automatically
- Maintains a changelog of every experiment ever run
- Determines statistical significance
- Auto-applies winning variants (with permission)
- Suggests next experiments based on results

**Google Play Store Listing Experiments:**
- Uses Google Play Developer API (androidpublisher v3)
- Can test: icon, feature graphic, screenshots, title, short description, long description
- Monitors conversion rate changes
- Calculates statistical significance

**Apple App Store (Product Page Optimization):**
- Uses App Store Connect API
- Can test: screenshots, app previews, promotional text
- Up to 3 treatment variants against original
- 90-day test duration tracking

**Experiment Lifecycle:**
```
PLAN → CREATE → MONITOR → ANALYZE → DECIDE → APPLY/REVERT
  ↑                                              |
  └──────────── LEARN & ITERATE ─────────────────┘
```

**Change Log Schema:**
```json
{
    "experiment_id": "exp_001",
    "type": "title_test",
    "platform": "android",
    "started": "2026-03-19",
    "variants": {
        "control": "MyApp - Task Manager",
        "variant_a": "MyApp: Smart Task & Project Manager",
        "variant_b": "MyApp - AI Task Manager & To-Do List"
    },
    "metrics": {
        "control": {"installs": 1200, "conversion": 0.034},
        "variant_a": {"installs": 1350, "conversion": 0.038},
        "variant_b": {"installs": 1100, "conversion": 0.031}
    },
    "winner": "variant_a",
    "confidence": 0.94,
    "applied": true,
    "learnings": "Including 'Smart' and 'Project' improved conversion by 11.7%"
}
```

**Hacks:**
- Run rapid sequential experiments to test more hypotheses
- Test localized listings separately per high-value country
- Use the experiment API to effectively rotate keywords (test different keyword combos in title)
- Test seasonal messaging during peak periods

---

### 5. TRACKER AGENT — Rank & Keyword Spy

**What it does:**
- Tracks keyword rankings daily for your app AND competitors
- Detects ranking changes and alerts
- Monitors competitor listing changes (did they change title? description? screenshots?)
- Tracks category rankings
- Builds historical trend data
- Detects algorithm shifts

**Tracking Mechanisms:**

**Keyword Rankings:**
- For each tracked keyword, search Play Store/App Store
- Record position of your app and competitors
- Store daily snapshots
- Calculate moving averages and trend direction

**Competitor Spy:**
- Daily snapshot of competitor listings
- Diff detection: what changed in their title/description/screenshots
- Alert when competitor changes keywords
- Track their rating trajectory
- Monitor their review velocity

**Algorithm Change Detection:**
- When rankings shift across many keywords simultaneously without listing changes
- Correlate with known Google/Apple update timelines
- Adapt strategy recommendations based on detected changes

**Data Model:**
```
                    ┌─────────────────────────┐
                    │    ranking_snapshots     │
                    ├─────────────────────────┤
   daily cron ──→   │ app_id                  │
                    │ keyword_id              │
                    │ platform                │
                    │ rank_position           │
                    │ category_rank           │
                    │ rating                  │
                    │ review_count            │
                    │ snapshot_date           │
                    └─────────────────────────┘
```

**Alerts:**
- Rank dropped > 5 positions for important keyword
- Competitor changed their listing
- New competitor entered top 10 for tracked keyword
- Rating dropped below threshold
- Review velocity anomaly (review bombing detection)

---

### 6. REVIEW AGENT — Sentiment & Pain Point Mining

**What it does:**
- Scrapes reviews for your app and competitors
- NLP sentiment analysis on every review
- Extracts feature requests & pain points
- Clusters reviews by topic
- Generates response templates
- Tracks sentiment trends over time
- Identifies keywords users naturally use (feeds back to Keyword Agent)

**Pain Point Analysis:**
```
Reviews → NLP Pipeline → Topic Clustering → Pain Point Extraction
                                                    ↓
                                          "Users complain about:
                                           1. Battery drain (23%)
                                           2. Sync issues (18%)
                                           3. Missing dark mode (15%)"
                                                    ↓
                                          Competitor Weakness Map
                                          (features they lack that users want)
```

**Hacks:**
- Use competitor pain points in your description ("Unlike other apps, we DON'T drain your battery")
- Mine review keywords to find terms users naturally associate with the category
- Track how competitor reviews change after their listing updates (correlation analysis)
- Identify review manipulation patterns in competitors (cluster suspicious reviews)

---

### 7. SEO AGENT — Web Search Optimization

**What it does:**
- Optimizes app presence in Google web search (not just store search)
- Deep link strategy and implementation advice
- App indexing optimization
- Web-to-app conversion optimization
- Knowledge panel optimization

**Capabilities:**
- Google web search rank tracking for app-related queries
- Schema markup recommendations for app landing page
- Deep link validation and suggestions
- Firebase App Indexing guidance
- Apple Universal Links recommendations
- Google Search Console integration for app landing page
- Backlink analysis for app landing page
- Content strategy for web presence (blog posts that funnel to app install)
- PWA SEO optimization
- Rich result optimization (app install cards in search)

---

### 8. LOCALIZATION AGENT — Multi-Language Exploitation

**What it does:**
- Identifies high-value locales
- Translates and culturally adapts listings
- Keyword research per locale
- Exploits cross-language ranking opportunities

**Hacks (the powerful ones):**
- **Locale keyword stacking**: Add keyword-rich titles/descriptions in locales where your app has no competition. Even English speakers may search from non-English locales.
- **Backend keywords (iOS)**: 100 chars of hidden keywords per locale. Use ALL available locales even if you don't support the language — Apple still indexes them.
- **Play Store locale overflow**: Google indexes keywords from all localized descriptions. Adding key terms in your localized descriptions can boost visibility globally.
- **Regional keyword research**: Same concept, different keywords per country. "Torch" (UK) vs "Flashlight" (US).
- **Transliteration keywords**: Add transliterated versions of your app name for non-Latin locales.

**Priority Locales (by potential impact):**
1. English (US, UK, AU, CA, IN)
2. Spanish (ES, MX, AR, CO)
3. Portuguese (BR, PT)
4. German, French, Italian
5. Japanese, Korean
6. Hindi, Indonesian, Thai
7. Arabic, Turkish
8. Russian
9. All remaining — even with machine translation, worth it for keyword indexing

---

### 9. CUSTOM LISTING GENERATOR

**What it does (pure AI intelligence — you manage listings in the consoles):**
- Generates optimized copy variants for Google Play **custom store listings** (50 available) and Apple **custom product pages** (35 available)
- Groups keywords by search intent → creates listing variant per intent cluster
- AI-generates country-specific copy with culturally relevant messaging
- Suggests which keyword clusters deserve their own custom page
- Monitors competitor custom pages (detect via different store URLs)

---

### 10. RELEASE NOTES OPTIMIZER

**What it does:**
- Google indexes "What's New" text — it's a keyword opportunity most people waste
- Generates keyword-rich release notes for each update
- Monitors competitor release frequency & their release note keywords
- Recommends optimal update cadence based on category norms

---

### 11. IN-APP EVENTS & LIVEOPS KEYWORD OPTIMIZER

**What it does:**
- iOS In-App Events and Android LiveOps appear **in search results** — free extra search real estate
- Generates keyword-optimized event names and descriptions
- Schedules events around peak search periods for target keywords
- Analyzes what event keywords competitors are using
- Suggests event rotation strategy (fresh content signals)

---

### 12. ASO HEALTH SCORE

Generates a 0-100 score for how well-optimized your listing is vs what's possible:
- Checks: title keyword usage, subtitle coverage, description density, localization coverage, backend keyword usage (iOS), update recency, event usage
- Compares against top 10 competitors' optimization levels
- Prioritizes: "Fix these 3 things for biggest ranking impact"
- Tracks score over time to see if optimizations are improving

---

### 13. KEYWORD CANNIBALIZATION DETECTOR

- Detects when your title keywords overlap with subtitle — wasting character space
- Finds keywords in description that should be in title instead (higher weight position)
- If you have multiple apps, detects cross-app keyword cannibalization
- Suggests keyword separation strategy to maximize total keyword coverage

---

### 14. SEARCH ADS INTELLIGENCE

- Suggests low-budget Apple Search Ads campaigns for **keyword validation** (the only way to get real search volume data on iOS)
- Detects which keywords competitors are bidding on (visible via Search Ads API)
- Feeds paid keyword performance back into organic keyword scoring
- Discovery campaigns to surface keywords you didn't think of

---

### 15. CORRELATION ENGINE — What Actually Moved the Needle

- Logs every listing change you make with timestamp
- Overlays rank changes on the change timeline
- Tells you: "After changing title on Mar 1, you gained 17 positions for 'task manager' over 5 days"
- Detects when a competitor change caused your rank to drop
- Builds a knowledge base of what works in your category over time

---

## Additional Features (Enhancements)

### 16. SEASONAL & TREND INTELLIGENCE
- Track search volume seasonality (tax apps in March, fitness in January)
- Pre-optimize listings before seasonal peaks
- Ride trending topics (integrate with Google Trends real-time)
- Event-based keyword optimization (World Cup, elections, etc.)

### 17. RISK MANAGEMENT — ANTI-BAN PROTECTION
- Keyword density limits (flag if approaching stuffing territory)
- Metadata change frequency limits
- Compliance checker against latest store guidelines
- Warning system: "This change risks policy violation" before you apply it

### 18. COMPETITOR APP INTELLIGENCE
- Scrape competitor app size, permissions, data safety labels
- Compare against yours — find positioning angles ("We're 3x smaller than alternatives")
- Track when competitors change permissions or privacy labels

---

## Data Sources — Complete Scraping Strategy

### Google Play Store
| Endpoint | Data | Method |
|----------|------|--------|
| **Protobuf API** (`BulkDetailsRequest`) | Full app metadata, ratings, installs, category | Protobuf-over-HTTP (same as google-play-scraper) |
| **Protobuf API** (`SearchRequest`) | Search results, rankings | Protobuf-over-HTTP |
| **Protobuf API** (`ReviewsRequest`) | User reviews with ratings | Protobuf-over-HTTP |
| **Protobuf API** (`SimilarAppsRequest`) | Competitor discovery | Protobuf-over-HTTP |
| **Protobuf API** (`DeveloperAppsRequest`) | Developer portfolio | Protobuf-over-HTTP |
| **Protobuf API** (`CategoryListRequest`) | Category rankings | Protobuf-over-HTTP |
| `play.google.com/store/search/suggest` | Autocomplete suggestions | Direct HTTP |
| Web scraping fallback | Screenshots, feature graphics, full HTML | Playwright + Cheerio |
| Google Play Developer API | Experiments, metadata management | Official API |

**Protobuf API Details:**
Google Play uses an internal protobuf API at `https://android.clients.google.com/fdfe/` endpoints. The `google-play-scraper` npm package reverse-engineers these endpoints. We'll use the same approach but build our own client for:
- More control over request parameters
- Custom headers/locale/country spoofing
- Batch requests (BulkDetails) for fetching multiple apps in one call
- Rate limiting and proxy rotation at protocol level

Key endpoints:
- `/fdfe/details` — Single app details
- `/fdfe/bulkDetails` — Multiple apps in one request
- `/fdfe/search` — Search results
- `/fdfe/browse` — Category/collection browsing
- `/fdfe/rec` — Recommendations/similar apps
- `/fdfe/rev` — Reviews

### Apple App Store
| Endpoint | Data | Method |
|----------|------|--------|
| iTunes Search API | App metadata, search results | Official REST API |
| App Store web pages | Full listing, screenshots | Scraping |
| App Store Connect API | Experiments, analytics, metadata | Official API |
| Apple Search Ads API | Search popularity scores | Official API (if accessible) |
| RSS feeds | Top charts | Official RSS |

### Google Services
| Endpoint | Data | Method |
|----------|------|--------|
| Google Autocomplete | Web search suggestions | HTTP API |
| Google Trends | Trend data | google-trends-api / scraping |
| YouTube Autocomplete | Video search suggestions | HTTP API |
| Google Search | Web ranking, knowledge panels | Scraping (careful with rate limits) |
| Google Ads Keyword Planner | Volume estimates | API or scraping |

### Other Sources
| Source | Data | Method |
|--------|------|--------|
| Reddit | User discussions, pain points | Reddit API / scraping |
| AnswerThePublic | Question keywords | Scraping |
| Product Hunt | App discovery, competitor intel | API |
| Social mentions | Brand monitoring | Platform APIs |
| App Annie / data.ai | Market data (free tier) | Scraping |

---

## Autonomy Model — How it Actually Runs Without You

### Decision Authority Levels

| Level | Description | Example |
|-------|-------------|---------|
| **L0 — Auto** | Does it without asking | Daily rank tracking, data scraping, analysis |
| **L1 — Notify** | Does it, then tells you | Keyword report generation, competitor alerts |
| **L2 — Suggest** | Proposes action, waits for approval | "I suggest changing title to X. Approve?" |
| **L3 — Confirm** | Requires explicit approval | Applying experiment results, changing live listing |

### Autonomous Loop
```
Every 6 hours:
├── Scrape rankings for all tracked keywords
├── Check competitor listings for changes
├── Update trend data
└── Generate alerts if significant changes

Every 24 hours:
├── Full keyword opportunity scan
├── Review mining & sentiment analysis
├── Experiment status check
├── Generate daily briefing

Every 7 days:
├── Full competitor audit
├── Strategy reassessment
├── Suggest new experiments
├── Listing optimization suggestions

On trigger (e.g., experiment concluded):
├── Analyze results
├── Generate report
├── Suggest next action
└── Wait for approval at L2/L3
```

---

## Database Schema (Core Tables)

```sql
-- Apps we're tracking (ours + competitors)
apps (id, package_name, bundle_id, name, platform, is_ours, category, created_at)

-- Keyword universe
keywords (id, term, platform, search_volume_est, difficulty_est, last_updated)

-- Daily rank snapshots
rank_snapshots (id, app_id, keyword_id, platform, rank, date, category_rank)

-- App listing snapshots (detect changes)
listing_snapshots (id, app_id, title, subtitle, short_desc, long_desc,
                   icon_url, screenshot_urls, video_url, rating, review_count,
                   installs_text, version, app_size, snapshot_date, diff_from_previous)

-- Experiments
experiments (id, app_id, platform, type, status, variants_json,
             started_at, ended_at, results_json, winner, applied, confidence)

-- Experiment changelog
experiment_changes (id, experiment_id, field_changed, old_value, new_value,
                    change_date, impact_metrics_json)

-- Reviews
reviews (id, app_id, platform, author, rating, text, date,
         sentiment_score, topics_json, language)

-- Keyword opportunities
keyword_opportunities (id, keyword_id, app_id, current_rank, potential_rank,
                       opportunity_score, suggested_action, created_at)

-- ASO health score history
health_scores (id, app_id, overall_score, breakdown_json, date)

-- Change timeline (for correlation engine)
change_log (id, app_id, change_type, field, old_value, new_value,
            source, metadata_json, timestamp)

-- Rank impact correlations
rank_correlations (id, change_log_id, keyword_id, rank_before, rank_after,
                   cvr_before, cvr_after, days_to_effect, confidence, notes)

-- Strategy log (AI decisions)
strategy_log (id, app_id, action_type, reasoning, suggested_change,
              authority_level, status, created_at, approved_at, executed_at)

-- Scraping jobs
scrape_jobs (id, source, target, status, started_at, completed_at,
             records_scraped, errors)
```

---

## Project Structure

```
asomark/
├── README.md
├── PLAN.md
├── package.json
├── tsconfig.json
├── drizzle.config.ts               # Drizzle ORM config
├── docker-compose.yml              # Postgres + Redis
├── .env.example
│
├── src/
│   ├── index.ts                    # App entry — starts Fastify + workers
│   ├── config.ts                   # All configuration (env-based)
│   ├── server.ts                   # Fastify app setup
│   ├── db/
│   │   ├── index.ts                # Drizzle DB client
│   │   ├── schema.ts               # All table schemas
│   │   └── migrations/             # Drizzle migrations
│   │
│   ├── scrapers/                   # All scraping modules
│   │   ├── base.ts                 # Base scraper with rate limiting & retry
│   │   ├── playstore/              # Google Play scraping
│   │   │   ├── protobuf.ts         # Protobuf API client (fdfe endpoints)
│   │   │   ├── search.ts           # Search & ranking scraper
│   │   │   ├── details.ts          # App detail fetcher
│   │   │   ├── reviews.ts          # Review scraper
│   │   │   ├── similar.ts          # Similar apps discovery
│   │   │   └── index.ts            # Unified Play Store API
│   │   ├── appstore.ts             # Apple App Store scraping
│   │   ├── google-suggest.ts       # Google autocomplete
│   │   ├── youtube-suggest.ts      # YouTube autocomplete
│   │   ├── google-trends.ts        # Trends data
│   │   ├── reddit.ts               # Reddit scraping
│   │   ├── web.ts                  # General web scraping
│   │   └── proxy-manager.ts        # Proxy rotation
│   │
│   ├── agents/                     # AI-powered autonomous agents
│   │   ├── brain.ts                # Central orchestrator
│   │   ├── recon.ts                # Competitor intelligence
│   │   ├── keyword.ts              # Keyword research
│   │   ├── creative.ts             # Visual & copy analysis
│   │   ├── experiment.ts           # A/B test management
│   │   ├── tracker.ts              # Rank tracking
│   │   ├── review.ts               # Review analysis
│   │   ├── seo.ts                  # SEO optimization
│   │   ├── localization.ts         # Multi-language
│   │   ├── correlation.ts          # Change → impact analysis
│   │   └── risk.ts                 # Anti-ban protection
│   │
│   ├── services/                   # Business logic
│   │   ├── keyword-scorer.ts       # Keyword scoring algorithm
│   │   ├── listing-generator.ts    # AI-powered copy generation
│   │   ├── mock-page.ts            # Mock store page renderer
│   │   ├── diff-engine.ts          # Listing change detection
│   │   ├── experiment-manager.ts   # Experiment lifecycle
│   │   ├── health-scorer.ts        # ASO health score calculator
│   │   ├── correlation-engine.ts   # Change → rank impact analysis
│   │   ├── cannibalization.ts      # Keyword cannibalization detector
│   │   └── alert-service.ts        # Notifications & alerts
│   │
│   ├── store-apis/                 # Official store API wrappers
│   │   ├── play-developer.ts       # Google Play Developer API
│   │   ├── appstore-connect.ts     # App Store Connect API
│   │   └── search-ads.ts           # Apple Search Ads API
│   │
│   ├── workers/                    # BullMQ job processors
│   │   ├── queue.ts                # Queue setup & connection
│   │   ├── tracking.worker.ts      # Scheduled tracking jobs
│   │   ├── scraping.worker.ts      # Scraping jobs
│   │   ├── analysis.worker.ts      # Analysis jobs
│   │   └── experiments.worker.ts   # Experiment monitoring jobs
│   │
│   ├── routes/                     # Fastify route modules
│   │   ├── apps.ts                 # App management endpoints
│   │   ├── keywords.ts             # Keyword endpoints
│   │   ├── rankings.ts             # Ranking data endpoints
│   │   ├── experiments.ts          # Experiment endpoints
│   │   ├── reports.ts              # Report generation
│   │   └── actions.ts              # Approve/reject actions
│   │
│   └── utils/                      # Shared utilities
│       ├── llm.ts                  # LLM client (Claude/OpenAI)
│       ├── text.ts                 # Text processing helpers
│       └── store-constants.ts      # Store limits, rules, etc.
│
├── dashboard/                      # Frontend (TanStack Start + shadcn)
│   ├── package.json
│   ├── app.config.ts               # TanStack Start config
│   ├── tailwind.config.ts
│   ├── components.json             # shadcn/ui config
│   ├── src/
│   │   ├── routes/                 # File-based routing
│   │   │   ├── __root.tsx          # Root layout
│   │   │   ├── index.tsx           # Dashboard home
│   │   │   ├── apps/
│   │   │   │   ├── index.tsx       # App list
│   │   │   │   └── $appId.tsx      # App detail view
│   │   │   ├── keywords/
│   │   │   │   └── index.tsx       # Keyword research & tracking
│   │   │   ├── competitors/
│   │   │   │   └── index.tsx       # Competitor intel
│   │   │   ├── experiments/
│   │   │   │   ├── index.tsx       # Experiment list
│   │   │   │   └── $expId.tsx      # Experiment detail
│   │   │   ├── rankings/
│   │   │   │   └── index.tsx       # Rank tracking charts
│   │   │   └── strategy/
│   │   │       └── index.tsx       # AI strategy & approvals
│   │   ├── components/
│   │   │   ├── ui/                 # shadcn/ui components
│   │   │   ├── charts/             # Recharts wrappers
│   │   │   ├── mock-store-page.tsx # Store page preview
│   │   │   └── keyword-table.tsx   # TanStack Table keyword grid
│   │   ├── lib/
│   │   │   ├── api.ts              # API client (TanStack Query)
│   │   │   └── utils.ts            # Shared helpers
│   │   └── styles/
│   │       └── globals.css         # Tailwind base styles
│   └── ...
│
├── tests/
│   ├── ...
│
└── data/                           # Local data storage
    ├── screenshots/                # Downloaded screenshots
    ├── icons/                      # Downloaded icons
    └── exports/                    # Generated reports
```

---

## Implementation Phases

### Phase 1 — Foundation (Week 1)
- [x] Project plan (this document)
- [ ] Project scaffolding (package.json, tsconfig, docker-compose, config)
- [ ] Database schema & migrations (Drizzle ORM)
- [ ] Base scraper framework with rate limiting & proxy support
- [ ] LLM client abstraction (Claude/OpenAI pluggable)
- [ ] BullMQ worker infrastructure
- [ ] Google Play Store scraper (search, app detail, reviews)
- [ ] Apple App Store scraper (iTunes API + web scraping)

### Phase 2 — Intelligence Core (Week 2)
- [ ] Keyword mining from all sources (autocomplete, trends, competitors)
- [ ] Keyword scoring algorithm
- [ ] Competitor discovery & analysis pipeline
- [ ] Review scraping & sentiment analysis
- [ ] Pain point extraction from reviews
- [ ] Recon Agent — full competitor intelligence reports

### Phase 3 — Optimization Engine (Week 3)
- [ ] Listing generator (title, subtitle, descriptions)
- [ ] Creative analysis (screenshot/icon analysis via vision AI)
- [ ] Mock store page renderer
- [ ] Keyword Agent — complete keyword research pipeline
- [ ] Creative Agent — visual & copy recommendations

### Phase 4 — Tracking & Experimentation (Week 4)
- [ ] Daily rank tracking system (BullMQ scheduled tasks)
- [ ] Competitor spy (listing change detection)
- [ ] Google Play Developer API integration (experiments)
- [ ] App Store Connect API integration
- [ ] Experiment lifecycle management
- [ ] Tracker Agent — automated daily tracking
- [ ] Experiment Agent — A/B test management

### Phase 5 — Autonomy & Dashboard (Week 5)
- [ ] Brain orchestrator (central AI decision maker)
- [ ] Autonomy levels & approval workflow
- [ ] Alert system (Telegram/Discord notifications)
- [ ] Dashboard MVP (ranking charts, experiment results, competitor view)
- [ ] Localization Agent
- [ ] SEO Agent
- [ ] Risk management & anti-ban checks

### Phase 6 — Polish & Advanced (Week 6+)
- [ ] Algorithm reverse engineering model
- [ ] Install velocity estimation
- [ ] Seasonal trend intelligence
- [ ] Advanced reporting & export
- [ ] Strategy history & learning (what worked/didn't)
- [ ] Self-improving: AI reviews past decisions to improve future ones

---

## Store Hacks Reference — Exploit Guide (Safe Zone)

### Google Play Store

| Hack | Description | Risk Level |
|------|-------------|------------|
| **Title keyword loading** | Put highest-value keyword right after brand name. Max 50 chars. | Low |
| **Short description saturation** | 80 chars — every word should be a keyword or install-trigger. | Low |
| **Long description keyword density** | 2-4% density for primary keywords. Repeat naturally 3-5 times in 4000 chars. | Low |
| **Developer name keywords** | Include category keyword in developer name. "Ashish - Productivity Tools" | Low |
| **Locale keyword stacking** | Add keyword-rich descriptions in all locales, even if app is English-only. Google indexes everything. | Low-Med |
| **Rapid experiment cycling** | Run short experiments (1-2 weeks) to test more hypotheses faster. | Low |
| **Screenshot text optimization** | Put keywords in screenshot text overlays. Less ranking impact but improves conversion. | Low |
| **Category switching** | Test different categories to find one where you rank higher. | Low |
| **Description HTML formatting** | Use bold, bullets for readability → better engagement → better ranking. | Low |
| **In-app events/LiveOps** | Google surfaces these in search → extra visibility for time-limited content. | Low |

### Apple App Store

| Hack | Description | Risk Level |
|------|-------------|------------|
| **Subtitle keywords** | 30 chars — don't repeat title keywords. Cover different high-value terms. | Low |
| **Backend keyword field** | 100 chars, comma-separated. Use singular forms, no spaces after commas, no duplicates. | Low |
| **All-locale backend keywords** | Add keywords in ALL locale keyword fields, even languages you don't support. Apple indexes them. | Low-Med |
| **In-app purchase names** | IAP names are indexed! Name your IAPs with keywords: "Premium Photo Editor Pro" | Low |
| **Promotional text rotation** | Changes without review. Rotate messaging for seasonal/trend keywords. | Low |
| **Bundle name optimization** | The bundle display name can differ from marketing name — optimize both. | Low |
| **Strategic category selection** | Primary + secondary category affects ranking. Test different combinations. | Low |
| **Custom product page variants** | Create keyword-targeted product pages for different search intents. | Low |

### Cross-Platform

| Hack | Description | Risk Level |
|------|-------------|------------|
| **Review keyword seeding** | Encourage users to mention specific features in reviews. Feeds organic keywords. | Med |
| **Deep link SEO** | Web pages with deep links that open the app → web SEO drives app installs. | Low |
| **Social proof in screenshots** | "10M+ downloads" or awards in screenshot text → higher conversion. | Low |
| **Competitor keyword hijacking** | Target competitor brand-adjacent keywords. Don't use trademarks in metadata. | Med |
| **Trend riding** | Update listing to include trending terms relevant to your app. Quick win. | Low |
| **Update frequency** | Regular app updates signal active development to store algorithms. | Low |

### Things to NEVER Do (Ban Risk: High)

- Keyword stuffing (repeating keywords unnaturally)
- Fake reviews or review manipulation
- Misleading metadata (screenshots showing features that don't exist)
- Using competitor trademarks in metadata
- Incentivized installs/reviews
- Manipulating install counts
- Hidden redirects or cloaking
- Using prohibited keywords (gambling, adult content without proper rating)

---

## Configuration Model

```typescript
// config.ts — env-based configuration
export const config = {
  apps: {
    myApps: [
      {
        name: "MyApp",
        packageName: "com.example.myapp",  // Android
        bundleId: "com.example.myapp",     // iOS
        category: "productivity",
        targetKeywords: ["task manager", "to-do list", "productivity"],
        targetCountries: ["US", "IN", "GB", "DE"],
      },
    ],
    competitorPackages: [
      "com.competitor1.app",
      "com.competitor2.app",
    ],
  },

  llm: {
    provider: process.env.LLM_PROVIDER ?? "anthropic", // or "openai"
    model: process.env.LLM_MODEL ?? "claude-sonnet-4-20250514",
    apiKey: process.env.LLM_API_KEY!,
  },

  scraping: {
    rateLimitPerSecond: 1,
    proxyList: process.env.PROXY_LIST?.split(",") ?? [],
    headless: true,
    rotateUserAgents: true,
  },

  tracking: {
    rankCheckIntervalHours: 6,
    competitorCheckIntervalHours: 24,
    fullAuditIntervalDays: 7,
  },

  experiment: {
    minDurationDays: 7,
    confidenceThreshold: 0.90,
    autoApplyWinners: false, // L3 — requires approval
  },

  notifications: {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
    discordWebhook: process.env.DISCORD_WEBHOOK,
  },

  db: {
    url: process.env.DATABASE_URL!,
  },

  redis: {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
  },
} as const;
```

---

## Next Steps

1. **Approve this plan** — review and tell me what to add/change
2. **Set up the project** — I'll scaffold the entire codebase
3. **Start with Phase 1** — foundation, scrapers, database
4. **Iterate** — we'll build agent by agent, testing each one

---

*ASOMARK — Because your app deserves to be found.*
