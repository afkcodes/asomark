import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  Sparkles,
  RefreshCw,
  Hash,
  Globe,
  Layers,
  Trash2,
  BarChart3,
  ScanSearch,
  Brain,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { EmptyState, Spinner } from '#/components/ui/spinner'
import { ActionButton } from '#/components/ui/action-button'
import { StatusBanner } from '#/components/ui/status-banner'
import { useToast } from '#/components/ui/toast'
import { KeywordTable } from '#/components/keywords/keyword-table'
import { SeoTab } from '#/components/seo/seo-tab'
import { GscTab } from '#/components/seo/gsc-tab'
import { SiteAuditTab } from '#/components/seo/site-audit-tab'
import { AiVisibilityTab } from '#/components/seo/ai-visibility-tab'
import { OverlapMatrix } from '#/components/keywords/overlap-matrix'
import { projects as projectsApi } from '#/lib/api'
import { useProjectContext } from '#/lib/project-context'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/projects/$projectId/keywords')({
  component: KeywordsSection,
})

type SubView = 'aso' | 'seo' | 'gsc' | 'audit' | 'ai' | 'overlap'

function KeywordsSection() {
  const { project, keywords, projectId, keywordsFetching } = useProjectContext()
  const isPreLaunch = project.mode === 'pre_launch'
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [view, setView] = useState<SubView>('aso')

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

  const deleteAll = useMutation({
    mutationFn: () => projectsApi.deleteAllKeywords(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-keywords', projectId] })
      toast('All keywords deleted', 'info')
    },
  })

  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)

  const subViews: { id: SubView; label: string; icon: typeof Hash; liveOnly?: boolean }[] = [
    { id: 'aso', label: 'ASO Keywords', icon: Hash },
    { id: 'seo', label: 'Web SEO', icon: Globe },
    { id: 'gsc', label: 'Search Console', icon: BarChart3 },
    { id: 'audit', label: 'Site Audit', icon: ScanSearch },
    { id: 'ai', label: 'AI Visibility', icon: Brain },
    ...(!isPreLaunch ? [{ id: 'overlap' as SubView, label: 'Overlap', icon: Layers }] : []),
  ]

  return (
    <div>
      {/* Sub-view pills */}
      <div className="flex items-center gap-1 mb-5 pb-3 border-b border-border/50">
        {subViews.map((sv) => (
          <button
            key={sv.id}
            onClick={() => setView(sv.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer',
              view === sv.id
                ? 'bg-accent/10 text-accent'
                : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-1',
            )}
          >
            <sv.icon size={12} />
            {sv.label}
            {sv.id === 'aso' && keywords.length > 0 && (
              <span className="text-[10px] opacity-60">{keywords.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ASO Keywords view */}
      {view === 'aso' && (
        <div>
          {/* Status banners */}
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
            {keywords.length > 0 && (
              confirmDeleteAll ? (
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs text-text-tertiary">Delete all {keywords.length} keywords?</span>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteAll(false)}>Cancel</Button>
                  <Button size="sm" variant="danger" onClick={() => { deleteAll.mutate(); setConfirmDeleteAll(false) }}>
                    <Trash2 size={12} />
                    Delete All
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteAll(true)}
                  className="ml-auto text-xs text-text-muted hover:text-rose transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Trash2 size={11} />
                  Clear All
                </button>
              )
            )}
            {keywordsFetching && !discover.isPending && !checkRanks.isPending && (
              <span className="text-xs text-text-tertiary flex items-center gap-1.5">
                <Spinner size={11} /> Refreshing...
              </span>
            )}
          </div>

          {/* Keyword Table */}
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
      )}

      {/* SEO Keywords view */}
      {view === 'seo' && (
        <div className="animate-fade-in">
          <SeoTab projectId={projectId} projectName={project.name} />
        </div>
      )}

      {/* Search Console view */}
      {view === 'gsc' && (
        <div className="animate-fade-in">
          <GscTab projectId={projectId} />
        </div>
      )}

      {/* AI Visibility view */}
      {view === 'ai' && (
        <div className="animate-fade-in">
          <AiVisibilityTab projectId={projectId} />
        </div>
      )}

      {/* Site Audit view */}
      {view === 'audit' && (
        <div className="animate-fade-in">
          <SiteAuditTab projectId={projectId} />
        </div>
      )}

      {/* Overlap Matrix view */}
      {view === 'overlap' && !isPreLaunch && (
        <div className="animate-fade-in">
          <OverlapMatrix projectId={projectId} />
        </div>
      )}
    </div>
  )
}
