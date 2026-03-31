# ASOMARK SEO Suite Roadmap

> Created: 2026-03-31 | Status: Planning

## Vision

Build a full SEO + LLMO (LLM Optimization) suite that combines traditional web SEO with AI visibility optimization. Unique angle: app-focused — ASO + SEO in one platform, connecting app store optimization with web presence strategy.

## Current State

Already built and working:
- 7 keyword discovery sources (Google Suggest, alphabet soup, YouTube, Reddit, questions, comparisons, modifiers)
- AI-powered keyword clustering into topic hubs
- Content plan generation with outlines, priorities, status tracking
- Schema markup & deep link recommendations
- Full UI with keyword table, content plans, report views

---

## Phase 1: Connect Real Data

### 1.1 Google Search Console Integration
**Priority: HIGH | Impact: HIGHEST**

Connect user's GSC account to get real search performance data instead of estimates.

**Data we get:**
- Clicks, impressions, CTR, average position per keyword
- Performance per landing page
- Indexing status and coverage errors
- Sitemap status

**Implementation:**
- `googleapis` npm package (already in dependency plan)
- OAuth2 flow — user connects Google account in Settings
- Daily automated data pull via BullMQ worker
- New DB tables: `seo_search_performance` (keyword, page, clicks, impressions, ctr, position, date)
- Dashboard: search performance chart, top keywords by clicks, top pages by traffic

**API limits:** 2,000 queries/day, 600/minute (plenty for a personal tool)

### 1.2 Google Analytics (GA4) Integration
**Priority: MEDIUM | Impact: HIGH**

Post-click behavior — what happens after someone lands on the website.

**Data we get:**
- Bounce rate, session duration, conversions per landing page
- Traffic sources breakdown (organic, referral, AI referrals)
- AI referral tracking (traffic from ChatGPT, Perplexity, Gemini domains)

**Implementation:**
- GA4 Data API via `googleapis`
- Same OAuth2 flow as GSC
- Join GSC data (pre-click) with GA4 data (post-click) by landing page
- New DB table: `seo_page_analytics` (page, sessions, bounceRate, avgDuration, conversions, source, date)

### 1.3 Content Performance Matching
**Priority: MEDIUM | Impact: HIGH**

Match GSC/GA4 data to our content plans — "this blog post ranks #3 for 'budget tracking tips' and gets 200 clicks/month."

**Implementation:**
- Join `seo_content_plans.title` with GSC landing page URLs
- Show performance metrics on each content plan card
- Identify which planned content to write next based on keyword gaps in GSC data

---

## Phase 2: AI Visibility & LLMO

### 2.1 AI Mention Tracking
**Priority: HIGH | Impact: HIGH**

Track whether AI models mention/recommend the user's brand.

**How it works:**
- Define brand-relevant prompts ("best budget app for Android", "expense tracker recommendation")
- Periodically query ChatGPT/Perplexity/Gemini APIs with these prompts
- Parse responses for brand mentions, citations, sentiment
- Track over time: are we being mentioned more or less?

**Implementation:**
- Use our existing Claude/OpenAI SDK to query models
- Perplexity API for citation tracking (they return source URLs)
- New DB table: `ai_visibility_checks` (prompt, platform, mentioned, cited, position, sentiment, date)
- Dashboard: AI visibility score over time, competitor comparison, citation sources

**Key metrics per prompt:**
- Mentioned: yes/no
- Cited: yes/no (with URL)
- Position: where in the response (1st mentioned, 3rd, etc.)
- Sentiment: positive/neutral/negative

### 2.2 AI Sentiment Analysis
**Priority: MEDIUM | Impact: HIGH**

How do AI models describe and perceive the brand?

**Implementation:**
- Ask LLMs: "What do you know about [brand]?", "How would you describe [app name]?"
- Parse for: associations, strengths mentioned, weaknesses mentioned, competitor comparisons
- Track sentiment score over time (0-100)
- Alert when sentiment changes significantly

### 2.3 Prompt-Based Content Planning
**Priority: MEDIUM | Impact: MEDIUM**

Mine real questions people ask AI platforms, then create content that answers them.

**Sources:**
- Reddit threads asking for app recommendations
- Google's "People Also Ask" scraping
- AI platform prompt suggestions
- Our existing keyword question mining ("how to", "what is", etc.)

**Output:**
- Content briefs specifically designed to be cited by AI models
- Each brief includes: target prompt, desired AI response, content structure

### 2.4 LLM.txt Generation
**Priority: LOW | Impact: MEDIUM**

Generate a `/llm.txt` file for the user's website that guides AI crawlers.

**Implementation:**
- Auto-generate from brand profile + app description + key features
- Format follows emerging `llm.txt` standard
- Include: brand identity, products, key facts AI should know, preferred descriptions

### 2.5 AI Crawler Access Audit
**Priority: LOW | Impact: MEDIUM**

Check if AI crawlers can access the user's website.

**Implementation:**
- Fetch and parse `robots.txt` from user's domain
- Check for blocks on: GPTBot, ChatGPT-User, Google-Extended, PerplexityBot, ClaudeBot, Applebot-Extended
- Check for Google-Agent user-triggered fetcher access
- Report: "ChatGPT can access your site ✓ / Perplexity is blocked ✗"

---

## Phase 3: Technical SEO Audit

### 3.1 Site Crawler
**Priority: HIGH | Impact: HIGH**

Crawl the user's website and identify technical SEO issues.

**What we check:**
- Missing/duplicate `<title>` tags
- Missing/duplicate `<meta description>`
- Missing `<h1>` or multiple `<h1>` tags
- Broken internal/external links (404s)
- Missing image `alt` attributes
- Pages without canonical tags
- Redirect chains
- Mobile-friendliness signals
- Page load size (large images, uncompressed resources)

**Implementation:**
- Use our existing `WebScraper` + Cheerio for HTML parsing
- BFS crawler starting from homepage, following internal links
- New DB table: `site_audit_results` (url, issues[], score, crawledAt)
- Respect robots.txt and rate limits
- Dashboard: issue list grouped by severity, page-by-page breakdown

### 3.2 Core Web Vitals Monitor
**Priority: MEDIUM | Impact: MEDIUM**

Track page speed scores over time.

**Implementation:**
- Google PageSpeed Insights API (free, 25,000 queries/day)
- Check LCP, FID, CLS scores for key pages
- Track over time, alert on regressions
- New DB table: `page_speed_scores` (url, lcp, fid, cls, score, date)

### 3.3 Schema Markup Validator
**Priority: LOW | Impact: LOW**

Check if schema markup is correctly implemented.

**Implementation:**
- Fetch page, parse JSON-LD and microdata
- Validate against schema.org types
- Check for: SoftwareApplication, FAQ, HowTo, Article, BreadcrumbList
- Suggest missing schema types based on page content

---

## Phase 4: Content Engine

### 4.1 Brand Profile Builder
**Priority: MEDIUM | Impact: HIGH**

Auto-build brand identity from website + app listing.

**Implementation:**
- Scrape user's website homepage + about page + app listing
- LLM analysis to extract: tone of voice, values, target audience, differentiators, key messaging
- Store as `brand_profile` in projects table
- Feed into all content generation for consistent voice

### 4.2 AI Content Writer
**Priority: HIGH | Impact: HIGH**

Generate full articles from our existing content plan outlines.

**Implementation:**
- Take content plan outline → LLM generates full article (1500-3000 words)
- Built-in: semantic SEO (related entities, topical depth), heading structure, internal linking suggestions
- LLMO-optimized: self-contained passages, clear definitions, citable statistics
- E-E-A-T signals: author attribution, source citations, experience markers
- Output: markdown ready for CMS

### 4.3 Content Freshness Monitor
**Priority: LOW | Impact: MEDIUM**

Track content age — AI models prefer recent content (90% of cited pages are <3 years old).

**Implementation:**
- Track published dates for all content plan pieces
- Alert when content needs refreshing (>6 months old)
- Suggest which pieces to update based on declining GSC performance

### 4.4 CMS Integration
**Priority: LOW | Impact: MEDIUM**

Publish content directly to the user's CMS.

**Implementation:**
- WordPress REST API (most common)
- Ghost API
- Markdown export for static site generators

---

## Phase 5: Competitive Intelligence (Web)

### 5.1 Competitor Website Analysis
**Priority: MEDIUM | Impact: MEDIUM**

Analyze competitor websites — not just their apps.

**Implementation:**
- Crawl competitor sites with our WebScraper
- Extract: content topics, heading structure, keyword targeting, schema markup
- Compare: content gaps (topics they cover that we don't)
- Feed into content planning

### 5.2 Backlink Monitoring
**Priority: LOW | Impact: MEDIUM**

Requires 3rd-party API — can't build our own link index.

**Options:**
- Ahrefs API ($200/mo minimum)
- Moz API (free tier available, limited)
- Majestic API
- Common Crawl (free, but requires significant processing)

**What we'd show:**
- Backlink count and quality
- New/lost backlinks over time
- Competitor backlink comparison
- Link building opportunity suggestions

---

## Unique ASOMARK Angle

What makes our SEO suite different from Semrush/Keytomic:

1. **ASO + SEO unified** — app store optimization AND web presence in one tool. No other tool does both.
2. **App-specific content strategy** — landing pages optimized for app install funnels (awareness → consideration → decision)
3. **Review mining → web content** — turn app review pain points into blog posts and FAQs
4. **Play Store ↔ Web keyword cross-pollination** — keywords that work in the store often work on web and vice versa
5. **Deep link optimization** — connect web pages to in-app screens for better engagement
6. **App schema markup** — SoftwareApplication schema for rich search results

---

## Implementation Priority Order

| # | Feature | Phase | Effort | Impact |
|---|---------|-------|--------|--------|
| 1 | Google Search Console Integration | 1.1 | Medium | Highest |
| 2 | Site Crawler / Technical Audit | 3.1 | Medium | High |
| 3 | AI Mention Tracking | 2.1 | Medium | High |
| 4 | AI Content Writer | 4.2 | Medium | High |
| 5 | Brand Profile Builder | 4.1 | Low | High |
| 6 | Google Analytics Integration | 1.2 | Medium | High |
| 7 | Content Performance Matching | 1.3 | Low | High |
| 8 | AI Sentiment Analysis | 2.2 | Low | Medium |
| 9 | AI Crawler Access Audit | 2.5 | Low | Medium |
| 10 | LLM.txt Generation | 2.4 | Low | Medium |
| 11 | Core Web Vitals Monitor | 3.2 | Low | Medium |
| 12 | Prompt-Based Content Planning | 2.3 | Medium | Medium |
| 13 | Content Freshness Monitor | 4.3 | Low | Medium |
| 14 | Competitor Website Analysis | 5.1 | Medium | Medium |
| 15 | Schema Validator | 3.3 | Low | Low |
| 16 | CMS Integration | 4.4 | Medium | Medium |
| 17 | Backlink Monitoring | 5.2 | Low (API cost) | Medium |

---

## References

- [Semrush: How to Do LLMO](https://www.semrush.com/blog/how-can-you-do-llmo/)
- [Semrush: LLM Optimization Guide](https://www.semrush.com/blog/llm-optimization/)
- [Semrush: AI Visibility](https://www.semrush.com/blog/ai-visibility/)
- [Semrush: Google AI Agent](https://www.semrush.com/blog/google-ai-agent/)
- [Semrush: AI Sentiment → Visibility](https://www.semrush.com/blog/turning-ai-sentiment-insights-into-visibility/)
- [Reddit: Keytomic AI SEO Agent](https://reddit.com) — 236K impressions in 3 months
- [Google Search Console API Guide](https://www.incremys.com/en/resources/blog/google-search-console-api)
