import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Zap, ArrowRight, Brain } from 'lucide-react'
import { strategy, projects as projectsApi, type StrategyAction, type Project } from '#/lib/api'
import { ActionCard } from '#/components/strategy/action-card'
import { Badge } from '#/components/ui/badge'
import { PageLoader, EmptyState } from '#/components/ui/spinner'
import { useToast } from '#/components/ui/toast'

export const Route = createFileRoute('/strategy/')({
  component: StrategyPage,
})

function StrategyPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: actions = [], isLoading } = useQuery({
    queryKey: ['strategy-all'],
    queryFn: () => strategy.list(),
  })

  const { data: allProjects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
  })

  const approve = useMutation({
    mutationFn: strategy.approve,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategy-all'] })
      toast('Action approved', 'success')
    },
  })

  const reject = useMutation({
    mutationFn: strategy.reject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategy-all'] })
      toast('Action rejected', 'info')
    },
  })

  const pending = actions.filter((a) => a.status === 'pending')
  const resolved = actions.filter((a) => a.status !== 'pending')

  // Group pending actions by appId
  const pendingByApp = new Map<string, StrategyAction[]>()
  for (const action of pending) {
    const key = action.appId ?? 'unknown'
    if (!pendingByApp.has(key)) pendingByApp.set(key, [])
    pendingByApp.get(key)!.push(action)
  }

  // Build appId → project lookup
  const projectByAppId = new Map<string, Project>()
  for (const p of allProjects) {
    projectByAppId.set(p.appId, p)
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-text-primary">Strategy Queue</h1>
        <p className="text-sm text-text-tertiary mt-1">
          AI-generated optimization actions across all your projects
        </p>
      </div>

      {/* Quick stats */}
      {!isLoading && actions.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="p-4 bg-surface-2 border border-border rounded-[var(--radius-lg)]">
            <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1">
              Pending
            </p>
            <p className="text-2xl font-bold text-accent tabular-nums">{pending.length}</p>
            <p className="text-[11px] text-text-muted mt-0.5">awaiting your decision</p>
          </div>
          <div className="p-4 bg-surface-2 border border-border rounded-[var(--radius-lg)]">
            <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1">
              Approved
            </p>
            <p className="text-2xl font-bold text-emerald tabular-nums">
              {actions.filter((a) => a.status === 'approved').length}
            </p>
            <p className="text-[11px] text-text-muted mt-0.5">actions taken</p>
          </div>
          <div className="p-4 bg-surface-2 border border-border rounded-[var(--radius-lg)]">
            <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1">
              Total Actions
            </p>
            <p className="text-2xl font-bold text-text-primary tabular-nums">{actions.length}</p>
            <p className="text-[11px] text-text-muted mt-0.5">
              across {pendingByApp.size} project{pendingByApp.size !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <PageLoader />
      ) : actions.length === 0 ? (
        <EmptyState
          icon={<Brain size={32} />}
          title="No strategy actions yet"
          description="Go to a project's Strategy tab to run AI agents. They'll analyze your app and generate optimization recommendations here."
          action={
            allProjects.length > 0 ? (
              <Link
                to="/projects/$projectId"
                params={{ projectId: allProjects[0]!.id }}
                className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline mt-2"
              >
                Go to {allProjects[0]!.name}
                <ArrowRight size={14} />
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div>
          {/* Pending actions grouped by project */}
          {pending.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-4">
                Needs Your Decision
                <span className="ml-2 text-accent">{pending.length}</span>
              </h2>

              {Array.from(pendingByApp.entries()).map(([appId, appActions]) => {
                const project = projectByAppId.get(appId)
                return (
                  <div key={appId} className="mb-6 last:mb-0">
                    {/* Project header */}
                    <div className="flex items-center gap-2 mb-3">
                      {project ? (
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: project.id }}
                          className="text-sm font-semibold text-text-primary hover:text-accent transition-colors"
                        >
                          {project.name}
                        </Link>
                      ) : (
                        <span className="text-sm font-semibold text-text-secondary">
                          {appId.slice(0, 12)}...
                        </span>
                      )}
                      <Badge variant="muted">{appActions.length}</Badge>
                    </div>

                    <div className="space-y-3 stagger-children">
                      {appActions.map((action) => (
                        <ActionCard
                          key={action.id}
                          action={action}
                          onApprove={() => approve.mutate(action.id)}
                          onReject={() => reject.mutate(action.id)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* History */}
          {resolved.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">
                Action History
                <span className="ml-2 text-text-muted">{resolved.length}</span>
              </h2>
              <div className="space-y-2">
                {resolved.slice(0, 50).map((action) => (
                  <ActionCard key={action.id} action={action} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
