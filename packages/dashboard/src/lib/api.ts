const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:3001'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...init?.headers as Record<string, string> }
  if (init?.body) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  })

  if (!res.ok) {
    const body = await res.text()
    throw new ApiError(res.status, body || res.statusText)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

// ─── Typed interfaces ───

export interface App {
  id: string
  name: string
  platform: 'android' | 'ios'
  packageName?: string | null
  bundleId?: string | null
  isOurs: boolean
  category?: string | null
  createdAt: string
}

export interface Project {
  id: string
  appId: string
  name: string
  region: string
  mode: 'live' | 'pre_launch'
  seedKeywords?: string[] | null
  category?: string | null
  appDescription?: string | null
  keyFeatures?: string[] | null
  targetAudience?: string | null
  websiteUrl?: string | null
  brandProfile?: BrandProfile | null
  isActive: boolean
  createdAt: string
  app?: App
  competitorCount?: number
  keywordCount?: number
}

export interface ProjectDetail extends Project {
  competitors?: Array<{
    id: string
    projectId: string
    competitorAppId: string
    app: App
  }>
}

export interface DiscoveredKeyword {
  id: string
  projectId: string
  keyword: string
  source: string
  myRank: number | null
  bestCompRank: number | null
  bestCompPackage: string | null
  totalResults: number | null
  volume: number | null
  difficulty: number | null
  isTracking: boolean
  discoveredAt: string
}

export interface RankSnapshot {
  id: string
  appId: string | null
  keywordId: string | null
  keywordTerm: string | null
  platform: string | null
  region: string | null
  rank: number | null
  date: string | null
  categoryRank: number | null
}

export interface StrategyAction {
  id: string
  appId: string | null
  actionType: string
  reasoning: string
  suggestedChange: string
  authorityLevel: string
  status: string
  approvedAt: string | null
  executedAt: string | null
  createdAt: string
}

export interface Review {
  id: string
  appId: string | null
  platform: string | null
  author: string | null
  rating: number | null
  text: string | null
  date: string | null
  sentimentScore: number | null
  topicsJson: unknown
  language: string | null
}

export interface HealthScore {
  id: string
  appId: string | null
  overallScore: number | null
  breakdownJson: unknown
  date: string | null
}

export interface KeywordOpportunity {
  id: string
  keywordId: string | null
  appId: string | null
  currentRank: number | null
  potentialRank: number | null
  opportunityScore: number | null
  suggestedAction: string | null
  createdAt: string | null
}

export interface Listing {
  id: string
  appId: string | null
  title: string | null
  shortDesc: string | null
  longDesc: string | null
  iconUrl: string | null
  rating: number | null
  reviewCount: number | null
  installsText: string | null
  version: string | null
  snapshotDate: string | null
}

export interface ChangeLogEntry {
  id: string
  appId: string | null
  changeType: string
  field: string | null
  oldValue: string | null
  newValue: string | null
  source: string | null
  timestamp: string
}

export interface CompetitorSuggestion {
  packageName: string
  title: string
  developer: string
  icon: string
  score: number | null
  installs: string | null
  category: string | null
  relevanceScore: number
}

export interface ListingDraft {
  id: string
  projectId: string
  title: string
  shortDescription: string
  fullDescription: string
  appName: string | null
  developerName: string | null
  version: number
  activeVariantId: string | null
  sourceVersionId: string | null
  createdAt: string
  updatedAt: string
}

export interface ListingVariantData {
  id: string
  variantIndex: number
  strategyName: string
  title: string
  shortDescription: string
  fullDescription: string
  scores: {
    overall: number
    title: number
    shortDesc: number
    fullDesc: number
    coverage: number
  } | null
  isActive: boolean
  rationale: string | null
  warnings: string[] | null
  keywordsUsed: string[] | null
}

export interface ListingVersion {
  id: string
  projectId: string
  versionNumber: number
  generationMethod: 'manual' | 'agent'
  metadata: {
    tokensUsed?: { input: number; output: number }
    durationMs?: number
    valueProposition?: string
  } | null
  createdAt: string
  variants: ListingVariantData[]
}

export interface ListingCreatorReport {
  projectName: string
  valueProposition: string
  keywordsAnalyzed: number
  keywordsAccepted: number
  keywordsRejected: number
  rejectedKeywords: Array<{ term: string; reason: string }>
  competitorsAnalyzed: number
  competitiveInsights: string[]
  variants: Array<{
    strategyName: string
    title: string
    shortDescription: string
    fullDescriptionPreview: string
    scores: { overall: number; title: number; shortDesc: number; fullDesc: number; coverage: number }
    keywordCoverage: { found: number; total: number }
    avgDensity: number
    rationale: string
    warnings: string[]
  }>
  bestVariantIndex: number
  bestVariantReason: string
  recommendations: string[]
  versionId: string
}

export interface ListingDraftInput {
  title?: string
  shortDescription?: string
  fullDescription?: string
  appName?: string
  developerName?: string
}

export interface DensityResult {
  keyword: string
  count: number
  density: number
  totalWords: number
}

export interface ListingScore {
  overall: number
  title: {
    score: number
    charCount: number
    charLimit: number
    keywordsFound: string[]
    keywordsMissing: string[]
    density: DensityResult[]
  }
  shortDescription: {
    score: number
    charCount: number
    charLimit: number
    keywordsFound: string[]
    density: DensityResult[]
  }
  fullDescription: {
    score: number
    charCount: number
    charLimit: number
    keywordsFound: string[]
    density: DensityResult[]
  }
  coverage: {
    score: number
    found: number
    total: number
    missing: string[]
  }
}

// ─── Wrapper type for list endpoints ───

interface ListResponse<T> {
  data: T[]
  meta: { total: number }
}

/** Unwrap { data, meta } list responses — returns just the array */
async function list<T>(path: string): Promise<T[]> {
  const res = await api.get<ListResponse<T>>(path)
  return res.data
}

// ─── API Calls ───

export const projects = {
  list: () => list<Project>('/api/projects'),
  get: (id: string) => api.get<ProjectDetail>(`/api/projects/${id}`),
  create: (data: {
    appId?: string
    name: string
    region?: string
    mode?: 'live' | 'pre_launch'
    seedKeywords?: string[]
    category?: string
    appDescription?: string
    keyFeatures?: string[]
    targetAudience?: string
  }) => api.post<Project>('/api/projects', data),
  update: (id: string, data: {
    name?: string
    region?: string
    seedKeywords?: string[]
    category?: string
    appDescription?: string
    keyFeatures?: string[]
    targetAudience?: string
    websiteUrl?: string
  }) => api.patch<Project>(`/api/projects/${id}`, data),
  delete: (id: string) => api.del(`/api/projects/${id}`),
  keywords: (id: string) => list<DiscoveredKeyword>(`/api/projects/${id}/keywords`),
  discoverAll: (id: string) =>
    api.post<{ discovered: number; saved: number }>(`/api/projects/${id}/discover-all`, {}),
  deleteAllKeywords: (id: string) => api.del(`/api/projects/${id}/keywords`),
  checkRanks: (id: string) =>
    api.post<{ checked: number; updated: number }>(`/api/projects/${id}/check-my-ranks`, {}),
  toggleTrack: (id: string, keywordId: string) =>
    api.post<{ success: boolean; isTracking: boolean }>(
      `/api/projects/${id}/keywords/${keywordId}/track`,
      {},
    ),
  addCompetitor: (id: string, competitorAppId: string) =>
    api.post(`/api/projects/${id}/competitors`, { competitorAppId }),
  removeCompetitor: (id: string, competitorAppId: string) =>
    api.del(`/api/projects/${id}/competitors/${competitorAppId}`),
  discoverCompetitors: (id: string, keywords?: string[]) =>
    api.post<{ competitors: CompetitorSuggestion[] }>(
      `/api/projects/${id}/discover-competitors`,
      { keywords },
    ),
  getListingDraft: (id: string) => api.get<ListingDraft | undefined>(`/api/projects/${id}/listing-draft`),
  saveListingDraft: (id: string, draft: ListingDraftInput) =>
    api.post<ListingDraft>(`/api/projects/${id}/listing-draft`, draft),
  scoreListing: (id: string, listing: { title: string; shortDescription: string; fullDescription: string }) =>
    api.post<ListingScore>(`/api/projects/${id}/score-listing`, listing),
  generateListing: (id: string) =>
    api.post<ListingCreatorReport>(`/api/projects/${id}/generate-listing`, {}),
  listingVersions: (id: string) =>
    list<ListingVersion>(`/api/projects/${id}/listing-versions`),
  activateVariant: (id: string, variantId: string) =>
    api.post<{ success: boolean }>(`/api/projects/${id}/listing-variants/${variantId}/activate`, {}),
}

export const apps = {
  list: (params?: { platform?: string; isOurs?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString()
    return list<App>(`/api/apps${qs ? `?${qs}` : ''}`)
  },
  get: (id: string) => api.get<App>(`/api/apps/${id}`),
  create: (data: { name: string; platform: string; packageName?: string; isOurs?: boolean; category?: string }) =>
    api.post<App>('/api/apps', data),
}

export const rankings = {
  list: (params: { appId?: string; keywordId?: string; from?: string; to?: string }) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null)),
    ).toString()
    return list<RankSnapshot>(`/api/rankings${qs ? `?${qs}` : ''}`)
  },
  forApp: (appId: string) => list<RankSnapshot>(`/api/apps/${appId}/rankings`),
  categoryRanks: (appId: string, params?: { from?: string; to?: string }) => {
    const qs = params
      ? new URLSearchParams(
          Object.fromEntries(Object.entries(params).filter(([, v]) => v != null)),
        ).toString()
      : ''
    return api.get<{ data: RankSnapshot[]; meta: { total: number } }>(
      `/api/apps/${appId}/category-ranks${qs ? `?${qs}` : ''}`,
    )
  },
}

export const strategy = {
  list: (params?: { appId?: string; status?: string }) => {
    const qs = params
      ? new URLSearchParams(
          Object.fromEntries(Object.entries(params).filter(([, v]) => v != null)),
        ).toString()
      : ''
    return list<StrategyAction>(`/api/strategy${qs ? `?${qs}` : ''}`)
  },
  approve: (id: string) => api.post<StrategyAction>(`/api/strategy/${id}/approve`, {}),
  reject: (id: string) => api.post<StrategyAction>(`/api/strategy/${id}/reject`, {}),
  execute: (id: string) => api.post<StrategyAction>(`/api/strategy/${id}/execute`, {}),
}

export const reviews = {
  forApp: (appId: string, rating?: number) => {
    const qs = rating ? `?rating=${rating}` : ''
    return list<Review>(`/api/apps/${appId}/reviews${qs}`)
  },
}

export const health = {
  forApp: (appId: string) => list<HealthScore>(`/api/apps/${appId}/health`),
  latest: (appId: string) => api.get<HealthScore>(`/api/apps/${appId}/health/latest`),
}

export const opportunities = {
  forApp: (appId: string) => list<KeywordOpportunity>(`/api/apps/${appId}/opportunities`),
}

export const listings = {
  forApp: (appId: string) => list<Listing>(`/api/apps/${appId}/listings`),
  latest: (appId: string) => api.get<Listing>(`/api/apps/${appId}/listings/latest`),
}

export const changelog = {
  forApp: (appId: string) => list<ChangeLogEntry>(`/api/apps/${appId}/changelog`),
}

// ─── SEO Types ───

export interface SeoKeyword {
  id: string
  projectId: string
  keyword: string
  source: string
  searchIntent: string | null
  contentType: string | null
  cluster: string | null
  priority: string | null
  contentIdea: string | null
  estimatedVolume: string | null
  isTracking: boolean
  discoveredAt: string
}

export interface SeoContentPlan {
  id: string
  projectId: string
  title: string
  contentType: string
  cluster: string | null
  targetKeywords: string[] | null
  outline: string | null
  priority: string
  status: string
  metadata: {
    searchIntent?: string
    competitiveAngle?: string
  } | null
  createdAt: string
  updatedAt: string
}

export interface SeoReport {
  projectName: string
  totalKeywordsDiscovered: number
  totalKeywordsAnalyzed: number
  clusters: Array<{
    name: string
    keywords: string[]
    primaryIntent: string
    contentOpportunity: string
  }>
  contentPlan: Array<{
    title: string
    contentType: string
    cluster: string
    targetKeywords: string[]
    outline: string
    priority: string
    searchIntent: string
    competitiveAngle: string
    estimatedTraffic: string
  }>
  schemaRecommendations: string[]
  deepLinkStrategy: string[]
  quickWins: string[]
  longTermPlays: string[]
}

export interface SeoStats {
  totalKeywords: number
  totalContentPlans: number
  byIntent: Record<string, number>
  bySource: Record<string, number>
  byClusters: Record<string, number>
}

export interface SeoDiscoveryResult {
  discovered: number
  saved: number
  bySource: Record<string, number>
  byIntent: Record<string, number>
  byType: Record<string, number>
}

// ─── SEO API ───

export const seo = {
  keywords: (projectId: string) =>
    list<SeoKeyword>(`/api/projects/${projectId}/seo/keywords`),
  discover: (projectId: string) =>
    api.post<SeoDiscoveryResult>(`/api/projects/${projectId}/seo/discover`, {}),
  analyze: (projectId: string) =>
    api.post<SeoReport>(`/api/projects/${projectId}/seo/analyze`, {}),
  deleteAll: (projectId: string) => api.del(`/api/projects/${projectId}/seo/keywords`),
  toggleTrack: (projectId: string, keywordId: string) =>
    api.post<{ success: boolean; isTracking: boolean }>(
      `/api/projects/${projectId}/seo/keywords/${keywordId}/track`,
      {},
    ),
  contentPlans: (projectId: string) =>
    list<SeoContentPlan>(`/api/projects/${projectId}/seo/content-plans`),
  updateContentPlan: (projectId: string, planId: string, data: { status?: string; outline?: string }) =>
    api.patch<SeoContentPlan>(`/api/projects/${projectId}/seo/content-plans/${planId}`, data),
  deleteContentPlan: (projectId: string, planId: string) =>
    api.del(`/api/projects/${projectId}/seo/content-plans/${planId}`),
  stats: (projectId: string) =>
    api.get<SeoStats>(`/api/projects/${projectId}/seo/stats`),
}

// ─── Site Audit ───

export interface SiteAudit {
  id: string
  projectId: string
  siteUrl: string
  status: 'running' | 'completed' | 'failed'
  pagesCrawled: number
  issuesFound: number
  score: number | null
  summary: { critical: number; warning: number; info: number; passed: number } | null
  startedAt: string
  completedAt: string | null
}

export interface SiteAuditPage {
  id: string
  url: string
  statusCode: number | null
  loadTimeMs: number | null
  title: string | null
  titleLength: number | null
  metaDescription: string | null
  metaDescriptionLength: number | null
  h1Count: number | null
  imageCount: number | null
  imagesWithoutAlt: number | null
  internalLinks: number | null
  externalLinks: number | null
  wordCount: number | null
  schemaTypes: string[] | null
  issues: Array<{ type: 'critical' | 'warning' | 'info'; code: string; message: string }> | null
  score: number | null
}

export const siteAudit = {
  run: (projectId: string, url: string) =>
    api.post<{ id: string; status: string }>(`/api/projects/${projectId}/site-audit`, { url }),
  latest: (projectId: string) =>
    api.get<{ audit: SiteAudit | null; pages: SiteAuditPage[] }>(`/api/projects/${projectId}/site-audit/latest`),
  history: (projectId: string) =>
    api.get<{ data: SiteAudit[] }>(`/api/projects/${projectId}/site-audit/history`),
}

// ─── Brand Profile + Content Writer ───

export interface BrandProfile {
  tone: string
  values: string[]
  differentiators: string[]
  tagline: string
  brandVoice: string
  contentThemes: string[]
}

export const brandProfile = {
  get: (projectId: string) =>
    api.get<{ websiteUrl: string | null; profile: BrandProfile | null }>(`/api/projects/${projectId}/brand-profile`),
  build: (projectId: string, url: string) =>
    api.post<BrandProfile>(`/api/projects/${projectId}/brand-profile`, { url }),
}

export const contentWriter = {
  generate: (projectId: string, planId: string) =>
    api.post<{ article: string; tokensUsed: { input: number; output: number } }>(
      `/api/projects/${projectId}/content/generate`, { planId },
    ),
}

export interface CrawlerAccessResult {
  crawler: string
  agent: string
  org: string
  description: string
  allowed: boolean
  rule: string | null
}

export interface CrawlerAuditResult {
  url: string
  robotsTxtFound: boolean
  crawlers: CrawlerAccessResult[]
  score: number
  summary: { allowed: number; blocked: number; total: number }
}

export const crawlerAudit = {
  check: (projectId: string, url: string) =>
    api.post<CrawlerAuditResult>(`/api/projects/${projectId}/crawler-audit`, { url }),
}

export const llmTxt = {
  generate: (projectId: string) =>
    api.post<{ content: string }>(`/api/projects/${projectId}/llm-txt`, {}),
}

// ─── AI Visibility ───

export interface AiVisibilityCheck {
  id: string
  prompt: string
  platform: string
  response: string
  mentioned: boolean
  sentiment: 'positive' | 'neutral' | 'negative'
  position: number | null
  competitors_mentioned: string[] | null
  checkedAt: string
}

export interface AiVisibilityPrompt {
  id: string
  prompt: string
  category: string
  isActive: boolean
}

export interface AiVisibilityStats {
  hasData: boolean
  totalChecks?: number
  mentionRate?: number
  sentimentBreakdown?: { positive: number; neutral: number; negative: number }
  avgPosition?: number
  topCompetitors?: Array<{ name: string; count: number }>
}

export const aiVisibility = {
  prompts: (projectId: string) =>
    api.get<{ data: AiVisibilityPrompt[] }>(`/api/projects/${projectId}/ai-visibility/prompts`),
  generatePrompts: (projectId: string) =>
    api.post<{ generated: number; saved: number }>(`/api/projects/${projectId}/ai-visibility/generate-prompts`, {}),
  addPrompt: (projectId: string, prompt: string, category?: string) =>
    api.post<AiVisibilityPrompt>(`/api/projects/${projectId}/ai-visibility/prompts`, { prompt, category }),
  deletePrompt: (projectId: string, promptId: string) =>
    api.del(`/api/projects/${projectId}/ai-visibility/prompts/${promptId}`),
  check: (projectId: string) =>
    api.post<{ checked: number; mentioned: number; mentionRate: number; results: Array<{ prompt: string; mentioned: boolean; sentiment: string; position: number | null; competitorsMentioned: string[] }> }>(
      `/api/projects/${projectId}/ai-visibility/check`, {},
    ),
  history: (projectId: string) =>
    api.get<{ data: AiVisibilityCheck[] }>(`/api/projects/${projectId}/ai-visibility/history`),
  stats: (projectId: string) =>
    api.get<AiVisibilityStats>(`/api/projects/${projectId}/ai-visibility/stats`),
}

// ─── Google Search Console ───

export interface GscConnection {
  connected: boolean
  siteUrl: string | null
  connectedAt: string | null
}

export interface GscQueryRow {
  query: string | null
  clicks: number
  impressions: number
  avgPosition: number
  avgCtr: number
}

export interface GscPageRow {
  page: string | null
  clicks: number
  impressions: number
  avgPosition: number
}

export interface GscOverlapRow {
  query: string | null
  clicks: number
  impressions: number
  avgPosition: number
  inSeoKeywords: boolean
}

export const gsc = {
  getAuthUrl: (projectId: string) =>
    api.get<{ url: string }>(`/api/gsc/oauth/url?projectId=${projectId}`),
  connection: (projectId: string) =>
    api.get<GscConnection>(`/api/projects/${projectId}/gsc/connection`),
  sites: (projectId: string) =>
    api.get<{ data: string[] }>(`/api/projects/${projectId}/gsc/sites`),
  updateSite: (projectId: string, siteUrl: string) =>
    api.patch(`/api/projects/${projectId}/gsc/connection`, { siteUrl }),
  disconnect: (projectId: string) =>
    api.del(`/api/projects/${projectId}/gsc/connection`),
  sync: (projectId: string) =>
    api.post<{ synced: number; dateRange: { from: string; to: string } }>(`/api/projects/${projectId}/gsc/sync`, {}),
  topQueries: (projectId: string, params?: { from?: string; to?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.from) qs.set('from', params.from)
    if (params?.to) qs.set('to', params.to)
    if (params?.limit) qs.set('limit', String(params.limit))
    return api.get<{ data: GscQueryRow[]; meta: { total: number; dateRange: { from: string; to: string } } }>(
      `/api/projects/${projectId}/gsc/top-queries?${qs}`,
    )
  },
  topPages: (projectId: string) =>
    api.get<{ data: GscPageRow[] }>(`/api/projects/${projectId}/gsc/top-pages`),
  overlap: (projectId: string) =>
    api.get<{ data: GscOverlapRow[]; summary: { totalGscQueries: number; matchingSeoKeywords: number; newOpportunities: number } }>(
      `/api/projects/${projectId}/gsc/overlap`,
    ),
}

export const agents = {
  run: (agent: string, appId: string) => api.post(`/api/agents/${agent}/run`, { appId }),
  fullAnalysis: (appId: string) => api.post(`/api/agents/full-analysis`, { appId }),
  pending: (appId?: string) => {
    const qs = appId ? `?appId=${appId}` : ''
    return list<StrategyAction>(`/api/agents/pending${qs}`)
  },
}

// ─── Settings ───

export interface SettingsResponse {
  anthropic_api_key: string | null
  openai_api_key: string | null
  openrouter_api_key: string | null
}

export const settingsApi = {
  get: () => api.get<SettingsResponse>('/api/settings'),
  save: (data: Partial<Record<'anthropic_api_key' | 'openai_api_key' | 'openrouter_api_key', string>>) =>
    api.patch<void>('/api/settings', data),
}
