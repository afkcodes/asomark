import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import {
  ArrowLeft,
  RefreshCw,
  Sparkles,
  Search as SearchIcon,
  Hash,
  TrendingUp,
  Users,
  Zap,
  MessageSquare,
  LayoutDashboard,
  Plus,
  Activity,
  Shield,
  Palette,
  GitCompare,
  Layers,
  Eye,
  FlaskConical,
  FileText,
  Rocket,
  Globe,
  Trash2,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '#/components/ui/tabs'
import { PageLoader, EmptyState, Spinner } from '#/components/ui/spinner'
import { ActionButton } from '#/components/ui/action-button'
import { StatusBanner } from '#/components/ui/status-banner'
import { useToast } from '#/components/ui/toast'
import { KeywordTable } from '#/components/keywords/keyword-table'
import { RankChart } from '#/components/charts/rank-chart'
import { HealthGauge } from '#/components/charts/health-gauge'
import { SentimentChart } from '#/components/charts/sentiment-chart'
import { CompetitorCard } from '#/components/competitors/competitor-card'
import { ActionCard } from '#/components/strategy/action-card'
import { AgentCard, type AgentInfo } from '#/components/agents/agent-card'
import { FullAnalysisBanner } from '#/components/agents/full-analysis-banner'
import { ListingEditor } from '#/components/listing/listing-editor'
import { SeoTab } from '#/components/seo/seo-tab'
import { OverlapMatrix } from '#/components/keywords/overlap-matrix'
import { ChangeHistory } from '#/components/competitors/change-history'
import {
  projects as projectsApi,
  apps,
  agents,
  rankings,
  strategy,
  reviews as reviewsApi,
  health,
  opportunities,
  type ProjectDetail,
  type DiscoveredKeyword,
  type Review,
} from '#/lib/api'
import { cn, formatDate } from '#/lib/utils'

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectDetailPage,
})

function ProjectDetailPage() {
  const { projectId } = Route.useParams()

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId),
  })

  const { data: keywords = [], isFetching: keywordsFetching } = useQuery({
    queryKey: ['project-keywords', projectId],
    queryFn: () => projectsApi.keywords(projectId),
    enabled: !!project,
  })

  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const deleteMutation = useMutation({
    mutationFn: () => projectsApi.delete(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast('Project deleted')
      navigate({ to: '/projects' })
    },
  })

  if (isLoading) return <PageLoader />
  if (!project) return <EmptyState title="Project not found" />

  const isPreLaunch = project.mode === 'pre_launch'
  const defaultTab = isPreLaunch ? 'listing' : 'overview'

  return (
    <div>
      <ProjectHeader project={project} keywords={keywords} onDelete={() => deleteMutation.mutate()} isDeleting={deleteMutation.isPending} />

      <Tabs defaultValue={defaultTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">
            <LayoutDashboard size={13} className="mr-1.5 inline" />
            Overview
          </TabsTrigger>
          {isPreLaunch && (
            <TabsTrigger value="listing">
              <FileText size={13} className="mr-1.5 inline" />
              Listing
            </TabsTrigger>
          )}
          <TabsTrigger value="keywords">
            <Hash size={13} className="mr-1.5 inline" />
            Keywords
            {keywords.length > 0 && (
              <span className="ml-1.5 text-[10px] text-text-muted">{keywords.length}</span>
            )}
          </TabsTrigger>
          {!isPreLaunch && (
            <TabsTrigger value="rankings">
              <TrendingUp size={13} className="mr-1.5 inline" />
              Rankings
            </TabsTrigger>
          )}
          <TabsTrigger value="competitors">
            <Users size={13} className="mr-1.5 inline" />
            Competitors
            {project.competitors && (
              <span className="ml-1.5 text-[10px] text-text-muted">
                {project.competitors.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="seo">
            <Globe size={13} className="mr-1.5 inline" />
            SEO
          </TabsTrigger>
          {!isPreLaunch && (
            <TabsTrigger value="overlap">
              <Layers size={13} className="mr-1.5 inline" />
              Overlap
            </TabsTrigger>
          )}
          {!isPreLaunch && (
            <TabsTrigger value="changes">
              <GitCompare size={13} className="mr-1.5 inline" />
              Changes
            </TabsTrigger>
          )}
          <TabsTrigger value="strategy">
            <Zap size={13} className="mr-1.5 inline" />
            Strategy
          </TabsTrigger>
          {!isPreLaunch && (
            <TabsTrigger value="reviews">
              <MessageSquare size={13} className="mr-1.5 inline" />
              Reviews
            </TabsTrigger>
          )}
        </TabsList>

        <div className="mt-6">
          <TabsContent value="overview">
            <OverviewTab project={project} keywords={keywords} />
          </TabsContent>
          {isPreLaunch && (
            <TabsContent value="listing">
              <ListingEditor projectId={projectId} projectName={project.name} keywords={keywords} />
            </TabsContent>
          )}
          <TabsContent value="keywords">
            <KeywordsTab projectId={projectId} project={project} keywords={keywords} keywordsFetching={keywordsFetching} />
          </TabsContent>
          {!isPreLaunch && (
            <TabsContent value="rankings">
              <RankingsTab project={project} />
            </TabsContent>
          )}
          <TabsContent value="competitors">
            <CompetitorsTab project={project} />
          </TabsContent>
          <TabsContent value="seo">
            <SeoTab projectId={projectId} projectName={project.name} />
          </TabsContent>
          {!isPreLaunch && (
            <TabsContent value="overlap">
              <OverlapMatrix projectId={projectId} />
            </TabsContent>
          )}
          {!isPreLaunch && (
            <TabsContent value="changes">
              <ChangeHistory projectId={projectId} />
            </TabsContent>
          )}
          <TabsContent value="strategy">
            <StrategyTab appId={project.appId} />
          </TabsContent>
          {!isPreLaunch && (
            <TabsContent value="reviews">
              <ReviewsTab appId={project.appId} />
            </TabsContent>
          )}
        </div>
      </Tabs>
    </div>
  )
}

// ─── Header ───

function ProjectHeader({
  project,
  keywords,
  onDelete,
  isDeleting,
}: {
  project: ProjectDetail
  keywords: DiscoveredKeyword[]
  onDelete: () => void
  isDeleting: boolean
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const tracking = keywords.filter((k) => k.isTracking).length
  const ranked = keywords.filter((k) => k.myRank != null).length

  return (
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-4">
        <Link
          to="/projects"
          className="p-2 -ml-2 text-text-tertiary hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <div className="w-11 h-11 rounded-xl bg-linear-to-br from-accent/20 to-accent/5 border border-accent/10 flex items-center justify-center text-accent font-bold">
          {project.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-text-primary">{project.name}</h1>
            {project.mode === 'pre_launch' && (
              <Badge variant="accent" className="text-[9px]">
                <Rocket size={9} className="mr-0.5" />
                Pre-Launch
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-text-tertiary">
            {project.mode === 'pre_launch' ? (
              <>
                <span>{(project.seedKeywords ?? []).join(', ')}</span>
                <span>|</span>
                <span>{project.region.toUpperCase()}</span>
                <span>|</span>
                <span>{keywords.length} keywords discovered</span>
              </>
            ) : (
              <>
                <span>{project.app?.packageName}</span>
                <span>|</span>
                <span>{project.region.toUpperCase()}</span>
                <span>|</span>
                <span>
                  {keywords.length} keywords, {tracking} tracking, {ranked} ranked
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary">Delete this project?</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmDelete(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={onDelete}
              disabled={isDeleting}
            >
              {isDeleting ? <Spinner className="w-3 h-3" /> : <Trash2 size={13} />}
              <span className="ml-1">Delete</span>
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="text-text-tertiary hover:text-red-400"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={14} />
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Overview Tab ───

function OverviewTab({
  project,
  keywords,
}: {
  project: ProjectDetail
  keywords: DiscoveredKeyword[]
}) {
  const { data: healthData } = useQuery({
    queryKey: ['health-latest', project.appId],
    queryFn: () => health.latest(project.appId),
  })

  const { data: opps } = useQuery({
    queryKey: ['opportunities', project.appId],
    queryFn: () => opportunities.forApp(project.appId),
  })

  const healthScore = healthData?.overallScore ?? 0
  const topOpps = (opps ?? [])
    .sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0))
    .slice(0, 5)

  const tracking = keywords.filter((k) => k.isTracking)
  const ranked = tracking.filter((k) => k.myRank != null && k.myRank <= 10)

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card className="col-span-4 flex flex-col items-center justify-center py-4">
        <HealthGauge score={healthScore} />
      </Card>

      <div className="col-span-8 grid grid-cols-3 gap-4">
        <StatCard label="Keywords Tracked" value={String(tracking.length)} sub={`of ${keywords.length} discovered`} />
        <StatCard label="In Top 10" value={String(ranked.length)} sub="ranked keywords" accent />
        <StatCard label="Competitors" value={String(project.competitors?.length ?? 0)} sub="being monitored" />
        <StatCard
          label="Avg Difficulty"
          value={String(
            Math.round(
              keywords.reduce((s, k) => s + (k.difficulty ?? 0), 0) /
                (keywords.filter((k) => k.difficulty != null).length || 1),
            ),
          )}
          sub="across all keywords"
        />
        <StatCard label="Top Opportunities" value={String(topOpps.length)} sub="high-score keywords" />
        <StatCard label="Region" value={project.region.toUpperCase()} sub="tracking region" />
      </div>

      {topOpps.length > 0 && (
        <Card className="col-span-12">
          <CardHeader>
            <CardTitle>Top Keyword Opportunities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topOpps.map((opp) => (
              <div
                key={opp.id}
                className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
              >
                <span className="text-sm text-text-primary">{opp.suggestedAction}</span>
                <Badge variant={opp.opportunityScore != null && opp.opportunityScore >= 70 ? 'success' : 'default'}>
                  {opp.opportunityScore ?? 0}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1">{label}</p>
      <p className={cn('text-2xl font-bold tabular-nums', accent ? 'text-accent' : 'text-text-primary')}>{value}</p>
      <p className="text-[11px] text-text-muted mt-0.5">{sub}</p>
    </Card>
  )
}

// ─── Keywords Tab ───

function KeywordsTab({
  projectId,
  project,
  keywords,
  keywordsFetching,
}: {
  projectId: string
  project: ProjectDetail
  keywords: DiscoveredKeyword[]
  keywordsFetching: boolean
}) {
  const isPreLaunch = project.mode === 'pre_launch'
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const discover = useMutation({
    mutationFn: () => projectsApi.discoverAll(projectId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['project-keywords', projectId] })
      toast(`Discovered ${data.discovered} keywords, saved ${data.saved} new`, 'success')
    },
    onError: (err) => {
      toast(`Discovery failed: ${(err as Error).message}`, 'error')
    },
  })

  const checkRanks = useMutation({
    mutationFn: () => projectsApi.checkRanks(projectId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['project-keywords', projectId] })
      toast(`Checked ${data.checked} keywords, updated ${data.updated} ranks`, 'success')
    },
    onError: (err) => {
      toast(`Rank check failed: ${(err as Error).message}`, 'error')
    },
  })

  const toggleTrack = useMutation({
    mutationFn: (keywordId: string) => projectsApi.toggleTrack(projectId, keywordId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['project-keywords', projectId] })
      toast(data.isTracking ? 'Now tracking keyword' : 'Stopped tracking keyword', 'info')
    },
  })

  return (
    <div>
      {/* Status banners for long-running operations */}
      <StatusBanner
        isPending={discover.isPending}
        isSuccess={false}
        isError={discover.isError}
        pendingMessage="Discovering keywords from Play Store autocomplete, Google Suggest, and competitors..."
        errorMessage={`Discovery failed: ${(discover.error as Error)?.message ?? 'Unknown error'}`}
      />
      <StatusBanner
        isPending={checkRanks.isPending}
        isSuccess={false}
        isError={checkRanks.isError}
        pendingMessage="Checking keyword ranks on the Play Store..."
        errorMessage={`Rank check failed: ${(checkRanks.error as Error)?.message ?? 'Unknown error'}`}
      />

      {/* Actions bar */}
      <div className="flex items-center gap-3 mb-5">
        <ActionButton
          onClick={() => discover.mutate()}
          isPending={discover.isPending}
          isSuccess={discover.isSuccess}
          isError={discover.isError}
          icon={<Sparkles size={13} />}
          label="Discover Keywords"
          pendingLabel="Discovering..."
          successMessage={discover.data ? `Found ${discover.data.discovered} keywords` : undefined}
          errorMessage="Discovery failed"
          disabled={checkRanks.isPending}
        />
        {!isPreLaunch && (
          <ActionButton
            onClick={() => checkRanks.mutate()}
            isPending={checkRanks.isPending}
            isSuccess={checkRanks.isSuccess}
            isError={checkRanks.isError}
            icon={<RefreshCw size={13} />}
            label="Check Ranks"
            pendingLabel="Checking..."
            successMessage={checkRanks.data ? `Updated ${checkRanks.data.updated} ranks` : undefined}
            errorMessage="Rank check failed"
            disabled={discover.isPending}
          />
        )}

        {/* Refetching indicator */}
        {keywordsFetching && !discover.isPending && !checkRanks.isPending && (
          <span className="text-xs text-text-tertiary flex items-center gap-1.5">
            <Spinner size={11} /> Refreshing...
          </span>
        )}
      </div>

      {keywords.length === 0 && !discover.isPending ? (
        <EmptyState
          icon={<Hash size={32} />}
          title="No keywords discovered yet"
          description="Click 'Discover Keywords' to mine keywords from Play Store autocomplete and competitor analysis"
          action={
            <Button size="sm" onClick={() => discover.mutate()} disabled={discover.isPending}>
              {discover.isPending ? <Spinner size={13} /> : <Sparkles size={13} />}
              {discover.isPending ? 'Discovering...' : 'Discover Keywords'}
            </Button>
          }
        />
      ) : keywords.length === 0 && discover.isPending ? (
        /* Show a nice placeholder while first discovery runs */
        <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
          <Spinner size={28} className="mb-4" />
          <h3 className="text-sm font-medium text-text-secondary mb-1">Mining keywords...</h3>
          <p className="text-xs text-text-tertiary max-w-xs">
            Searching Play Store autocomplete, Google Suggest, and competitor titles.
            This usually takes 10-30 seconds.
          </p>
        </div>
      ) : (
        <KeywordTable
          keywords={keywords}
          onToggleTrack={(id) => toggleTrack.mutate(id)}
        />
      )}
    </div>
  )
}

// ─── Rankings Tab ───

function RankingsTab({ project }: { project: ProjectDetail }) {
  const { data: rankData = [], isLoading } = useQuery({
    queryKey: ['rankings', project.appId],
    queryFn: () => rankings.forApp(project.appId),
  })

  const chartData = useMemo(() => {
    if (rankData.length === 0) return null
    const byDate = new Map<string, Map<string, number>>()
    const keywordLabels = new Map<string, string>()
    for (const snap of rankData) {
      if (!snap.date || !snap.rank || !snap.keywordId) continue
      if (!keywordLabels.has(snap.keywordId)) {
        keywordLabels.set(snap.keywordId, snap.keywordTerm ?? snap.keywordId.slice(0, 8))
      }
      if (!byDate.has(snap.date)) byDate.set(snap.date, new Map())
      byDate.get(snap.date)!.set(snap.keywordId, snap.rank)
    }
    const dates = Array.from(byDate.keys()).sort()
    const series = Array.from(keywordLabels.entries()).slice(0, 8).map(([kwId, label]) => ({
      name: label,
      data: dates.map((d) => byDate.get(d)?.get(kwId) ?? null),
    }))
    return { dates: dates.map((d) => formatDate(d)), series }
  }, [rankData])

  if (isLoading) return <PageLoader />
  if (!chartData) {
    return (
      <EmptyState
        icon={<TrendingUp size={32} />}
        title="No ranking data yet"
        description="Rankings are tracked automatically every 6 hours for keywords you're tracking"
      />
    )
  }
  return <RankChart dates={chartData.dates} series={chartData.series} />
}

// ─── Competitors Tab ───

function CompetitorsTab({ project }: { project: ProjectDetail }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [packageName, setPackageName] = useState('')
  const isPreLaunch = project.mode === 'pre_launch'

  // Auto-discover competitors from seed keywords
  const discoverComps = useMutation({
    mutationFn: () => projectsApi.discoverCompetitors(project.id),
  })

  const addComp = useMutation({
    mutationFn: async (pkgName: string) => {
      const app = await apps.create({
        name: pkgName,
        platform: 'android',
        packageName: pkgName,
        isOurs: false,
      })
      return projectsApi.addCompetitor(project.id, app.id)
    },
    onSuccess: (_data, pkgName) => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] })
      toast(`Added competitor: ${pkgName}`, 'success')
      setPackageName('')
    },
    onError: (err) => {
      toast(`Failed to add competitor: ${(err as Error).message}`, 'error')
    },
  })

  const removeComp = useMutation({
    mutationFn: (appId: string) => projectsApi.removeCompetitor(project.id, appId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] })
      toast('Competitor removed', 'info')
    },
    onError: (err) => {
      toast(`Failed to remove: ${(err as Error).message}`, 'error')
    },
  })

  const competitors = project.competitors ?? []
  const suggestions = discoverComps.data?.competitors ?? []
  const addedPackages = new Set(competitors.map((c) => c.app.packageName))

  return (
    <div>
      {/* Auto-discover competitors */}
      <div className="mb-5">
        <ActionButton
          onClick={() => discoverComps.mutate()}
          isPending={discoverComps.isPending}
          isSuccess={discoverComps.isSuccess}
          isError={discoverComps.isError}
          icon={<SearchIcon size={13} />}
          label="Find Competitors"
          pendingLabel="Searching Play Store..."
          successMessage={suggestions.length > 0 ? `Found ${suggestions.length} apps` : 'No results'}
          errorMessage="Search failed"
        />
      </div>

      {/* Suggested competitors from auto-discovery */}
      {suggestions.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">
            Suggested Competitors
            <span className="ml-2 text-accent">{suggestions.length}</span>
          </h3>
          <div className="space-y-2 stagger-children">
            {suggestions.map((sugg) => {
              const alreadyAdded = addedPackages.has(sugg.packageName)
              return (
                <div
                  key={sugg.packageName}
                  className="flex items-center gap-3 p-3 bg-surface-2 border border-border rounded-[var(--radius-lg)] hover:border-border-hover transition-all"
                >
                  {sugg.icon ? (
                    <img src={sugg.icon} alt="" className="w-9 h-9 rounded-lg shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-surface-1 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-text-muted">
                        {sugg.title.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{sugg.title}</p>
                    <p className="text-[10px] text-text-tertiary truncate">
                      {sugg.developer} · {sugg.packageName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="muted" className="text-[9px]">
                      {sugg.relevanceScore}x match
                    </Badge>
                    <Button
                      size="sm"
                      variant={alreadyAdded ? 'ghost' : 'secondary'}
                      disabled={alreadyAdded || addComp.isPending}
                      onClick={() => addComp.mutate(sugg.packageName)}
                    >
                      {alreadyAdded ? 'Added' : 'Add'}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Manual add competitor form */}
      <div className="flex items-center gap-2 mb-5">
        <div className="relative flex-1 max-w-md">
          <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input
            value={packageName}
            onChange={(e) => setPackageName(e.target.value)}
            placeholder="com.competitor.app"
            className="pl-9"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && packageName.includes('.')) addComp.mutate(packageName)
            }}
            disabled={addComp.isPending}
          />
        </div>
        <Button
          size="sm"
          onClick={() => addComp.mutate(packageName)}
          disabled={!packageName.includes('.') || addComp.isPending}
        >
          {addComp.isPending ? <Spinner size={13} /> : <Plus size={13} />}
          {addComp.isPending ? 'Adding...' : 'Add'}
        </Button>
      </div>

      <StatusBanner
        isPending={addComp.isPending}
        isSuccess={false}
        isError={addComp.isError}
        pendingMessage="Adding competitor..."
        errorMessage={`Failed: ${(addComp.error as Error)?.message ?? 'Unknown error'}`}
      />

      {competitors.length === 0 && !discoverComps.isSuccess ? (
        <EmptyState
          icon={<Users size={32} />}
          title="No competitors tracked"
          description={isPreLaunch
            ? 'Click "Find Competitors" to auto-discover apps from your seed keywords, or add manually'
            : 'Add competitor apps by their Google Play package name to compare rankings and listings'
          }
        />
      ) : competitors.length > 0 ? (
        <div>
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">
            Tracked Competitors
            <span className="ml-2 text-text-muted">{competitors.length}</span>
          </h3>
          <div className="space-y-2 stagger-children">
            {competitors.map((comp) => (
              <CompetitorCard
                key={comp.id}
                app={comp.app}
                onRemove={() => removeComp.mutate(comp.competitorAppId)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ─── Strategy Tab ───

const AGENT_CATALOG: AgentInfo[] = [
  {
    id: 'recon',
    name: 'Competitor Recon',
    description: 'Discover competitors, analyze their listings, and find keyword gaps you can exploit',
    icon: <SearchIcon size={16} />,
    accentClass: 'bg-blue-500/10 text-blue-400',
  },
  {
    id: 'keyword',
    name: 'Keyword Research',
    description: 'Mine keywords from autocomplete, score by difficulty, and find high-value opportunities',
    icon: <Hash size={16} />,
    accentClass: 'bg-violet-500/10 text-violet-400',
  },
  {
    id: 'review',
    name: 'Review Analysis',
    description: 'Scrape user reviews, detect sentiment, and surface pain points and feature requests',
    icon: <MessageSquare size={16} />,
    accentClass: 'bg-amber-500/10 text-amber-400',
  },
  {
    id: 'health',
    name: 'ASO Health Score',
    description: 'Score your listing 0–100 across title, description, visuals, ratings, and more',
    icon: <Activity size={16} />,
    accentClass: 'bg-emerald-500/10 text-emerald-400',
  },
  {
    id: 'creative',
    name: 'Listing Optimizer',
    description: 'Generate optimized title, short description, and full description variants using top keywords',
    icon: <Palette size={16} />,
    accentClass: 'bg-pink-500/10 text-pink-400',
  },
  {
    id: 'risk',
    name: 'Risk Audit',
    description: 'Check for keyword stuffing, policy violations, and anti-ban compliance issues',
    icon: <Shield size={16} />,
    accentClass: 'bg-rose-500/10 text-rose-400',
  },
  {
    id: 'correlation',
    name: 'Change Impact',
    description: 'Analyze how listing changes correlated with rank movements over the last 30 days',
    icon: <GitCompare size={16} />,
    accentClass: 'bg-cyan-500/10 text-cyan-400',
  },
  {
    id: 'cannibalization',
    name: 'Keyword Overlap',
    description: 'Detect if your apps are competing against each other for the same keywords',
    icon: <Layers size={16} />,
    accentClass: 'bg-orange-500/10 text-orange-400',
  },
  {
    id: 'tracker',
    name: 'Rank Tracker',
    description: 'Run a full tracking cycle — scrape current ranks for all tracked keywords',
    icon: <Eye size={16} />,
    accentClass: 'bg-teal-500/10 text-teal-400',
  },
  {
    id: 'experiment',
    name: 'Experiment Planner',
    description: 'Plan A/B test experiments based on current keyword and creative data',
    icon: <FlaskConical size={16} />,
    accentClass: 'bg-indigo-500/10 text-indigo-400',
  },
]

interface FullAnalysisResult {
  data: {
    summary: string
    nextSteps: string[]
  }
}

function StrategyTab({ appId }: { appId: string }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [runningAgents, setRunningAgents] = useState<Set<string>>(new Set())
  const [completedAgents, setCompletedAgents] = useState<Map<string, string>>(new Map())
  const [failedAgents, setFailedAgents] = useState<Set<string>>(new Set())

  const { data: actions = [], isLoading } = useQuery({
    queryKey: ['strategy', appId],
    queryFn: () => strategy.list({ appId }),
  })

  const fullAnalysis = useMutation({
    mutationFn: () => agents.fullAnalysis(appId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategy', appId] })
      queryClient.invalidateQueries({ queryKey: ['project-keywords'] })
      queryClient.invalidateQueries({ queryKey: ['health-latest', appId] })
      queryClient.invalidateQueries({ queryKey: ['reviews', appId] })
      queryClient.invalidateQueries({ queryKey: ['rankings', appId] })
      queryClient.invalidateQueries({ queryKey: ['opportunities', appId] })
      toast('Full analysis complete — check strategy actions below', 'success')
    },
    onError: (err) => {
      toast(`Analysis failed: ${(err as Error).message}`, 'error')
    },
  })

  const runSingleAgent = async (agentId: string) => {
    setRunningAgents((prev) => new Set(prev).add(agentId))
    setFailedAgents((prev) => {
      const next = new Set(prev)
      next.delete(agentId)
      return next
    })
    setCompletedAgents((prev) => {
      const next = new Map(prev)
      next.delete(agentId)
      return next
    })

    try {
      const result = await agents.run(agentId, appId)
      setCompletedAgents((prev) => {
        const next = new Map(prev)
        next.set(agentId, summarizeAgentResult(agentId, result))
        return next
      })
      queryClient.invalidateQueries({ queryKey: ['strategy', appId] })
      // Invalidate related queries based on agent type
      if (agentId === 'keyword') queryClient.invalidateQueries({ queryKey: ['project-keywords'] })
      if (agentId === 'health') queryClient.invalidateQueries({ queryKey: ['health-latest', appId] })
      if (agentId === 'review') queryClient.invalidateQueries({ queryKey: ['reviews', appId] })
      if (agentId === 'tracker') queryClient.invalidateQueries({ queryKey: ['rankings', appId] })
      toast(`${AGENT_CATALOG.find((a) => a.id === agentId)?.name ?? agentId} completed`, 'success')
    } catch (err) {
      setFailedAgents((prev) => new Set(prev).add(agentId))
      toast(`${agentId} agent failed: ${(err as Error).message}`, 'error')
    } finally {
      setRunningAgents((prev) => {
        const next = new Set(prev)
        next.delete(agentId)
        return next
      })
    }
  }

  const approve = useMutation({
    mutationFn: strategy.approve,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategy', appId] })
      toast('Action approved', 'success')
    },
  })

  const reject = useMutation({
    mutationFn: strategy.reject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategy', appId] })
      toast('Action rejected', 'info')
    },
  })

  const anyRunning = runningAgents.size > 0 || fullAnalysis.isPending
  const pending = actions.filter((a) => a.status === 'pending')
  const resolved = actions.filter((a) => a.status !== 'pending')
  const analysisResult = fullAnalysis.data as FullAnalysisResult | undefined

  return (
    <div>
      {/* Full Analysis Banner */}
      <FullAnalysisBanner
        onRun={() => fullAnalysis.mutate()}
        isPending={fullAnalysis.isPending}
        isSuccess={fullAnalysis.isSuccess}
        isError={fullAnalysis.isError}
        disabled={anyRunning}
        summary={analysisResult?.data?.summary}
        nextSteps={analysisResult?.data?.nextSteps}
      />

      {/* Individual Agents */}
      <div className="mt-6">
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">
          Individual Agents
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {AGENT_CATALOG.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onRun={() => runSingleAgent(agent.id)}
              isPending={runningAgents.has(agent.id)}
              isSuccess={completedAgents.has(agent.id)}
              isError={failedAgents.has(agent.id)}
              resultSummary={completedAgents.get(agent.id)}
              disabled={fullAnalysis.isPending}
            />
          ))}
        </div>
      </div>

      {/* Pending Actions */}
      {isLoading ? (
        <div className="mt-8"><PageLoader /></div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="mt-8">
              <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">
                Pending Actions
                <span className="ml-2 text-accent">{pending.length}</span>
              </h3>
              <div className="space-y-3 stagger-children">
                {pending.map((action) => (
                  <ActionCard
                    key={action.id}
                    action={action}
                    onApprove={() => approve.mutate(action.id)}
                    onReject={() => reject.mutate(action.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {resolved.length > 0 && (
            <div className="mt-8">
              <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">
                Action History
                <span className="ml-2 text-text-muted">{resolved.length}</span>
              </h3>
              <div className="space-y-2">
                {resolved.slice(0, 20).map((action) => (
                  <ActionCard key={action.id} action={action} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function summarizeAgentResult(agentId: string, result: unknown): string {
  const data = (result as { data?: Record<string, unknown> })?.data
  if (!data) return 'Completed'

  switch (agentId) {
    case 'recon': {
      const competitors = (data.competitors as unknown[])?.length ?? 0
      return `Found ${competitors} competitors`
    }
    case 'keyword': {
      const count = (data as { keywordsAnalyzed?: number }).keywordsAnalyzed ?? 0
      return `Scored ${count} keywords`
    }
    case 'review': {
      const count = (data as { reviewsAnalyzed?: number }).reviewsAnalyzed ?? 0
      return `Analyzed ${count} reviews`
    }
    case 'health': {
      const score = (data as { overallScore?: number }).overallScore ?? 0
      const grade = (data as { grade?: string }).grade ?? ''
      return `Health: ${score}/100 (${grade})`
    }
    case 'creative': {
      const variants = (data.variants as unknown[])?.length ?? 0
      return `Generated ${variants} listing variants`
    }
    case 'risk': {
      const score = (data as { riskScore?: number }).riskScore ?? 0
      const grade = (data as { grade?: string }).grade ?? ''
      return `Risk: ${score}/100 (${grade})`
    }
    case 'correlation': {
      const count = (data.correlations as unknown[])?.length ?? 0
      return `Found ${count} correlations`
    }
    case 'cannibalization': {
      const score = (data as { overlapScore?: number }).overlapScore ?? 0
      return `Overlap score: ${score}/100`
    }
    case 'tracker':
      return 'Tracking cycle completed'
    case 'experiment':
      return 'Experiment plan generated'
    default:
      return 'Completed'
  }
}

// ─── Reviews Tab ───

function ReviewsTab({ appId }: { appId: string }) {
  const { data: allReviews = [], isLoading } = useQuery({
    queryKey: ['reviews', appId],
    queryFn: () => reviewsApi.forApp(appId),
  })

  if (isLoading) return <PageLoader />

  const distribution = [1, 2, 3, 4, 5].map((rating) => ({
    rating,
    count: allReviews.filter((r) => r.rating === rating).length,
  }))

  const avgRating =
    allReviews.length > 0
      ? (allReviews.reduce((s, r) => s + (r.rating ?? 0), 0) / allReviews.length).toFixed(1)
      : '—'

  return (
    <div>
      <div className="grid grid-cols-12 gap-4 mb-6">
        <Card className="col-span-4 p-5 flex flex-col items-center justify-center">
          <p className="text-4xl font-bold text-text-primary tabular-nums">{avgRating}</p>
          <p className="text-[11px] text-text-tertiary mt-1">
            Average from {allReviews.length} reviews
          </p>
        </Card>
        <div className="col-span-8">
          <SentimentChart data={distribution} />
        </div>
      </div>

      <h3 className="text-sm font-semibold text-text-primary mb-3">Recent Reviews</h3>
      {allReviews.length === 0 ? (
        <EmptyState
          icon={<MessageSquare size={32} />}
          title="No reviews yet"
          description="Reviews will appear here once the review agent has scraped them"
        />
      ) : (
        <div className="space-y-2">
          {allReviews.slice(0, 30).map((review) => (
            <ReviewItem key={review.id} review={review} />
          ))}
        </div>
      )}
    </div>
  )
}

function ReviewItem({ review }: { review: Review }) {
  const ratingColor =
    (review.rating ?? 0) >= 4 ? 'text-emerald' : (review.rating ?? 0) >= 3 ? 'text-amber' : 'text-rose'

  return (
    <div className="p-3 bg-surface-1 border border-border rounded-[var(--radius-md)]">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={cn('text-sm font-semibold tabular-nums', ratingColor)}>
          {'★'.repeat(review.rating ?? 0)}
          {'☆'.repeat(5 - (review.rating ?? 0))}
        </span>
        <span className="text-[11px] text-text-muted">{review.author ?? 'Anonymous'}</span>
        {review.date && (
          <span className="text-[10px] text-text-muted ml-auto">{formatDate(review.date)}</span>
        )}
      </div>
      {review.text && (
        <p className="text-sm text-text-secondary leading-relaxed line-clamp-3">{review.text}</p>
      )}
    </div>
  )
}
