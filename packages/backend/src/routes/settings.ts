import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { settings } from '../db/schema/settings.js';
import { inArray } from 'drizzle-orm';
import { invalidateApiKeyCache } from '../lib/llm.js';

const API_KEY_KEYS = ['anthropic_api_key', 'openai_api_key', 'openrouter_api_key'] as const;
type ApiKeyKey = (typeof API_KEY_KEYS)[number];

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••';
  return '••••••••' + key.slice(-4);
}

export async function settingsRoutes(app: FastifyInstance) {
  // GET /api/settings — returns masked API key values
  app.get('/api/settings', async () => {
    try {
      const rows = await db
        .select()
        .from(settings)
        .where(inArray(settings.key, [...API_KEY_KEYS]));

      const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

      return {
        anthropic_api_key: map['anthropic_api_key'] ? maskKey(map['anthropic_api_key']) : null,
        openai_api_key: map['openai_api_key'] ? maskKey(map['openai_api_key']) : null,
        openrouter_api_key: map['openrouter_api_key'] ? maskKey(map['openrouter_api_key']) : null,
      };
    } catch {
      // Table may not exist yet (migration not applied)
      return {
        anthropic_api_key: null,
        openai_api_key: null,
        openrouter_api_key: null,
      };
    }
  });

  // PATCH /api/settings — save API keys (empty string = delete the key)
  app.patch<{ Body: Partial<Record<ApiKeyKey, string>> }>(
    '/api/settings',
    async (request, reply) => {
      const body = request.body ?? {};

      for (const key of API_KEY_KEYS) {
        if (!(key in body)) continue;
        const value = body[key]?.trim() ?? '';
        if (!value) {
          await db.delete(settings).where(inArray(settings.key, [key]));
        } else {
          await db
            .insert(settings)
            .values({ key, value, updatedAt: new Date() })
            .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
        }
      }

      invalidateApiKeyCache();
      return reply.code(204).send();
    },
  );
}
