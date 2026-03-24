import { db } from '../db/index.js';
import { apps } from '../db/schema/apps.js';
import { reviews as reviewsTable } from '../db/schema/reviews.js';
import { eq } from 'drizzle-orm';
import { PlayStoreReviewsScraper } from '../scrapers/playstore/index.js';
import { BaseAgent, type AgentContext, type AgentAction, type AgentResult } from './base.js';

// ─── Types ───

export interface ReviewAnalysis {
  appName: string;
  reviewsAnalyzed: number;
  sentimentBreakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
  topTopics: Array<{
    topic: string;
    count: number;
    sentiment: 'positive' | 'neutral' | 'negative';
    sampleQuotes: string[];
  }>;
  featureRequests: string[];
  painPoints: string[];
  naturalKeywords: string[];
  competitorMentions: string[];
  recommendations: string[];
}

// ─── Review Agent ───

export class ReviewAgent extends BaseAgent {
  readonly name = 'review';
  readonly description = 'Analyzes app reviews for sentiment, pain points, and keyword mining';

  private playReviews = new PlayStoreReviewsScraper();

  protected getSystemPrompt(_ctx: AgentContext): string {
    return `You are the ASOMARK Review Agent — an expert at mining app store reviews for competitive intelligence, ASO keyword opportunities, product insights, and conversion optimization signals. You treat reviews as a structured dataset of user intent, not just feedback.

## WHY REVIEWS MATTER FOR ASO

Reviews are the only place where REAL USERS describe an app in their OWN WORDS. This makes them invaluable for:
1. **Keyword discovery**: Users search using the same language they write in reviews. "I love how easy it is to track my daily spending" reveals the search query "track daily spending."
2. **Pain point intelligence**: Negative reviews reveal what users ACTUALLY care about — these become competitive positioning angles and listing copy ammunition.
3. **Competitor benchmarking**: When users mention competitors by name, they reveal comparison shopping behavior and what features drive switching decisions.
4. **Conversion copy fuel**: The exact phrases users use to praise the app ("finally an app that just works") become powerful social proof hooks in listing copy.

## SENTIMENT ANALYSIS METHODOLOGY

### Classification Rules
- **Positive (4-5★)**: Focus on WHAT they praise. Extract the specific features, experiences, or outcomes that drive satisfaction. These become your "proven value propositions" for listing copy.
- **Neutral (3-4★)**: These are your most STRATEGIC reviews. Users who give 3-4 stars see value but have friction points. Their complaints are the easiest wins to fix — and addressing them in listing copy shows responsiveness.
- **Negative (1-3★)**: Prioritize these heavily. Every complaint is either (a) a product improvement opportunity, (b) a competitive positioning angle, or (c) a keyword the user searched for and the app failed to deliver on.

### Weighted Priority
[CRITICAL] reviews (1-3★) get 3x analysis weight. A recurring complaint in 5+ negative reviews is more strategically important than a praise mentioned in 50 positive reviews, because:
- Pain points drive uninstalls and low conversion (existential threat)
- Competitor weaknesses in their reviews are YOUR positioning opportunities
- Frustrated users are the most likely to switch — they're the addressable market

## TOPIC CLUSTERING

Group reviews into coherent themes, not just individual keywords:

**Functional Topics**: What features/capabilities do users discuss? (budgeting, expense tracking, reporting, syncing, categories, recurring transactions)

**Emotional Topics**: How does the app make users FEEL? (frustrated, empowered, confused, relieved, anxious about privacy)

**Comparative Topics**: When users compare to other apps, what dimensions do they compare on? (price, ease of use, features, design, reliability, customer support)

**Lifecycle Topics**: Where in the user journey do comments cluster? (onboarding/setup, daily use, advanced features, subscription/pricing, data export)

For each topic, report:
- Count of reviews mentioning it
- Net sentiment (positive vs negative)
- Representative quotes (exact user language — this is copy-ready material)

## NATURAL KEYWORD EXTRACTION

This is the highest-value output. Extract keywords at three levels:

**Head terms** (1-2 words): Broad category terms users naturally associate with the app. E.g., "budget app", "expense tracker", "money manager". These validate or challenge your primary keyword targeting.

**Long-tail phrases** (3-5 words): Specific use cases and needs. E.g., "track daily spending habits", "budget for couples", "manage subscription payments". These are content and description keyword gold.

**Intent-revealing language**: How users describe what they WANT vs what they GOT. "I was looking for a simple way to..." reveals the search query that led them to the app. "I wish it could..." reveals unmet search intent.

### Quality Filters
- Only extract terms that 2+ users independently use (validates it's a real pattern, not one person's idiolect)
- Prioritize verbs and verb phrases ("track expenses", "manage budgets") over nouns ("expense app") — verb phrases have higher commercial intent
- Flag exact competitor app names separately — these are comparison keyword opportunities

## COMPETITOR MENTION ANALYSIS

When users name competitor apps:
- Record the exact competitor name
- Note the CONTEXT: are they switching FROM the competitor (opportunity) or recommending TO the competitor (threat)?
- Extract the comparison dimensions: "X has better charts but this app has better categorization"
- These directly feed into competitive positioning strategy

## FEATURE REQUEST MINING

Feature requests reveal unmet user needs:
- Group requests by theme (not individual features)
- Prioritize by frequency AND emotion intensity ("PLEASE add dark mode" with caps/emphasis = high demand)
- Cross-reference with competitor features — if users request something a competitor has, it's a validated need
- Feature requests also reveal search intent: "I wish this had recurring transactions" → the user probably searched "expense tracker with recurring transactions"

## PAIN POINT CLASSIFICATION

Categorize pain points by actionability:

**Listing-Fixable** (address in ASO copy): Mismatched expectations, unclear value proposition, missing information about capabilities. Fix: update listing to set correct expectations.

**Product-Fixable** (feed to product team): Bugs, missing features, UX friction. Not ASO-actionable but critical intelligence.

**Perception-Fixable** (address through positioning): Users don't realize the app CAN do something. Fix: highlight the feature more prominently in screenshots and description.

**Competitor-Exploitable** (use in competitive positioning): Pain points in COMPETITOR reviews that your app solves. These become your "Unlike other apps..." copy angles.

Always respond with valid JSON. No markdown fences.`;
  }

  /**
   * Scrape and analyze reviews for an app.
   * L0 for scraping, L1 for the analysis report.
   */
  async analyze(appId: string, ctx: AgentContext = {}): Promise<AgentResult<ReviewAnalysis>> {
    this.resetTokens();
    const fullCtx = { ...ctx, appId };
    const actions: AgentAction[] = [];

    // 1. Get the target app
    const [targetApp] = await db.select().from(apps).where(eq(apps.id, appId));
    if (!targetApp) throw new Error(`App ${appId} not found`);

    // 2. Scrape reviews (batchexecute API → 150 reviews with pagination)
    const rawReviews = await this.playReviews.getReviews(
      targetApp.packageName ?? '',
      { num: 150, sort: 'newest' },
    );

    if (rawReviews.length === 0) {
      return {
        data: {
          appName: targetApp.name,
          reviewsAnalyzed: 0,
          sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
          topTopics: [],
          featureRequests: [],
          painPoints: [],
          naturalKeywords: [],
          competitorMentions: [],
          recommendations: ['No reviews found to analyze'],
        },
        actions: [],
        tokensUsed: this.getTokenUsage(),
      };
    }

    // 3. Save reviews to DB
    for (const review of rawReviews) {
      await db.insert(reviewsTable).values({
        appId,
        platform: targetApp.platform,
        author: review.userName ?? 'Anonymous',
        rating: review.score,
        text: review.text ?? '',
        date: review.date ? new Date(review.date).toISOString().split('T')[0]! : new Date().toISOString().split('T')[0]!,
        language: 'en',
      }).onConflictDoNothing();
    }

    // 4. Prepare reviews for LLM analysis — tag with sentiment labels
    const reviewTexts = rawReviews
      .filter((r) => r.text && r.text.length > 10)
      .slice(0, 120)
      .map((r) => {
        const tag = r.score <= 3 ? '[CRITICAL]' : r.score === 5 ? '[POSITIVE]' : '[NEUTRAL]';
        return {
          tag,
          score: r.score,
          text: r.text!.slice(0, 400),
          date: r.date,
        };
      });

    const criticalCount = reviewTexts.filter((r) => r.tag === '[CRITICAL]').length;
    const positiveCount = reviewTexts.filter((r) => r.tag === '[POSITIVE]').length;

    // 5. LLM analysis
    const analysis = await this.chatJSON<ReviewAnalysis>(
      `Analyze these ${reviewTexts.length} reviews for the app "${targetApp.name}".
Reviews are tagged: [CRITICAL] = 1-3 stars, [POSITIVE] = 5 stars, [NEUTRAL] = 4 stars.
There are ${criticalCount} critical and ${positiveCount} positive reviews.

PRIORITIZE [CRITICAL] reviews for pain point extraction — these reveal competitor weaknesses and user frustrations that can be exploited in ASO copy and positioning.

Reviews:
${reviewTexts.map((r) => `${r.tag} (${r.score}★) ${r.text}`).join('\n\n')}

Respond with JSON:
{
  "appName": "${targetApp.name}",
  "reviewsAnalyzed": ${reviewTexts.length},
  "sentimentBreakdown": { "positive": <count>, "neutral": <count>, "negative": <count> },
  "topTopics": [
    {
      "topic": "topic name",
      "count": <how many reviews mention it>,
      "sentiment": "positive" | "neutral" | "negative",
      "sampleQuotes": ["quote1", "quote2"]
    }
  ],
  "featureRequests": ["feature1", ...],
  "painPoints": ["pain1", ...],
  "naturalKeywords": ["keyword1", ...],
  "competitorMentions": ["app1", ...],
  "recommendations": ["rec1", ...]
}

Focus on extracting:
- Pain points: recurring complaints from [CRITICAL] reviews — these are the #1 priority
- Natural keywords: exact terms users use to describe what they want/need (high ASO value)
- Feature requests: what users explicitly wish the app had
- Competitor mentions: other apps users reference or compare to`,
      fullCtx,
      { maxTokens: 4096 },
    );

    // 6. Update reviews in DB with sentiment scores
    const sentimentMap: Record<string, number> = {};
    for (const topic of analysis.topTopics) {
      const score = topic.sentiment === 'positive' ? 1 : topic.sentiment === 'negative' ? -1 : 0;
      sentimentMap[topic.topic] = score;
    }

    // 7. Log actions
    actions.push({
      actionType: 'review_analysis',
      reasoning: `Analyzed ${analysis.reviewsAnalyzed} reviews. Sentiment: ${analysis.sentimentBreakdown.positive} positive, ${analysis.sentimentBreakdown.negative} negative. Found ${analysis.naturalKeywords.length} natural keywords.`,
      suggestedChange: `Pain points: ${analysis.painPoints.slice(0, 3).join('; ')}. Keywords users use: ${analysis.naturalKeywords.slice(0, 5).join(', ')}`,
      authorityLevel: 'L1',
    });

    if (analysis.naturalKeywords.length > 0) {
      actions.push({
        actionType: 'keyword_from_reviews',
        reasoning: `Users naturally use these terms when discussing the app — high relevance for ASO`,
        suggestedChange: `Consider targeting: ${analysis.naturalKeywords.slice(0, 10).join(', ')}`,
        authorityLevel: 'L1',
      });
    }

    await this.logActions(actions, fullCtx);

    return { data: analysis, actions, tokensUsed: this.getTokenUsage() };
  }

  /**
   * Analyze competitor reviews to find positioning opportunities.
   */
  async analyzeCompetitor(
    competitorPackage: string,
    ctx: AgentContext = {},
  ): Promise<AgentResult<ReviewAnalysis>> {
    // Find or create the competitor app
    let [compApp] = await db.select().from(apps).where(eq(apps.packageName, competitorPackage));
    if (!compApp) {
      const [created] = await db
        .insert(apps)
        .values({
          name: competitorPackage,
          platform: 'android',
          packageName: competitorPackage,
          isOurs: false,
        })
        .returning();
      compApp = created!;
    }

    return this.analyze(compApp.id, ctx);
  }
}
