import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  Search as SearchIcon,
  Users,
  Plus,
  ChevronDown,
  ChevronRight,
  GitCompare,
  MessageSquare,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Badge } from '#/components/ui/badge'
import { EmptyState, Spinner, PageLoader } from '#/components/ui/spinner'
import { ActionButton } from '#/components/ui/action-button'
import { StatusBanner } from '#/components/ui/status-banner'
import { useToast } from '#/components/ui/toast'
import { CompetitorCard } from '#/components/competitors/competitor-card'
import { ChangeHistory } from '#/components/competitors/change-history'
import { SentimentChart } from '#/components/charts/sentiment-chart'
import {
  projects as projectsApi,
  apps,
  reviews as reviewsApi,
} from '#/lib/api'
import { cn, formatDate } from '#/lib/utils'
import { useProjectContext } from '#/lib/project-context'

export const Route = createFileRoute('/projects/$projectId/competitors')({
  component: CompetitorsSection,
})

function CompetitorsSection() {
  const { project, projectId } = useProjectContext()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [packageName, setPackageName] = useState('')
  const [showChanges, setShowChanges] = useState(false)
  const [showReviews, setShowReviews] = useState(false)
  const isPreLaunch = project.mode === 'pre_launch'

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
      {/* Auto-discover */}
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

      {/* Suggestions */}
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
                      <span className="text-xs font-bold text-text-muted">{sugg.title.charAt(0)}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{sugg.title}</p>
                    <p className="text-[10px] text-text-tertiary truncate">
                      {sugg.developer} · {sugg.packageName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="muted" className="text-[9px]">{sugg.relevanceScore}x match</Badge>
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

      {/* Manual add */}
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

      {/* Tracked competitors */}
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

      {/* Change History (collapsible) */}
      {!isPreLaunch && (
        <div className="mt-8 border-t border-border pt-6">
          <button
            onClick={() => setShowChanges(!showChanges)}
            className="flex items-center gap-2 text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors cursor-pointer w-full text-left"
          >
            <GitCompare size={14} />
            Competitor Listing Changes
            {showChanges ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {showChanges && (
            <div className="mt-4 animate-fade-in">
              <ChangeHistory projectId={projectId} />
            </div>
          )}
        </div>
      )}

      {/* Review Analysis (collapsible) */}
      {!isPreLaunch && (
        <div className="mt-6 border-t border-border pt-6">
          <button
            onClick={() => setShowReviews(!showReviews)}
            className="flex items-center gap-2 text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors cursor-pointer w-full text-left"
          >
            <MessageSquare size={14} />
            Review Analysis
            {showReviews ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {showReviews && (
            <div className="mt-4 animate-fade-in">
              <ReviewsSection appId={project.appId} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Reviews Sub-section ───

function ReviewsSection({ appId }: { appId: string }) {
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
        <div className="col-span-4 p-5 bg-surface-1 border border-border rounded-[var(--radius-md)] flex flex-col items-center justify-center">
          <p className="text-4xl font-bold text-text-primary tabular-nums">{avgRating}</p>
          <p className="text-[11px] text-text-tertiary mt-1">
            Average from {allReviews.length} reviews
          </p>
        </div>
        <div className="col-span-8">
          <SentimentChart data={distribution} />
        </div>
      </div>

      {allReviews.length === 0 ? (
        <EmptyState
          icon={<MessageSquare size={32} />}
          title="No reviews yet"
          description="Reviews will appear here once discovered"
        />
      ) : (
        <div className="space-y-2">
          {allReviews.slice(0, 20).map((review) => (
            <div
              key={review.id}
              className="p-3 bg-surface-1 border border-border rounded-[var(--radius-md)]"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className={cn(
                  'text-sm font-semibold tabular-nums',
                  (review.rating ?? 0) >= 4 ? 'text-emerald' : (review.rating ?? 0) >= 3 ? 'text-amber' : 'text-rose',
                )}>
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
          ))}
        </div>
      )}
    </div>
  )
}
