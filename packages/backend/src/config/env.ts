import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../../.env') });

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // AI / LLM (at least one required for agents)
  OPENROUTER_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // Server
  BACKEND_PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // File Storage
  STORAGE_PATH: z.string().default('./storage'),

  // Google Play Developer API (optional)
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: z.string().optional(),
  GOOGLE_PLAY_DEVELOPER_ID: z.string().optional(),

  // App Store Connect API (optional)
  APP_STORE_CONNECT_KEY_ID: z.string().optional(),
  APP_STORE_CONNECT_ISSUER_ID: z.string().optional(),
  APP_STORE_CONNECT_PRIVATE_KEY_PATH: z.string().optional(),

  // Apple Search Ads (optional)
  APPLE_SEARCH_ADS_CLIENT_ID: z.string().optional(),
  APPLE_SEARCH_ADS_CLIENT_SECRET: z.string().optional(),

  // Notifications (optional)
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  DISCORD_WEBHOOK_URL: z.string().url().optional().or(z.literal('')).transform((v) => v || undefined),

  // Proxy (optional)
  PROXY_URL: z.string().url().optional().or(z.literal('')).transform((v) => v || undefined),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('Invalid environment variables:');
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return parsed.data;
}

export const env = validateEnv();
