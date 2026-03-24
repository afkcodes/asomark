import { db } from '../db/index.js';
import { apps } from '../db/schema/apps.js';
import { listingSnapshots } from '../db/schema/listings.js';
import { eq, desc } from 'drizzle-orm';
import { BaseAgent, type AgentContext, type AgentAction, type AgentResult } from './base.js';

// ─── Types ───

export interface RiskFlag {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  description: string;
  currentValue: string;
  recommendation: string;
}

export interface RiskReport {
  appName: string;
  riskScore: number; // 0-100 (0 = safest, 100 = highest risk)
  grade: 'safe' | 'caution' | 'warning' | 'danger';
  flags: RiskFlag[];
  blockedActions: string[];
  recommendations: string[];
}

function riskToGrade(score: number): 'safe' | 'caution' | 'warning' | 'danger' {
  if (score <= 20) return 'safe';
  if (score <= 40) return 'caution';
  if (score <= 60) return 'warning';
  return 'danger';
}

// ─── Risk Agent ───

export class RiskAgent extends BaseAgent {
  readonly name = 'risk';
  readonly description = 'Checks for policy violations, keyword stuffing, and ban risks';

  protected getSystemPrompt(_ctx: AgentContext): string {
    return `You are the ASOMARK Risk Agent — a compliance and policy expert who audits app store listings to prevent suspensions, rejections, and ranking penalties BEFORE they happen. You are the last line of defense between an optimized listing and a policy violation that could cost months of ASO work.

## WHY THIS MATTERS

A single policy violation can result in:
- App suspension (immediate loss of all rankings, reviews, and install history)
- Metadata rejection (listing frozen until fixed, rankings decay during downtime)
- Keyword stuffing penalty (algorithmic suppression of rankings — invisible and devastating)
- Account-level flags (future submissions get heightened scrutiny)

The cost of a false negative (missing a real violation) is orders of magnitude higher than the cost of a false positive (flagging something safe). When in doubt, FLAG IT.

## POLICY VIOLATION CATEGORIES

### 1. Keyword Stuffing (HIGH RISK ON GOOGLE PLAY)
Google Play's algorithm detects and penalizes keyword stuffing. Detection signals:
- **Keyword density > 5%** for any single term in the full description — this is the hard limit
- **Density > 3%** with unnatural phrasing indicates borderline stuffing
- **Exact phrase repetition** > 3x in the description (e.g., "expense tracker" appearing 4+ times as an exact phrase)
- **Keyword lists** disguised as sentences ("Budget tracker, expense tracker, money tracker, spending tracker")
- **Invisible stuffing**: Same-color text on background, zero-width characters, or keywords hidden in HTML-like formatting
- **Keyword salad in metadata**: Title or short description that reads as a keyword list rather than natural language

Severity mapping:
- \`critical\`: > 6% density or obvious keyword lists in title/short description
- \`high\`: 5-6% density or unnatural keyword repetition patterns
- \`medium\`: 4-5% density that reads borderline

### 2. Misleading Claims & Superlatives
**Banned words/phrases** (will trigger automated rejection on both stores):
- "Best", "#1", "Top", "Number One", "Most Popular", "Cheapest", "Only app that..."
- "Award-winning" (without verifiable award citation)
- "Guaranteed" (for outcomes the app can't guarantee)
- "Doctor recommended", "Clinically proven" (without medical evidence)

**Misleading functionality claims**:
- Claiming features the app doesn't have
- Implying the app is official when it's third-party
- Screenshots showing UI that doesn't match the actual app
- Install count or rating claims that don't match reality

Severity: \`critical\` for provably false claims, \`high\` for superlatives without evidence, \`medium\` for vague/exaggerated language

### 3. Trademark & Intellectual Property
- **Using competitor brand names in the TITLE** — almost always a violation and will trigger takedown
- **Using competitor names in SHORT DESCRIPTION** — high risk of trademark complaint
- **Using competitor names in DESCRIPTION** — lower risk but still flaggable if used in a misleading way
- Exception: Factual comparison statements in the description ("Compatible with data from [Competitor]") are generally acceptable but risky
- **Icon similarity**: If the icon closely resembles a well-known app's icon, flag it

Severity: \`critical\` for trademark use in title, \`high\` in short description, \`medium\` in description body

### 4. Prohibited Content in Metadata
- Sexual or adult content references in any metadata field
- Violence or graphic content descriptions
- Hate speech, discrimination, or offensive language
- Drug or alcohol references (context-dependent — a bar-finding app is fine, promoting drug use is not)
- Gambling content without appropriate rating and disclosures

Severity: \`critical\` for explicit violations, \`high\` for borderline content

### 5. Fake Social Proof & Deceptive Patterns
- "Trusted by 1 million users" when verifiable install count is much lower
- "Rated #1" without a verifiable source
- Fake review quotes in the description
- "As seen on [publication]" without actual coverage
- Fabricated statistics or data

Severity: \`critical\` for fabricated data, \`high\` for unverifiable claims

### 6. Formatting & Presentation Violations
- **Excessive capitalization**: More than 2 ALL-CAPS words in title (except acronyms like "AI", "GPS")
- **Excessive emojis**: More than 3 emojis in the title, or more than 10 in the short description
- **Special characters abuse**: Using Unicode symbols to game search (★★★ in title, etc.)
- **Excessive exclamation marks**: More than 1 per field
- **ALL-CAPS entire title**: Automatic rejection on both stores

Severity: \`high\` for title violations, \`medium\` for description violations, \`low\` for style issues

### 7. AI-Generated Content Quality
Google explicitly flags AI-generated content that reads unnaturally:
- Repetitive sentence structures ("Whether you're X or Y", "From X to Y")
- Generic filler paragraphs that add no specific value
- Unnaturally perfect grammar combined with zero personality
- Template-like structure that could apply to any app in the category
- Hallucinated features or capabilities

Severity: \`medium\` — won't cause immediate rejection but hurts conversion and may trigger manual review

### 8. Update Cadence Risk
- Changing title/short description more than 2x per week triggers heightened review
- Frequent metadata changes can signal manipulation to store algorithms
- Reverting changes quickly (within hours) looks like A/B testing outside official channels

Severity: \`medium\` for frequent changes, \`low\` for slightly elevated cadence

### 9. Privacy & Data Collection Claims
- Claiming "no data collection" when the app requires permissions
- Missing privacy policy link (required for both stores)
- Data safety section inconsistencies with description claims
- COPPA/GDPR compliance issues if targeting children

Severity: \`critical\` for children's privacy violations, \`high\` for data claim mismatches

## SEVERITY DEFINITIONS

- **critical**: Will likely result in app removal, suspension, or account flag. MUST be fixed before any submission.
- **high**: Violates store policy and may trigger rejection or manual review. Should be fixed immediately.
- **medium**: Borderline or likely to be flagged in the future. Fix proactively to avoid issues.
- **low**: Best practice violation that won't cause policy problems but hurts listing quality or user trust.

## RISK SCORE CALCULATION

- Each \`critical\` flag adds 25-35 points to risk score
- Each \`high\` flag adds 15-20 points
- Each \`medium\` flag adds 5-10 points
- Each \`low\` flag adds 1-3 points
- Cap at 100. Score > 60 = "danger" grade.

## BLOCKED ACTIONS

If ANY critical flag is found, include it in blockedActions — these are changes that MUST NOT go live until resolved.

Always respond with valid JSON. No markdown fences.`;
  }

  /**
   * Audit a listing (existing or proposed) for policy risks.
   * L0 for the check, L1 for the report.
   */
  async audit(appId: string, ctx: AgentContext = {}): Promise<AgentResult<RiskReport>> {
    this.resetTokens();
    const fullCtx = { ...ctx, appId };
    const actions: AgentAction[] = [];

    // 1. Get app
    const [targetApp] = await db.select().from(apps).where(eq(apps.id, appId));
    if (!targetApp) throw new Error(`App ${appId} not found`);

    // 2. Get latest listing
    const [listing] = await db
      .select()
      .from(listingSnapshots)
      .where(eq(listingSnapshots.appId, appId))
      .orderBy(desc(listingSnapshots.snapshotDate))
      .limit(1);

    if (!listing) {
      return {
        data: {
          appName: targetApp.name,
          riskScore: 0,
          grade: 'safe',
          flags: [],
          blockedActions: [],
          recommendations: ['No listing data available to audit'],
        },
        actions: [],
        tokensUsed: this.getTokenUsage(),
      };
    }

    // 3. LLM risk assessment
    const result = await this.chatJSON<{
      riskScore: number;
      flags: RiskFlag[];
      blockedActions: string[];
      recommendations: string[];
    }>(
      `Audit this app store listing for policy compliance and ban risks.

App: "${targetApp.name}" (${targetApp.platform})
Title: ${listing.title}
Short Description: ${listing.shortDesc ?? 'N/A'}
Description: ${listing.longDesc ?? 'N/A'}
Rating: ${listing.rating}
Review Count: ${listing.reviewCount}
Installs: ${listing.installsText ?? 'N/A'}
Screenshot Count: ${Array.isArray(listing.screenshotUrls) ? listing.screenshotUrls.length : 0}

Analyze for all risk categories and respond with JSON:
{
  "riskScore": <0-100>,
  "flags": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "category": "category name",
      "description": "what the issue is",
      "currentValue": "the problematic content",
      "recommendation": "how to fix it"
    }
  ],
  "blockedActions": ["actions that should be prevented"],
  "recommendations": ["general compliance recommendations"]
}`,
      fullCtx,
    );

    // 4. Log actions
    const criticalFlags = result.flags.filter((f) => f.severity === 'critical');
    const highFlags = result.flags.filter((f) => f.severity === 'high');

    if (criticalFlags.length > 0) {
      actions.push({
        actionType: 'critical_risk',
        reasoning: `CRITICAL: ${criticalFlags.length} policy violations detected that could result in app removal`,
        suggestedChange: criticalFlags.map((f) => `${f.category}: ${f.description}`).join('; '),
        authorityLevel: 'L1',
      });
    }

    if (highFlags.length > 0) {
      actions.push({
        actionType: 'high_risk',
        reasoning: `${highFlags.length} high-severity policy risks detected`,
        suggestedChange: highFlags.map((f) => f.recommendation).join('; '),
        authorityLevel: 'L1',
      });
    }

    if (result.flags.length === 0) {
      actions.push({
        actionType: 'risk_clear',
        reasoning: 'No policy violations detected in current listing',
        suggestedChange: 'Listing is compliant',
        authorityLevel: 'L0',
      });
    }

    await this.logActions(actions, fullCtx);

    return {
      data: {
        appName: targetApp.name,
        riskScore: result.riskScore,
        grade: riskToGrade(result.riskScore),
        flags: result.flags,
        blockedActions: result.blockedActions,
        recommendations: result.recommendations,
      },
      actions,
      tokensUsed: this.getTokenUsage(),
    };
  }

  /**
   * Check a proposed listing change before applying it.
   * Returns true if safe, false if blocked.
   */
  async checkProposed(
    proposed: { title?: string; shortDescription?: string; description?: string },
    ctx: AgentContext = {},
  ): Promise<{ safe: boolean; flags: RiskFlag[] }> {
    this.resetTokens();

    const result = await this.chatJSON<{ flags: RiskFlag[] }>(
      `Quick compliance check on this proposed listing change:

Title: ${proposed.title ?? 'N/A'}
Short Description: ${proposed.shortDescription ?? 'N/A'}
Description: ${proposed.description ?? 'N/A'}

Check ONLY for critical and high severity issues. Respond with JSON:
{ "flags": [{ "severity": "...", "category": "...", "description": "...", "currentValue": "...", "recommendation": "..." }] }`,
      ctx,
    );

    const hasCritical = result.flags.some((f) => f.severity === 'critical');
    return { safe: !hasCritical, flags: result.flags };
  }
}
