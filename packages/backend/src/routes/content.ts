/**
 * Brand Profile Builder + AI Content Writer routes.
 *
 * Brand Profile: Scrapes the user's website to extract brand identity
 * (tone, values, differentiators, voice) — feeds into all content generation.
 *
 * Content Writer: Takes a content plan outline and generates a full article
 * with semantic SEO, LLMO optimization, and brand-consistent voice.
 */
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { projects } from '../db/schema/projects.js';
import { seoContentPlans } from '../db/schema/seo.js';
import { llm } from '../lib/llm.js';
import { WebScraper } from '../scrapers/web.js';
import { auditCrawlerAccess, generateLlmTxt } from '../lib/crawler-audit.js';

const webScraper = new WebScraper();

export async function contentRoutes(app: FastifyInstance) {
  // ─── Brand Profile ───

  /** Build brand profile from website */
  app.post('/api/projects/:id/brand-profile', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { url?: string };

    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const url = body.url || project.websiteUrl;
    if (!url) return reply.status(400).send({ error: 'url is required' });

    // Scrape homepage
    let pageData;
    try {
      pageData = await webScraper.fetchPage(url);
    } catch (err) {
      return reply.status(400).send({ error: `Failed to fetch ${url}: ${(err as Error).message}` });
    }

    // Use LLM to extract brand profile
    const result = await llm(
      [{ role: 'user', content: `Analyze this website and extract the brand profile.

## Website: ${url}
## Title: ${pageData.title}
## Meta Description: ${pageData.description}
## Page Content (first 3000 chars):
${pageData.text.slice(0, 3000)}

## App Context (if available):
- App Name: ${project.name}
- Description: ${project.appDescription ?? 'Not provided'}
- Key Features: ${(project.keyFeatures as string[])?.join(', ') ?? 'Not provided'}
- Target Audience: ${project.targetAudience ?? 'Not provided'}
- Category: ${project.category ?? 'Not provided'}

## Extract:
1. **tone**: The overall tone of the brand (e.g., "professional yet friendly", "casual and approachable", "technical and authoritative"). One short phrase.
2. **values**: 3-5 core brand values (e.g., ["privacy-first", "simplicity", "transparency"])
3. **differentiators**: 3-5 things that make this brand/app different from competitors
4. **tagline**: A short tagline that captures the brand essence (create one if not found)
5. **brandVoice**: A 1-2 sentence description of how the brand should "speak" in content (e.g., "Write as a knowledgeable friend who explains financial concepts simply, never talks down to the reader, and uses concrete examples")
6. **contentThemes**: 5-8 content themes/topics the brand should write about based on their positioning

Respond with JSON only:
{
  "tone": "...",
  "values": ["...", "..."],
  "differentiators": ["...", "..."],
  "tagline": "...",
  "brandVoice": "...",
  "contentThemes": ["...", "..."]
}` }],
      { maxTokens: 2048, temperature: 0.5 },
    );

    // Parse response
    let profile;
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      profile = JSON.parse(jsonMatch?.[0] ?? '{}');
    } catch {
      return reply.status(500).send({ error: 'Failed to parse brand profile from LLM response' });
    }

    // Save to project
    await db
      .update(projects)
      .set({
        websiteUrl: url,
        brandProfile: profile,
      })
      .where(eq(projects.id, id));

    return profile;
  });

  /** Get brand profile */
  app.get('/api/projects/:id/brand-profile', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    return {
      websiteUrl: project.websiteUrl,
      profile: project.brandProfile,
    };
  });

  // ─── Content Writer ───

  /** Generate a full article from a content plan outline */
  app.post('/api/projects/:id/content/generate', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { planId } = request.body as { planId: string };

    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const [plan] = await db.select().from(seoContentPlans).where(eq(seoContentPlans.id, planId));
    if (!plan) return reply.status(404).send({ error: 'Content plan not found' });

    const brandProfile = project.brandProfile as {
      tone?: string;
      values?: string[];
      brandVoice?: string;
      tagline?: string;
    } | null;

    const targetKeywords = (plan.targetKeywords as string[]) ?? [];
    const metadata = plan.metadata as { searchIntent?: string; competitiveAngle?: string } | null;

    const result = await llm(
      [{ role: 'user', content: `Write a complete, publish-ready article based on this content plan.

## Article Details
- **Title**: ${plan.title}
- **Content Type**: ${plan.contentType}
- **Target Keywords**: ${targetKeywords.join(', ')}
- **Search Intent**: ${metadata?.searchIntent ?? 'informational'}
- **Competitive Angle**: ${metadata?.competitiveAngle ?? 'N/A'}
- **Priority**: ${plan.priority}

## Outline
${plan.outline ?? 'No outline provided — create a logical structure based on the title and keywords.'}

## Brand Context
- **App Name**: ${project.name}
- **Brand Tone**: ${brandProfile?.tone ?? 'professional and helpful'}
- **Brand Voice**: ${brandProfile?.brandVoice ?? 'Write clearly and helpfully'}
- **Brand Values**: ${brandProfile?.values?.join(', ') ?? 'quality, simplicity'}

## Writing Requirements

### SEO Optimization
- Use the primary keyword in the first paragraph, one H2, and naturally throughout
- Include secondary keywords in subheadings where natural
- Write a compelling meta description (120-160 chars) at the end
- Use H2 and H3 subheadings every 200-300 words
- Include internal linking suggestions (placeholder: [LINK: topic])

### LLMO Optimization (for AI Search Citations)
- Write self-contained paragraphs that can stand alone as answers
- Include clear definitions and explanations AI can extract
- Use structured formats: numbered lists, comparison tables, FAQ sections
- Include specific data points, statistics, or concrete examples
- Answer the "People Also Ask" questions related to this topic

### Content Quality
- Target 1500-2500 words for blog posts, 800-1200 for landing pages
- Include a compelling introduction that hooks the reader
- End with a clear call-to-action related to the app
- Use the brand voice consistently throughout
- NO generic filler — every paragraph should add value

## Output Format
Write the article in markdown. At the end, include:
- **Meta Description**: (120-160 chars)
- **Internal Link Suggestions**: list of [LINK: topic] references used
- **Primary Keyword Density**: estimated percentage` }],
      { maxTokens: 8192, temperature: 0.7 },
    );

    // Update content plan status
    await db
      .update(seoContentPlans)
      .set({
        status: 'in_progress',
        outline: result.content, // Store generated article as the "outline" (overwrite with full content)
        updatedAt: new Date(),
      })
      .where(eq(seoContentPlans.id, planId));

    return {
      article: result.content,
      tokensUsed: {
        input: result.inputTokens,
        output: result.outputTokens,
      },
    };
  });

  // ─── AI Crawler Access Audit ───

  /** Check if AI crawlers can access the website */
  app.post('/api/projects/:id/crawler-audit', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { url?: string };

    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const url = body.url || project.websiteUrl;
    if (!url) return reply.status(400).send({ error: 'url is required' });

    const result = await auditCrawlerAccess(url);
    return result;
  });

  // ─── LLM.txt Generator ───

  /** Generate an llm.txt file for the website */
  app.post('/api/projects/:id/llm-txt', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const brandProfileData = project.brandProfile as {
      tone?: string;
      values?: string[];
      tagline?: string;
      contentThemes?: string[];
    } | null;

    const content = generateLlmTxt({
      siteName: project.name,
      siteUrl: project.websiteUrl ?? '',
      description: project.appDescription ?? `${project.name} - ${project.category ?? 'App'}`,
      appName: project.name,
      appDescription: project.appDescription ?? undefined,
      keyFeatures: (project.keyFeatures as string[]) ?? undefined,
      targetAudience: project.targetAudience ?? undefined,
      brandProfile: brandProfileData,
      contentThemes: brandProfileData?.contentThemes,
    });

    return { content };
  });
}
