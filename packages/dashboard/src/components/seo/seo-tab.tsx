import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Sparkles,
  Globe,
  FileText,
  Video,
  HelpCircle,
  GitCompare,
  BookOpen,
  Layout,
  Layers,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Loader2,
  TrendingUp,
  Link2,
  Code,
  Zap,
  Clock,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { EmptyState } from '#/components/ui/spinner'
import { useToast } from '#/components/ui/toast'
import { seo, contentWriter, type SeoKeyword, type SeoReport, type SeoContentPlan, type SeoStats } from '#/lib/api'
import { cn } from '#/lib/utils'

interface SeoTabProps {
  projectId: string
  projectName: string
}

export function SeoTab({ projectId, projectName }: SeoTabProps) {
  const [view, setView] = useState<'keywords' | 'content' | 'report'>('keywords')
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: keywords = [], isFetching: keywordsFetching } = useQuery({
    queryKey: ['seo-keywords', projectId],
    queryFn: () => seo.keywords(projectId),
  })

  const { data: contentPlans = [] } = useQuery({
    queryKey: ['seo-content-plans', projectId],
    queryFn: () => seo.contentPlans(projectId),
  })

  const { data: stats } = useQuery({
    queryKey: ['seo-stats', projectId],
    queryFn: () => seo.stats(projectId),
  })

  const discoverMutation = useMutation({
    mutationFn: () => seo.discover(projectId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['seo-keywords', projectId] })
      queryClient.invalidateQueries({ queryKey: ['seo-stats', projectId] })
      toast(`SEO Discovery Complete — found ${data.discovered} keywords`)
    },
    onError: (err) => {
      toast(`Discovery failed: ${String(err)}`, 'error')
    },
  })

  const analyzeMutation = useMutation({
    mutationFn: () => seo.analyze(projectId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['seo-keywords', projectId] })
      queryClient.invalidateQueries({ queryKey: ['seo-content-plans', projectId] })
      queryClient.invalidateQueries({ queryKey: ['seo-stats', projectId] })
      setView('report')
      toast(`SEO Analysis Complete — ${data.totalKeywordsDiscovered} keywords, ${data.contentPlan.length} content pieces`)
    },
    onError: (err) => {
      toast(`Analysis failed: ${String(err)}`, 'error')
    },
  })

  const deleteAllMutation = useMutation({
    mutationFn: () => seo.deleteAll(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seo-keywords', projectId] })
      queryClient.invalidateQueries({ queryKey: ['seo-content-plans', projectId] })
      queryClient.invalidateQueries({ queryKey: ['seo-stats', projectId] })
      toast('All SEO keywords & content plans cleared', 'info')
    },
  })

  const [confirmClear, setConfirmClear] = useState(false)
  const hasKeywords = keywords.length > 0

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('keywords')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              view === 'keywords'
                ? 'bg-accent/10 text-accent'
                : 'text-text-tertiary hover:text-text-secondary',
            )}
          >
            Keywords {hasKeywords && <span className="ml-1 text-text-muted">({keywords.length})</span>}
          </button>
          <button
            onClick={() => setView('content')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              view === 'content'
                ? 'bg-accent/10 text-accent'
                : 'text-text-tertiary hover:text-text-secondary',
            )}
          >
            Content Plan {contentPlans.length > 0 && <span className="ml-1 text-text-muted">({contentPlans.length})</span>}
          </button>
          {analyzeMutation.data && (
            <button
              onClick={() => setView('report')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                view === 'report'
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-tertiary hover:text-text-secondary',
              )}
            >
              Report
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => discoverMutation.mutate()}
            disabled={discoverMutation.isPending}
          >
            {discoverMutation.isPending ? (
              <Loader2 size={13} className="mr-1.5 animate-spin" />
            ) : (
              <Search size={13} className="mr-1.5" />
            )}
            Discover Keywords
          </Button>
          <Button
            size="sm"
            onClick={() => analyzeMutation.mutate()}
            disabled={(!hasKeywords && !analyzeMutation.isPending) || analyzeMutation.isPending}
            title={!hasKeywords ? 'Discover keywords first' : undefined}
          >
            {analyzeMutation.isPending ? (
              <Loader2 size={13} className="mr-1.5 animate-spin" />
            ) : (
              <Sparkles size={13} className="mr-1.5" />
            )}
            Full SEO Analysis
          </Button>
          {hasKeywords && (
            confirmClear ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-tertiary">Clear all?</span>
                <Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Button>
                <Button size="sm" variant="danger" onClick={() => { deleteAllMutation.mutate(); setConfirmClear(false) }}>Clear</Button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                className="text-xs text-text-muted hover:text-rose transition-colors cursor-pointer"
              >
                Clear All
              </button>
            )
          )}
        </div>
      </div>

      {/* Stats bar */}
      {stats && stats.totalKeywords > 0 && (
        <SeoStatsBar stats={stats} />
      )}

      {/* Main content */}
      {view === 'keywords' && (
        <SeoKeywordsView
          keywords={keywords}
          projectId={projectId}
          loading={keywordsFetching || discoverMutation.isPending}
        />
      )}
      {view === 'content' && (
        <ContentPlanView
          plans={contentPlans}
          projectId={projectId}
        />
      )}
      {view === 'report' && analyzeMutation.data && (
        <SeoReportView report={analyzeMutation.data} />
      )}
    </div>
  )
}

// ─── Stats Bar ───

function SeoStatsBar({ stats }: { stats: SeoStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="Total Keywords" value={stats.totalKeywords} icon={Globe} />
      <StatCard label="Content Plans" value={stats.totalContentPlans} icon={FileText} />
      <StatCard
        label="Informational"
        value={stats.byIntent['informational'] ?? 0}
        icon={HelpCircle}
      />
      <StatCard
        label="Commercial"
        value={stats.byIntent['commercial'] ?? 0}
        icon={TrendingUp}
      />
    </div>
  )
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Globe }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-0 px-4 py-3">
      <Icon size={16} className="text-text-muted" />
      <div>
        <div className="text-lg font-semibold text-text-primary tabular-nums">{value}</div>
        <div className="text-[10px] text-text-tertiary uppercase tracking-wider">{label}</div>
      </div>
    </div>
  )
}

// ─── Keywords View ───

const INTENT_CONFIG: Record<string, { label: string; variant: 'accent' | 'success' | 'warning' | 'default' | 'muted' }> = {
  informational: { label: 'Info', variant: 'default' },
  commercial: { label: 'Commercial', variant: 'warning' },
  transactional: { label: 'Transactional', variant: 'success' },
  navigational: { label: 'Nav', variant: 'muted' },
}

const CONTENT_TYPE_ICON: Record<string, typeof Globe> = {
  blog_post: BookOpen,
  landing_page: Layout,
  faq: HelpCircle,
  video: Video,
  comparison: GitCompare,
  tutorial: FileText,
}

const SOURCE_CONFIG: Record<string, { label: string; variant: 'accent' | 'success' | 'warning' | 'default' | 'muted' }> = {
  google_suggest: { label: 'Google', variant: 'accent' },
  alphabet_soup: { label: 'A-Z', variant: 'success' },
  deep_soup: { label: 'Deep A-Z', variant: 'success' },
  question: { label: 'Question', variant: 'warning' },
  comparison: { label: 'Comparison', variant: 'default' },
  modifier: { label: 'Modifier', variant: 'muted' },
  youtube: { label: 'YouTube', variant: 'accent' },
  related: { label: 'Related', variant: 'muted' },
}

function SeoKeywordsView({
  keywords,
  projectId,
  loading,
}: {
  keywords: SeoKeyword[]
  projectId: string
  loading: boolean
}) {
  const [filter, setFilter] = useState('')
  const [intentFilter, setIntentFilter] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const toggleTrack = useMutation({
    mutationFn: (keywordId: string) => seo.toggleTrack(projectId, keywordId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['seo-keywords', projectId] }),
  })

  const filtered = keywords.filter((kw) => {
    if (filter && !kw.keyword.toLowerCase().includes(filter.toLowerCase())) return false
    if (intentFilter && kw.searchIntent !== intentFilter) return false
    if (typeFilter && kw.contentType !== typeFilter) return false
    return true
  })

  if (keywords.length === 0 && !loading) {
    return (
      <EmptyState
        title="No SEO keywords yet"
        description="Click 'Discover Keywords' to mine Google & YouTube for web search opportunities"
      />
    )
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter keywords..."
            className="pl-9 max-w-xs"
          />
        </div>

        <div className="flex gap-1">
          {Object.entries(INTENT_CONFIG).map(([key, config]) => (
            <button
              key={key}
              onClick={() => setIntentFilter(intentFilter === key ? null : key)}
              className={cn(
                'px-2 py-1 text-[10px] font-medium rounded-md border transition-colors',
                intentFilter === key
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-text-muted hover:text-text-secondary',
              )}
            >
              {config.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
          {Object.entries(CONTENT_TYPE_ICON).map(([key, Icon]) => (
            <button
              key={key}
              onClick={() => setTypeFilter(typeFilter === key ? null : key)}
              className={cn(
                'p-1.5 rounded-md border transition-colors',
                typeFilter === key
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-text-muted hover:text-text-secondary',
              )}
              title={key.replace('_', ' ')}
            >
              <Icon size={12} />
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 mb-4 text-xs text-text-muted">
          <Loader2 size={12} className="animate-spin" />
          Discovering keywords...
        </div>
      )}

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-1 border-b border-border">
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                Keyword
              </th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                Intent
              </th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                Content
              </th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                Source
              </th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                Volume
              </th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                Cluster
              </th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-text-tertiary uppercase tracking-wider w-12">
                Track
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map((kw) => {
              const intentConf = INTENT_CONFIG[kw.searchIntent ?? '']
              const sourceConf = SOURCE_CONFIG[kw.source]
              const ContentIcon = CONTENT_TYPE_ICON[kw.contentType ?? ''] ?? Globe

              return (
                <tr
                  key={kw.id}
                  className="border-b border-border/50 last:border-0 hover:bg-surface-1/50 transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <span className="text-sm text-text-primary">{kw.keyword}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {intentConf ? (
                      <Badge variant={intentConf.variant}>{intentConf.label}</Badge>
                    ) : (
                      <span className="text-[11px] text-text-muted">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <ContentIcon size={12} className="text-text-muted" />
                      <span className="text-[11px] text-text-secondary">
                        {(kw.contentType ?? '').replace('_', ' ')}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {sourceConf ? (
                      <Badge variant={sourceConf.variant}>{sourceConf.label}</Badge>
                    ) : (
                      <span className="text-[11px] text-text-muted">{kw.source}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <VolumeBadge volume={kw.estimatedVolume} />
                  </td>
                  <td className="px-4 py-2.5">
                    {kw.cluster ? (
                      <span className="text-[11px] text-text-secondary bg-surface-1 px-2 py-0.5 rounded">
                        {kw.cluster}
                      </span>
                    ) : (
                      <span className="text-[11px] text-text-muted">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => toggleTrack.mutate(kw.id)}
                      className={cn(
                        'p-1 rounded transition-colors cursor-pointer',
                        kw.isTracking
                          ? 'text-accent hover:text-accent-hover'
                          : 'text-text-muted hover:text-text-secondary',
                      )}
                    >
                      {kw.isTracking ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-text-tertiary">
                  No keywords match filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 text-[11px] text-text-tertiary">
        <span>
          {filtered.length === keywords.length
            ? `${keywords.length} keywords`
            : `${filtered.length} of ${keywords.length} keywords`}
        </span>
        {filtered.length > 100 && (
          <span>Showing first 100</span>
        )}
      </div>
    </div>
  )
}

function VolumeBadge({ volume }: { volume: string | null }) {
  if (!volume) return <span className="text-[11px] text-text-muted">-</span>

  const config = {
    high: { color: 'text-green-400', bars: 3 },
    medium: { color: 'text-yellow-400', bars: 2 },
    low: { color: 'text-text-muted', bars: 1 },
  }[volume] ?? { color: 'text-text-muted', bars: 0 }

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={cn(
            'w-1 rounded-sm',
            i <= config.bars ? config.color : 'bg-surface-2',
            i === 1 ? 'h-2' : i === 2 ? 'h-3' : 'h-4',
          )}
          style={i <= config.bars ? { backgroundColor: 'currentColor' } : undefined}
        />
      ))}
    </div>
  )
}

// ─── Content Plan View ───

function ContentPlanView({
  plans,
  projectId,
}: {
  plans: SeoContentPlan[]
  projectId: string
}) {
  const queryClient = useQueryClient()

  const updateStatus = useMutation({
    mutationFn: ({ planId, status }: { planId: string; status: string }) =>
      seo.updateContentPlan(projectId, planId, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['seo-content-plans', projectId] }),
  })

  if (plans.length === 0) {
    return (
      <EmptyState
        title="No content plan yet"
        description="Run 'Full SEO Analysis' to generate a content strategy with AI"
      />
    )
  }

  const byPriority = {
    high: plans.filter((p) => p.priority === 'high'),
    medium: plans.filter((p) => p.priority === 'medium'),
    low: plans.filter((p) => p.priority === 'low'),
  }

  return (
    <div className="space-y-6">
      {(['high', 'medium', 'low'] as const).map((priority) => {
        const items = byPriority[priority]
        if (items.length === 0) return null

        return (
          <div key={priority}>
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">
              {priority === 'high' ? 'High Priority' : priority === 'medium' ? 'Medium Priority' : 'Low Priority'}
              <span className="ml-2 text-text-muted">({items.length})</span>
            </h3>
            <div className="grid gap-3">
              {items.map((plan) => (
                <ContentPlanCard
                  key={plan.id}
                  plan={plan}
                  projectId={projectId}
                  onStatusChange={(status) => updateStatus.mutate({ planId: plan.id, status })}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ContentPlanCard({
  plan,
  projectId,
  onStatusChange,
}: {
  plan: SeoContentPlan
  projectId: string
  onStatusChange: (status: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const generateArticle = useMutation({
    mutationFn: () => contentWriter.generate(projectId, plan.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seo-content-plans', projectId] })
      toast('Article generated — check the outline section', 'success')
    },
    onError: (err) => {
      toast(`Generation failed: ${(err as Error).message}`, 'error')
    },
  })
  const ContentIcon = CONTENT_TYPE_ICON[plan.contentType] ?? FileText

  const statusConfig: Record<string, { label: string; variant: 'accent' | 'success' | 'warning' | 'default' | 'muted' }> = {
    planned: { label: 'Planned', variant: 'default' },
    in_progress: { label: 'In Progress', variant: 'warning' },
    published: { label: 'Published', variant: 'success' },
  }
  const status = statusConfig[plan.status] ?? statusConfig.planned!

  return (
    <div className="border border-border rounded-lg bg-surface-0 overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-1/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown size={14} className="text-text-muted shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-text-muted shrink-0" />
        )}
        <ContentIcon size={14} className="text-text-muted shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-text-primary truncate">{plan.title}</div>
          <div className="text-[10px] text-text-muted mt-0.5">
            {plan.contentType.replace('_', ' ')}
            {plan.cluster && ` · ${plan.cluster}`}
          </div>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border/50">
          {plan.outline && (
            <div className="mt-3">
              <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5">
                Outline
              </div>
              <div className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
                {plan.outline}
              </div>
            </div>
          )}

          {plan.targetKeywords && plan.targetKeywords.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5">
                Target Keywords
              </div>
              <div className="flex flex-wrap gap-1">
                {plan.targetKeywords.map((kw) => (
                  <span
                    key={kw}
                    className="text-[11px] text-text-secondary bg-surface-1 px-2 py-0.5 rounded"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {plan.metadata?.competitiveAngle && (
            <div className="mt-3">
              <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5">
                Competitive Angle
              </div>
              <div className="text-sm text-text-secondary">{plan.metadata.competitiveAngle}</div>
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <Button
              size="sm"
              onClick={() => generateArticle.mutate()}
              disabled={generateArticle.isPending}
            >
              {generateArticle.isPending ? (
                <><Loader2 size={12} className="mr-1 animate-spin" /> Generating...</>
              ) : (
                <><Sparkles size={12} className="mr-1" /> Generate Article</>
              )}
            </Button>
            {plan.status !== 'in_progress' && (
              <Button size="sm" variant="secondary" onClick={() => onStatusChange('in_progress')}>
                Start Writing
              </Button>
            )}
            {plan.status !== 'published' && (
              <Button size="sm" variant="secondary" onClick={() => onStatusChange('published')}>
                Mark Published
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Report View ───

function SeoReportView({ report }: { report: SeoReport }) {
  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Keywords Found" value={report.totalKeywordsDiscovered} icon={Globe} />
        <StatCard label="Analyzed" value={report.totalKeywordsAnalyzed} icon={Search} />
        <StatCard label="Topic Clusters" value={report.clusters.length} icon={Layers} />
        <StatCard label="Content Pieces" value={report.contentPlan.length} icon={FileText} />
      </div>

      {/* Clusters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Layers size={14} />
            Topic Clusters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {report.clusters.map((cluster) => (
              <div key={cluster.name} className="border border-border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-text-primary">{cluster.name}</span>
                  <Badge variant={INTENT_CONFIG[cluster.primaryIntent]?.variant ?? 'default'}>
                    {cluster.primaryIntent}
                  </Badge>
                </div>
                <p className="text-[11px] text-text-secondary mb-2">{cluster.contentOpportunity}</p>
                <div className="flex flex-wrap gap-1">
                  {cluster.keywords.slice(0, 8).map((kw) => (
                    <span key={kw} className="text-[10px] text-text-muted bg-surface-1 px-1.5 py-0.5 rounded">
                      {kw}
                    </span>
                  ))}
                  {cluster.keywords.length > 8 && (
                    <span className="text-[10px] text-text-muted">
                      +{cluster.keywords.length - 8} more
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      <div className="grid gap-4 sm:grid-cols-2">
        <RecommendationCard
          title="Quick Wins"
          icon={Zap}
          items={report.quickWins}
          iconColor="text-yellow-400"
        />
        <RecommendationCard
          title="Long-Term Plays"
          icon={Clock}
          items={report.longTermPlays}
          iconColor="text-blue-400"
        />
        <RecommendationCard
          title="Schema Markup"
          icon={Code}
          items={report.schemaRecommendations}
          iconColor="text-green-400"
        />
        <RecommendationCard
          title="Deep Link Strategy"
          icon={Link2}
          items={report.deepLinkStrategy}
          iconColor="text-purple-400"
        />
      </div>
    </div>
  )
}

function RecommendationCard({
  title,
  icon: Icon,
  items,
  iconColor,
}: {
  title: string
  icon: typeof Globe
  items: string[]
  iconColor: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon size={14} className={iconColor} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-text-secondary">
              <span className="text-text-muted shrink-0">-</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

