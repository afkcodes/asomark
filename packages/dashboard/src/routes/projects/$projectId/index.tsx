import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Hash,
  Users,
  FileText,
  TrendingUp,
  CheckCircle2,
  Circle,
  ChevronRight,
  MessageSquareText,
  Activity,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '#/components/ui/card'
import { Badge } from '#/components/ui/badge'
import { HealthGauge } from '#/components/charts/health-gauge'
import { ActionCard } from '#/components/strategy/action-card'
import { PageLoader, Spinner } from '#/components/ui/spinner'
import { useToast } from '#/components/ui/toast'
import { health, opportunities, strategy, agents, type StrategyAction, type ProjectDetail, type DiscoveredKeyword } from '#/lib/api'
import { useProjectContext } from '#/lib/project-context'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/projects/$projectId/')({
  component: DashboardSection,
})

function DashboardSection() {
  const { project, keywords, projectId } = useProjectContext()

  const { data: healthData } = useQuery({
    queryKey: ['health-latest', project.appId],
    queryFn: () => health.latest(project.appId),
  })

  const { data: opps } = useQuery({
    queryKey: ['opportunities', project.appId],
    queryFn: () => opportunities.forApp(project.appId),
  })

  const { data: actions = [] } = useQuery({
    queryKey: ['strategy', project.appId],
    queryFn: () => strategy.list({ appId: project.appId }),
  })

  const queryClient = useQueryClient()
  const { toast } = useToast()

  const runHealthCheck = useMutation({
    mutationFn: () => agents.run('health', project.appId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health-latest', project.appId] })
      toast('Health check complete', 'success')
    },
    onError: (err) => {
      toast(`Health check failed: ${(err as Error).message}`, 'error')
    },
  })

  const healthScore = healthData?.overallScore ?? 0
  const topOpps = (opps ?? [])
    .sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0))
    .slice(0, 5)

  const tracking = keywords.filter((k) => k.isTracking)
  const ranked = tracking.filter((k) => k.myRank != null && k.myRank <= 10)
  const pending = actions.filter((a) => a.status === 'pending')
  const isPreLaunch = project.mode === 'pre_launch'

  return (
    <div className="space-y-6">
      {/* Progress Checklist */}
      <ProgressChecklist project={project} keywords={keywords} projectId={projectId} />

      {/* Stats + Health */}
      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-4 flex flex-col items-center justify-center py-4 gap-3">
          <HealthGauge score={healthScore} />
          <Button
            size="sm"
            variant={healthScore > 0 ? 'ghost' : 'secondary'}
            onClick={() => runHealthCheck.mutate()}
            disabled={runHealthCheck.isPending}
            className="text-xs"
          >
            {runHealthCheck.isPending ? (
              <><Spinner size={11} /> Checking...</>
            ) : (
              <><Activity size={11} /> {healthScore > 0 ? 'Recheck' : 'Run Health Check'}</>
            )}
          </Button>
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
      </div>

      {/* Top Opportunities */}
      {topOpps.length > 0 && (
        <Card>
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

      {/* Pending Actions */}
      <PendingActions actions={pending} appId={project.appId} />
    </div>
  )
}

// ─── Progress Checklist ───

function ProgressChecklist({
  project,
  keywords,
  projectId,
}: {
  project: ProjectDetail
  keywords: DiscoveredKeyword[]
  projectId: string
}) {
  const isPreLaunch = project.mode === 'pre_launch'
  const basePath = `/projects/${projectId}`

  const steps = [
    ...(!isPreLaunch ? [] : [{
      label: 'Describe your app',
      done: !!project.appDescription,
      to: `${basePath}/listing`,
      icon: MessageSquareText,
    }]),
    {
      label: 'Discover keywords',
      done: keywords.length > 0,
      to: `${basePath}/keywords`,
      icon: Hash,
    },
    {
      label: 'Find competitors',
      done: (project.competitors?.length ?? 0) > 0,
      to: `${basePath}/competitors`,
      icon: Users,
    },
    {
      label: isPreLaunch ? 'Write your listing' : 'Review your listing',
      done: !isPreLaunch, // Live apps already have a listing
      to: `${basePath}/listing`,
      icon: FileText,
    },
    ...(!isPreLaunch
      ? [
          {
            label: 'Track your rankings',
            done: keywords.some((k) => k.isTracking),
            to: `${basePath}/tracking`,
            icon: TrendingUp,
          },
        ]
      : []),
  ]

  const completed = steps.filter((s) => s.done).length
  const total = steps.length
  const pct = Math.round((completed / total) * 100)

  if (completed === total) return null

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary">Getting Started</h3>
          <span className="text-xs text-text-tertiary">{completed}/{total} complete</span>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-surface-1 rounded-full mb-4 overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="space-y-1">
          {steps.map((step) => (
            <Link
              key={step.label}
              to={step.to}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md transition-colors group',
                step.done
                  ? 'text-text-tertiary'
                  : 'text-text-primary hover:bg-surface-1',
              )}
            >
              {step.done ? (
                <CheckCircle2 size={15} className="text-emerald shrink-0" />
              ) : (
                <Circle size={15} className="text-text-muted shrink-0" />
              )}
              <span className={cn('text-sm flex-1', step.done && 'line-through')}>{step.label}</span>
              {!step.done && (
                <ChevronRight size={13} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Pending Actions ───

function PendingActions({ actions, appId }: { actions: StrategyAction[]; appId: string }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

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

  if (actions.length === 0) return null

  return (
    <div>
      <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">
        AI Recommendations
        <span className="ml-2 text-accent">{actions.length}</span>
      </h3>
      <div className="space-y-3 stagger-children">
        {actions.slice(0, 5).map((action) => (
          <ActionCard
            key={action.id}
            action={action as never}
            onApprove={() => approve.mutate(action.id)}
            onReject={() => reject.mutate(action.id)}
          />
        ))}
        {actions.length > 5 && (
          <Link
            to="/strategy"
            className="text-xs text-accent hover:text-accent-hover transition-colors"
          >
            View all {actions.length} recommendations →
          </Link>
        )}
      </div>
    </div>
  )
}

// ─── Stat Card ───

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1">{label}</p>
      <p className={cn('text-2xl font-bold tabular-nums', accent ? 'text-accent' : 'text-text-primary')}>{value}</p>
      <p className="text-[11px] text-text-muted mt-0.5">{sub}</p>
    </Card>
  )
}
