/**
 * AI Crawler Access Audit + LLM.txt Generator.
 *
 * Checks if AI crawlers (GPTBot, Google-Extended, PerplexityBot, etc.)
 * can access the user's website by parsing robots.txt.
 *
 * Also generates an llm.txt file that tells AI crawlers about the site.
 */
import { request } from 'undici';

// ─── Known AI Crawlers ───

export const AI_CRAWLERS = [
  { name: 'GPTBot', agent: 'GPTBot', org: 'OpenAI', description: 'Powers ChatGPT search and browsing' },
  { name: 'ChatGPT-User', agent: 'ChatGPT-User', org: 'OpenAI', description: 'ChatGPT user-triggered browsing' },
  { name: 'Google-Extended', agent: 'Google-Extended', org: 'Google', description: 'Google AI training (Gemini, Bard)' },
  { name: 'Google-Agent', agent: 'Google-Agent', org: 'Google', description: 'Google AI agent (user-triggered)' },
  { name: 'Googlebot', agent: 'Googlebot', org: 'Google', description: 'Google Search indexing + AI Overviews' },
  { name: 'PerplexityBot', agent: 'PerplexityBot', org: 'Perplexity', description: 'Perplexity AI search' },
  { name: 'ClaudeBot', agent: 'ClaudeBot', org: 'Anthropic', description: 'Claude AI web access' },
  { name: 'Applebot-Extended', agent: 'Applebot-Extended', org: 'Apple', description: 'Apple Intelligence + Siri' },
  { name: 'Bytespider', agent: 'Bytespider', org: 'ByteDance', description: 'TikTok / ByteDance AI' },
  { name: 'CCBot', agent: 'CCBot', org: 'Common Crawl', description: 'Open dataset used by many AI models' },
] as const;

export interface CrawlerAccessResult {
  crawler: string;
  agent: string;
  org: string;
  description: string;
  allowed: boolean;
  rule: string | null; // The specific robots.txt rule affecting this crawler
}

export interface CrawlerAuditResult {
  url: string;
  robotsTxtFound: boolean;
  robotsTxtContent: string | null;
  crawlers: CrawlerAccessResult[];
  score: number; // 0-100, higher = more accessible
  summary: {
    allowed: number;
    blocked: number;
    total: number;
  };
}

/**
 * Fetch and parse robots.txt, check access for each AI crawler.
 */
export async function auditCrawlerAccess(siteUrl: string): Promise<CrawlerAuditResult> {
  const baseUrl = new URL(siteUrl);
  const robotsUrl = `${baseUrl.origin}/robots.txt`;

  let robotsTxtContent: string | null = null;
  let robotsTxtFound = false;

  try {
    const { body, statusCode } = await request(robotsUrl);
    const text = await body.text();
    if (statusCode === 200 && text.includes('User-agent')) {
      robotsTxtContent = text;
      robotsTxtFound = true;
    }
  } catch {
    // No robots.txt — all crawlers allowed by default
  }

  const crawlers: CrawlerAccessResult[] = AI_CRAWLERS.map((c) => {
    if (!robotsTxtFound || !robotsTxtContent) {
      return { crawler: c.name, agent: c.agent, org: c.org, description: c.description, allowed: true, rule: null };
    }

    const { allowed, rule } = checkRobotsTxt(robotsTxtContent, c.agent);
    return { crawler: c.name, agent: c.agent, org: c.org, description: c.description, allowed, rule };
  });

  const allowed = crawlers.filter((c) => c.allowed).length;
  const blocked = crawlers.filter((c) => !c.allowed).length;
  const score = Math.round((allowed / crawlers.length) * 100);

  return {
    url: robotsUrl,
    robotsTxtFound,
    robotsTxtContent,
    crawlers,
    score,
    summary: { allowed, blocked, total: crawlers.length },
  };
}

/**
 * Parse robots.txt and check if a specific user-agent is allowed.
 * Simplified parser — handles the most common patterns.
 */
function checkRobotsTxt(content: string, userAgent: string): { allowed: boolean; rule: string | null } {
  const lines = content.split('\n').map((l) => l.trim());
  const agentLower = userAgent.toLowerCase();

  let inRelevantBlock = false;
  let foundSpecificBlock = false;
  let inWildcardBlock = false;
  let specificAllowed = true;
  let wildcardAllowed = true;
  let matchedRule: string | null = null;

  for (const line of lines) {
    if (line.startsWith('#') || line === '') continue;

    const [directive, ...valueParts] = line.split(':');
    const value = valueParts.join(':').trim();

    if (directive?.toLowerCase() === 'user-agent') {
      const agent = value.toLowerCase();
      if (agent === agentLower) {
        inRelevantBlock = true;
        foundSpecificBlock = true;
        inWildcardBlock = false;
      } else if (agent === '*') {
        inWildcardBlock = !foundSpecificBlock;
        inRelevantBlock = false;
      } else {
        inRelevantBlock = false;
        inWildcardBlock = false;
      }
    } else if (directive?.toLowerCase() === 'disallow' && value === '/') {
      if (inRelevantBlock) {
        specificAllowed = false;
        matchedRule = line;
      } else if (inWildcardBlock) {
        wildcardAllowed = false;
        if (!matchedRule) matchedRule = line;
      }
    } else if (directive?.toLowerCase() === 'allow' && value === '/') {
      if (inRelevantBlock) {
        specificAllowed = true;
        matchedRule = line;
      } else if (inWildcardBlock) {
        wildcardAllowed = true;
      }
    }
  }

  // Specific block takes priority over wildcard
  if (foundSpecificBlock) {
    return { allowed: specificAllowed, rule: matchedRule };
  }

  return { allowed: wildcardAllowed, rule: matchedRule };
}

/**
 * Generate an llm.txt file for the website.
 * This emerging standard tells AI crawlers about the site.
 */
export function generateLlmTxt(opts: {
  siteName: string;
  siteUrl: string;
  description: string;
  appName?: string;
  appDescription?: string;
  keyFeatures?: string[];
  targetAudience?: string;
  brandProfile?: {
    tone?: string;
    values?: string[];
    tagline?: string;
  } | null;
  contentThemes?: string[];
}): string {
  const lines: string[] = [];

  lines.push(`# ${opts.siteName}`);
  lines.push('');
  lines.push(`> ${opts.description}`);
  lines.push('');

  if (opts.brandProfile?.tagline) {
    lines.push(`Tagline: ${opts.brandProfile.tagline}`);
    lines.push('');
  }

  lines.push('## About');
  lines.push('');
  if (opts.appName && opts.appDescription) {
    lines.push(`${opts.appName} is ${opts.appDescription}`);
  } else {
    lines.push(opts.description);
  }
  lines.push('');

  if (opts.keyFeatures && opts.keyFeatures.length > 0) {
    lines.push('## Key Features');
    lines.push('');
    for (const feature of opts.keyFeatures) {
      lines.push(`- ${feature}`);
    }
    lines.push('');
  }

  if (opts.targetAudience) {
    lines.push('## Target Audience');
    lines.push('');
    lines.push(opts.targetAudience);
    lines.push('');
  }

  if (opts.brandProfile?.values && opts.brandProfile.values.length > 0) {
    lines.push('## Values');
    lines.push('');
    for (const value of opts.brandProfile.values) {
      lines.push(`- ${value}`);
    }
    lines.push('');
  }

  if (opts.contentThemes && opts.contentThemes.length > 0) {
    lines.push('## Topics We Cover');
    lines.push('');
    for (const theme of opts.contentThemes) {
      lines.push(`- ${theme}`);
    }
    lines.push('');
  }

  lines.push('## Links');
  lines.push('');
  lines.push(`- Website: ${opts.siteUrl}`);
  if (opts.appName) {
    lines.push(`- App: Available on Google Play`);
  }
  lines.push('');

  return lines.join('\n');
}
