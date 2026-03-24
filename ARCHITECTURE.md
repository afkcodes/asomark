# ASOMARK — Architecture Diagrams

## 1. High-Level System Architecture

```mermaid
graph TB
    subgraph Dashboard["Dashboard — TanStack Start + shadcn/ui"]
        UI[Web UI]
        Charts[Recharts]
        Tables[TanStack Table]
        MockPage[Mock Store Page]
    end

    subgraph API["API Layer — Fastify"]
        Routes[REST Routes]
        Validation[Zod Validation]
    end

    subgraph Brain["ASOMARK Brain — AI Orchestrator"]
        LLM["LLM Engine<br/>(Claude / OpenAI)"]
        Decisions[Decision Engine]
        Strategy[Strategy Planner]
        Autonomy["Autonomy Controller<br/>L0-L3 Authority Levels"]
    end

    subgraph Agents["AI Agents"]
        Recon[Recon Agent]
        Keyword[Keyword Agent]
        Creative[Creative Agent]
        Experiment[Experiment Agent]
        Tracker[Tracker Agent]
        Review[Review Agent]
        SEO[SEO Agent]
        Localization[Localization Agent]
        Correlation[Correlation Engine]
        Risk[Risk Agent]
        Health[Health Scorer]
        Cannibal[Cannibalization<br/>Detector]
    end

    subgraph Workers["BullMQ Workers"]
        TrackWorker[Tracking Worker<br/>⏰ Every 6h]
        ScrapeWorker[Scraping Worker]
        AnalysisWorker[Analysis Worker<br/>⏰ Daily]
        ExpWorker[Experiment Worker<br/>⏰ Daily]
    end

    subgraph Scrapers["Scraper Layer"]
        PlayProto["Google Play<br/>Protobuf API"]
        AppStoreScrape["App Store<br/>iTunes API + Web"]
        GoogleSuggest["Google<br/>Autocomplete"]
        YTSuggest["YouTube<br/>Autocomplete"]
        Trends["Google<br/>Trends"]
        RedditScrape["Reddit"]
        WebScrape["Web Crawler"]
    end

    subgraph StoreAPIs["Official Store APIs"]
        PlayDev["Google Play<br/>Developer API"]
        ASC["App Store<br/>Connect API"]
        SearchAds["Apple<br/>Search Ads"]
    end

    subgraph Data["Data Layer"]
        PG[(PostgreSQL)]
        Redis[(Redis)]
        Files[(File Storage<br/>screenshots/icons)]
    end

    subgraph External["Notifications"]
        Telegram[Telegram Bot]
        Discord[Discord Webhook]
    end

    UI --> Routes
    Routes --> Brain
    Brain --> Agents
    Brain --> LLM
    Agents --> Workers
    Agents --> Scrapers
    Agents --> StoreAPIs
    Workers --> Redis
    Workers --> PG
    Scrapers --> Redis
    Agents --> PG
    Agents --> Files
    Brain --> External
    Routes --> PG
```

---

## 2. Data Flow — From Scraping to Strategy

```mermaid
flowchart LR
    subgraph Sources["Data Sources"]
        GP[Google Play<br/>Protobuf API]
        AS[App Store<br/>iTunes API]
        GS[Google Suggest]
        YS[YouTube Suggest]
        GT[Google Trends]
        RD[Reddit]
        WB[Web Search]
    end

    subgraph Processing["Processing Pipeline"]
        Parse[Parse &<br/>Normalize]
        NLP[NLP<br/>Extraction]
        Score[Keyword<br/>Scoring]
        Diff[Listing<br/>Diff Engine]
        Sentiment[Sentiment<br/>Analysis]
    end

    subgraph Storage["Storage"]
        DB[(PostgreSQL)]
        Cache[(Redis Cache)]
    end

    subgraph Intelligence["AI Intelligence"]
        Brain["Brain<br/>Orchestrator"]
        LLM[LLM Analysis]
    end

    subgraph Output["Outputs"]
        KW[Keyword<br/>Opportunities]
        COMP[Competitor<br/>Reports]
        LISTING[Listing<br/>Recommendations]
        EXP[Experiment<br/>Suggestions]
        ALERTS[Alerts &<br/>Notifications]
        HEALTH[Health<br/>Score]
    end

    Sources --> Parse --> Storage
    Parse --> NLP --> Score --> DB
    Parse --> Diff --> DB
    Parse --> Sentiment --> DB
    Storage --> Intelligence
    Brain --> LLM
    Intelligence --> Output
```

---

## 3. Agent Interaction Map

```mermaid
flowchart TB
    Brain["🧠 Brain Orchestrator"]

    Brain --> Recon
    Brain --> KW
    Brain --> Creative
    Brain --> Experiment
    Brain --> Tracker
    Brain --> Review
    Brain --> SEO
    Brain --> L10n
    Brain --> Correlation
    Brain --> Risk
    Brain --> Health
    Brain --> Cannibal

    subgraph ReconBox["Recon Agent"]
        Recon["Competitor<br/>Discovery &<br/>Analysis"]
    end

    subgraph KWBox["Keyword Agent"]
        KW["Keyword<br/>Research &<br/>Mining"]
    end

    subgraph CreativeBox["Creative Agent"]
        Creative["Visual & Copy<br/>Analysis &<br/>Generation"]
    end

    subgraph ExperimentBox["Experiment Agent"]
        Experiment["A/B Test<br/>Management &<br/>Tracking"]
    end

    subgraph TrackerBox["Tracker Agent"]
        Tracker["Rank Tracking<br/>& Competitor<br/>Spy"]
    end

    subgraph ReviewBox["Review Agent"]
        Review["Sentiment &<br/>Pain Point<br/>Mining"]
    end

    subgraph SEOBox["SEO Agent"]
        SEO["Web Search<br/>Optimization"]
    end

    subgraph L10nBox["Localization Agent"]
        L10n["Multi-Language<br/>Keyword<br/>Exploitation"]
    end

    subgraph CorrelationBox["Correlation Engine"]
        Correlation["Change → Impact<br/>Analysis"]
    end

    subgraph RiskBox["Risk Agent"]
        Risk["Anti-Ban &<br/>Compliance"]
    end

    subgraph HealthBox["Health Scorer"]
        Health["ASO Score<br/>0-100"]
    end

    subgraph CannibalBox["Cannibalization Detector"]
        Cannibal["Keyword Overlap<br/>Detection"]
    end

    %% Cross-agent data flows
    Recon -.->|competitor apps| KW
    Recon -.->|competitor listings| Creative
    Recon -.->|competitor reviews| Review
    KW -.->|scored keywords| Creative
    KW -.->|keyword gaps| Experiment
    KW -.->|keywords per locale| L10n
    Creative -.->|listing variants| Experiment
    Review -.->|user language| KW
    Review -.->|pain points| Creative
    Tracker -.->|rank changes| Correlation
    Tracker -.->|competitor changes| Recon
    Experiment -.->|results| Correlation
    Correlation -.->|learnings| Brain
    Risk -.->|risk check| Experiment
    Risk -.->|density check| Creative
    Health -.->|priorities| Brain
    Cannibal -.->|overlaps| KW
```

---

## 4. Autonomous Loop — Scheduling & Decision Flow

```mermaid
flowchart TB
    subgraph Scheduled["Scheduled Jobs (BullMQ)"]
        H6["Every 6 Hours"]
        D1["Every 24 Hours"]
        W1["Every 7 Days"]
        TR["On Trigger"]
    end

    subgraph H6Tasks["6-Hour Tasks"]
        RankScrape[Scrape keyword rankings]
        CompCheck[Check competitor listings]
        TrendUpdate[Update trend data]
    end

    subgraph D1Tasks["Daily Tasks"]
        KWScan[Keyword opportunity scan]
        ReviewMine[Review mining & sentiment]
        ExpStatus[Experiment status check]
        DailyBrief[Generate daily briefing]
        HealthCalc[Recalculate health scores]
    end

    subgraph W1Tasks["Weekly Tasks"]
        FullAudit[Full competitor audit]
        StrategyReview[Strategy reassessment]
        SuggestExp[Suggest new experiments]
        ListingOptim[Listing optimization suggestions]
    end

    subgraph Triggers["On-Trigger Tasks"]
        ExpDone[Experiment concluded]
        RankDrop[Rank dropped > 5 positions]
        CompChange[Competitor changed listing]
    end

    subgraph Decision["Decision Engine"]
        Analyze[Analyze Results]
        Decide{Authority<br/>Level?}
        L0["L0: Auto<br/>Execute silently"]
        L1["L1: Notify<br/>Execute & inform"]
        L2["L2: Suggest<br/>Wait for approval"]
        L3["L3: Confirm<br/>Require explicit OK"]
    end

    H6 --> H6Tasks
    D1 --> D1Tasks
    W1 --> W1Tasks
    TR --> Triggers

    H6Tasks --> Analyze
    D1Tasks --> Analyze
    W1Tasks --> Analyze
    Triggers --> Analyze
    Analyze --> Decide

    Decide -->|tracking, scraping| L0
    Decide -->|reports, alerts| L1
    Decide -->|title change, new experiment| L2
    Decide -->|apply experiment, change live listing| L3

    L2 -->|approved| Execute[Execute Action]
    L3 -->|approved| Execute
    L0 --> Execute
    L1 --> Execute
    Execute --> Log[Log to change_log]
    Log --> Correlation[Correlation Engine]
```

---

## 5. Keyword Research Pipeline

```mermaid
flowchart LR
    subgraph Sources["15+ Data Sources"]
        S1["Play Store<br/>Autocomplete"]
        S2["iTunes<br/>Search API"]
        S3["Google<br/>Autocomplete"]
        S4["YouTube<br/>Autocomplete"]
        S5["Google<br/>Trends"]
        S6["Competitor<br/>Descriptions"]
        S7["Competitor<br/>Reviews"]
        S8["Reddit<br/>Discussions"]
        S9["Apple Search<br/>Ads"]
        S10["Category<br/>Top Apps"]
    end

    subgraph Mining["Mining Techniques"]
        Alpha["Alphabet Soup<br/>a→z, aa→zz"]
        Prefix["Category Prefix<br/>'best X app'"]
        NLP["NLP Entity<br/>Extraction"]
        NGram["N-gram<br/>Analysis"]
        CrossLang["Cross-Language<br/>Discovery"]
        Misspell["Misspelling<br/>Mining"]
    end

    subgraph Scoring["Scoring Engine"]
        Volume["Search Volume<br/>× 0.30"]
        Relevance["App Relevance<br/>× 0.25"]
        Difficulty["Difficulty⁻¹<br/>× 0.20"]
        Gap["Competitor Gap<br/>× 0.15"]
        Trend["Trend Momentum<br/>× 0.10"]
        Final["Final<br/>Score"]
    end

    subgraph Filters["Filters & Checks"]
        Cannibal["Cannibalization<br/>Check"]
        RiskCheck["Risk Check<br/>Density/Policy"]
        Overlap["Overlap<br/>Detection"]
    end

    subgraph Output["Output"]
        Title["Title Keywords<br/>50 chars Android<br/>30 chars iOS"]
        Subtitle["Subtitle Keywords<br/>80 chars Android<br/>30 chars iOS"]
        Desc["Description<br/>Keywords"]
        Backend["Backend Keywords<br/>100 chars iOS"]
        Locale["Per-Locale<br/>Keywords"]
        Opportunities["Keyword<br/>Opportunities<br/>Report"]
    end

    Sources --> Mining --> Scoring
    Volume --> Final
    Relevance --> Final
    Difficulty --> Final
    Gap --> Final
    Trend --> Final
    Final --> Filters --> Output
```

---

## 6. Experiment Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Planning: Brain suggests experiment

    Planning --> Pending: Risk check passed
    Planning --> Rejected: Risk too high

    Pending --> Approved: User approves (L2/L3)
    Pending --> Rejected: User rejects

    Approved --> Creating: API call to store
    Creating --> Running: Experiment created
    Creating --> Failed: API error

    Running --> Monitoring: Daily status checks
    Monitoring --> Running: Not yet significant
    Monitoring --> Analyzing: Sufficient data

    Analyzing --> Winner: Clear winner found
    Analyzing --> NoWinner: No significant difference
    Analyzing --> Running: Need more data

    Winner --> ApplyPending: Suggest applying winner
    ApplyPending --> Applied: User approves
    ApplyPending --> Rejected: User rejects

    Applied --> Tracking: Monitor rank impact
    Tracking --> [*]: Results logged

    NoWinner --> [*]: Learnings logged
    Rejected --> [*]: Recorded
    Failed --> [*]: Error logged

    note right of Monitoring
        Checks every 24h
        via BullMQ worker
    end note

    note right of Applied
        Change logged to
        correlation engine
    end note
```

---

## 7. Database Entity Relationship

```mermaid
erDiagram
    APPS {
        uuid id PK
        string package_name
        string bundle_id
        string name
        string platform
        boolean is_ours
        string category
        timestamp created_at
    }

    KEYWORDS {
        uuid id PK
        string term
        string platform
        float search_volume_est
        float difficulty_est
        timestamp last_updated
    }

    RANK_SNAPSHOTS {
        uuid id PK
        uuid app_id FK
        uuid keyword_id FK
        string platform
        int rank
        date date
        int category_rank
    }

    LISTING_SNAPSHOTS {
        uuid id PK
        uuid app_id FK
        string title
        string subtitle
        string short_desc
        text long_desc
        string icon_url
        json screenshot_urls
        string video_url
        float rating
        int review_count
        string installs_text
        string version
        string app_size
        date snapshot_date
        text diff_from_previous
    }

    EXPERIMENTS {
        uuid id PK
        uuid app_id FK
        string platform
        string type
        string status
        json variants_json
        timestamp started_at
        timestamp ended_at
        json results_json
        string winner
        boolean applied
        float confidence
    }

    EXPERIMENT_CHANGES {
        uuid id PK
        uuid experiment_id FK
        string field_changed
        text old_value
        text new_value
        date change_date
        json impact_metrics_json
    }

    REVIEWS {
        uuid id PK
        uuid app_id FK
        string platform
        string author
        int rating
        text text
        date date
        float sentiment_score
        json topics_json
        string language
    }

    KEYWORD_OPPORTUNITIES {
        uuid id PK
        uuid keyword_id FK
        uuid app_id FK
        int current_rank
        int potential_rank
        float opportunity_score
        string suggested_action
        timestamp created_at
    }

    HEALTH_SCORES {
        uuid id PK
        uuid app_id FK
        int overall_score
        json breakdown_json
        date date
    }

    CHANGE_LOG {
        uuid id PK
        uuid app_id FK
        string change_type
        string field
        text old_value
        text new_value
        string source
        json metadata_json
        timestamp timestamp
    }

    RANK_CORRELATIONS {
        uuid id PK
        uuid change_log_id FK
        uuid keyword_id FK
        int rank_before
        int rank_after
        float cvr_before
        float cvr_after
        int days_to_effect
        float confidence
        text notes
    }

    STRATEGY_LOG {
        uuid id PK
        uuid app_id FK
        string action_type
        text reasoning
        text suggested_change
        string authority_level
        string status
        timestamp created_at
        timestamp approved_at
        timestamp executed_at
    }

    SCRAPE_JOBS {
        uuid id PK
        string source
        string target
        string status
        timestamp started_at
        timestamp completed_at
        int records_scraped
        text errors
    }

    APPS ||--o{ RANK_SNAPSHOTS : "tracked for"
    APPS ||--o{ LISTING_SNAPSHOTS : "snapshots of"
    APPS ||--o{ EXPERIMENTS : "runs"
    APPS ||--o{ REVIEWS : "has"
    APPS ||--o{ HEALTH_SCORES : "scored"
    APPS ||--o{ CHANGE_LOG : "changes"
    APPS ||--o{ STRATEGY_LOG : "strategies"
    KEYWORDS ||--o{ RANK_SNAPSHOTS : "ranked for"
    KEYWORDS ||--o{ KEYWORD_OPPORTUNITIES : "opportunities"
    EXPERIMENTS ||--o{ EXPERIMENT_CHANGES : "changes"
    CHANGE_LOG ||--o{ RANK_CORRELATIONS : "correlates"
    KEYWORDS ||--o{ RANK_CORRELATIONS : "impacted"
```

---

## 8. Scraper Architecture — Request Flow

```mermaid
flowchart TB
    subgraph Client["Scraper Client"]
        Request[Scrape Request]
    end

    subgraph RateLimit["Rate Limiter"]
        PQueue["p-queue<br/>Concurrency Control"]
        Throttle["1 req/sec<br/>per source"]
    end

    subgraph ProxyMgr["Proxy Manager"]
        Rotate["Rotate Proxy"]
        UARotate["Rotate User-Agent"]
        GeoSpoof["Country/Locale<br/>Spoofing"]
    end

    subgraph Cache["Redis Cache"]
        Check{"Cached?"}
        Store["Store Result<br/>TTL: 1-24h"]
    end

    subgraph Engines["Scraping Engines"]
        Protobuf["Protobuf Client<br/>(Play Store fdfe/)"]
        Undici["undici HTTP<br/>(APIs, suggest)"]
        PW["Playwright<br/>(dynamic pages)"]
        Cheerio2["Cheerio<br/>(static HTML)"]
    end

    subgraph Retry["Retry Logic"]
        PRetry["p-retry<br/>Exponential Backoff"]
        MaxRetry{"Max retries<br/>exceeded?"}
        Fail["Log Error<br/>Alert"]
    end

    Request --> PQueue --> Throttle
    Throttle --> Check
    Check -->|Yes| Return[Return Cached]
    Check -->|No| ProxyMgr
    ProxyMgr --> Engines
    Engines -->|Success| Store --> Return
    Engines -->|Error| PRetry
    PRetry --> MaxRetry
    MaxRetry -->|No| ProxyMgr
    MaxRetry -->|Yes| Fail
```

---

## 9. Dashboard Page Map

```mermaid
flowchart TB
    Root["/ — Dashboard Home<br/>Health scores, alerts,<br/>quick stats"]

    Apps["/apps — App List<br/>All tracked apps"]
    AppDetail["/apps/:id — App Detail<br/>Full listing view,<br/>rank history, health"]

    Keywords["/keywords<br/>Keyword universe,<br/>opportunities, scoring"]

    Competitors["/competitors<br/>Competitor list,<br/>change spy, analysis"]

    Experiments["/experiments<br/>Active & past experiments"]
    ExpDetail["/experiments/:id<br/>Variants, results,<br/>statistical significance"]

    Rankings["/rankings<br/>Rank tracking charts,<br/>historical trends"]

    Strategy["/strategy<br/>AI recommendations,<br/>approve/reject queue"]

    Root --> Apps
    Root --> Keywords
    Root --> Competitors
    Root --> Experiments
    Root --> Rankings
    Root --> Strategy
    Apps --> AppDetail
    Experiments --> ExpDetail
```

---

## 10. Deployment Architecture

```mermaid
graph TB
    subgraph Docker["Docker Compose"]
        subgraph App["Application"]
            Backend["Fastify Server<br/>:3001"]
            Dashboard2["TanStack Start<br/>:3000"]
            Workers2["BullMQ Workers<br/>(background)"]
        end

        subgraph Infra["Infrastructure"]
            PG2["PostgreSQL<br/>:5432"]
            Redis2["Redis<br/>:6379"]
        end

        subgraph Optional["Optional"]
            Playwright2["Playwright<br/>Browser Pool"]
        end
    end

    subgraph ExternalSvc["External Services"]
        LLM2["Claude / OpenAI API"]
        PlayAPI["Google Play<br/>Developer API"]
        ASCAPI["App Store<br/>Connect API"]
        TG["Telegram API"]
    end

    Backend --> PG2
    Backend --> Redis2
    Workers2 --> PG2
    Workers2 --> Redis2
    Workers2 --> Playwright2
    Dashboard2 --> Backend
    Backend --> LLM2
    Workers2 --> LLM2
    Backend --> PlayAPI
    Backend --> ASCAPI
    Backend --> TG
```
