import type { FastifyInstance } from 'fastify';
import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { projects, projectCompetitors } from '../db/schema/projects.js';
import { apps } from '../db/schema/apps.js';
import { aiVisibilityChecks, aiVisibilityPrompts } from '../db/schema/ai-visibility.js';
import { checkMention, generateDefaultPrompts } from '../lib/ai-visibility.js';

export async function aiVisibilityRoutes(app: FastifyInstance) {
  /** Get all prompts for a project */
  app.get('/api/projects/:id/ai-visibility/prompts', async (request) => {
    const { id } = request.params as { id: string };
    const prompts = await db
      .select()
      .from(aiVisibilityPrompts)
      .where(eq(aiVisibilityPrompts.projectId, id))
      .orderBy(aiVisibilityPrompts.category);
    return { data: prompts };
  });

  /** Generate default prompts for a project */
  app.post('/api/projects/:id/ai-visibility/generate-prompts', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const seeds = (project.seedKeywords as string[]) ?? [];
    const category = project.category ?? 'Finance';
    const prompts = generateDefaultPrompts(project.name, category, seeds);

    let saved = 0;
    for (const prompt of prompts) {
      try {
        await db
          .insert(aiVisibilityPrompts)
          .values({
            projectId: id,
            prompt,
            category: prompt.includes('alternative') || prompt.includes('Compare')
              ? 'comparison'
              : prompt.includes('What do you know') || prompt.includes('Is ')
                ? 'brand'
                : 'recommendation',
          })
          .onConflictDoNothing();
        saved++;
      } catch {
        // Skip duplicates
      }
    }

    return { generated: prompts.length, saved };
  });

  /** Add a custom prompt */
  app.post('/api/projects/:id/ai-visibility/prompts', async (request) => {
    const { id } = request.params as { id: string };
    const { prompt, category } = request.body as { prompt: string; category?: string };

    const [row] = await db
      .insert(aiVisibilityPrompts)
      .values({
        projectId: id,
        prompt,
        category: (category as 'recommendation' | 'comparison' | 'brand' | 'feature') ?? 'recommendation',
      })
      .returning();

    return row;
  });

  /** Delete a prompt */
  app.delete('/api/projects/:id/ai-visibility/prompts/:promptId', async (request) => {
    const { promptId } = request.params as { id: string; promptId: string };
    await db.delete(aiVisibilityPrompts).where(eq(aiVisibilityPrompts.id, promptId));
    return { success: true };
  });

  /** Run AI visibility check — query LLMs with all active prompts */
  app.post('/api/projects/:id/ai-visibility/check', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    // Get prompts
    let prompts = await db
      .select()
      .from(aiVisibilityPrompts)
      .where(eq(aiVisibilityPrompts.projectId, id));

    // Auto-generate if none exist
    if (prompts.length === 0) {
      const seeds = (project.seedKeywords as string[]) ?? [];
      const category = project.category ?? 'Finance';
      const defaultPrompts = generateDefaultPrompts(project.name, category, seeds);

      for (const prompt of defaultPrompts) {
        try {
          await db.insert(aiVisibilityPrompts).values({
            projectId: id,
            prompt,
            category: 'recommendation',
          });
        } catch {
          // Skip
        }
      }

      prompts = await db
        .select()
        .from(aiVisibilityPrompts)
        .where(eq(aiVisibilityPrompts.projectId, id));
    }

    const activePrompts = prompts.filter((p) => p.isActive);
    if (activePrompts.length === 0) {
      return reply.status(400).send({ error: 'No active prompts' });
    }

    // Get competitor names for mention detection
    const competitors = await db
      .select({ app: apps })
      .from(projectCompetitors)
      .innerJoin(apps, eq(projectCompetitors.competitorAppId, apps.id))
      .where(eq(projectCompetitors.projectId, id));

    const competitorNames = competitors.map((c) => c.app.name);

    // Run checks
    const results = [];
    for (const p of activePrompts) {
      try {
        const result = await checkMention(p.prompt, project.name, competitorNames);

        await db.insert(aiVisibilityChecks).values({
          projectId: id,
          prompt: result.prompt,
          platform: result.platform,
          response: result.response,
          mentioned: result.mentioned,
          sentiment: result.sentiment,
          position: result.position,
          competitors_mentioned: result.competitorsMentioned,
        });

        results.push(result);
      } catch (err) {
        console.error(`[ai-visibility] Failed for prompt "${p.prompt}":`, (err as Error).message);
        results.push({
          prompt: p.prompt,
          platform: 'unknown',
          response: `Error: ${(err as Error).message}`,
          mentioned: false,
          sentiment: 'neutral' as const,
          position: null,
          competitorsMentioned: [],
        });
      }

      // Rate limit between LLM calls
      await new Promise((r) => setTimeout(r, 500));
    }

    const mentioned = results.filter((r) => r.mentioned).length;
    return {
      checked: results.length,
      mentioned,
      mentionRate: results.length > 0 ? Math.round((mentioned / results.length) * 100) : 0,
      results,
    };
  });

  /** Get check history */
  app.get('/api/projects/:id/ai-visibility/history', async (request) => {
    const { id } = request.params as { id: string };
    const { limit: limitStr } = request.query as { limit?: string };
    const limit = parseInt(limitStr ?? '100', 10);

    const checks = await db
      .select()
      .from(aiVisibilityChecks)
      .where(eq(aiVisibilityChecks.projectId, id))
      .orderBy(desc(aiVisibilityChecks.checkedAt))
      .limit(limit);

    return { data: checks };
  });

  /** Get visibility stats summary */
  app.get('/api/projects/:id/ai-visibility/stats', async (request) => {
    const { id } = request.params as { id: string };

    const checks = await db
      .select()
      .from(aiVisibilityChecks)
      .where(eq(aiVisibilityChecks.projectId, id));

    if (checks.length === 0) return { hasData: false };

    const totalChecks = checks.length;
    const mentioned = checks.filter((c) => c.mentioned).length;
    const positive = checks.filter((c) => c.sentiment === 'positive').length;
    const negative = checks.filter((c) => c.sentiment === 'negative').length;
    const avgPosition = checks
      .filter((c) => c.position != null)
      .reduce((s, c) => s + (c.position ?? 0), 0) / (checks.filter((c) => c.position != null).length || 1);

    // Competitor mention frequency
    const compMentions = new Map<string, number>();
    for (const check of checks) {
      for (const comp of (check.competitors_mentioned as string[]) ?? []) {
        compMentions.set(comp, (compMentions.get(comp) ?? 0) + 1);
      }
    }

    return {
      hasData: true,
      totalChecks,
      mentionRate: Math.round((mentioned / totalChecks) * 100),
      sentimentBreakdown: { positive, neutral: totalChecks - positive - negative, negative },
      avgPosition: Math.round(avgPosition * 10) / 10,
      topCompetitors: Array.from(compMentions.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count })),
    };
  });
}
