import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardContent } from '#/components/ui/card'
import { Badge } from '#/components/ui/badge'
import { PageLoader, EmptyState } from '#/components/ui/spinner'
import { cn, formatDate } from '#/lib/utils'
import { api } from '#/lib/api'

interface ChangeLogEntry {
  id: string
  appId: string
  appName: string
  packageName: string | null
  changeType: string | null
  field: string | null
  oldValue: string | null
  newValue: string | null
  source: string | null
  timestamp: string | null
}

interface ListingDiff {
  appId: string
  appName: string
  packageName: string | null
  date: string | null
  changes: { field: string; oldValue: string | null; newValue: string | null }[]
}

interface CompChangesResponse {
  changelog: ChangeLogEntry[]
  diffs: ListingDiff[]
  apps: { id: string; name: string; packageName: string | null }[]
}

export function ChangeHistory({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['competitor-changes', projectId],
    queryFn: () => api.get<CompChangesResponse>(`/api/projects/${projectId}/competitor-changes`),
  })

  if (isLoading) return <PageLoader />
  if (!data || (data.changelog.length === 0 && data.diffs.length === 0)) {
    return (
      <EmptyState
        title="No changes detected yet"
        description="Changes will appear here as the tracker monitors your competitors' listings over time."
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Listing Diffs */}
      {data.diffs.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
            Listing Changes
            <span className="ml-2 text-text-muted">{data.diffs.length}</span>
          </h3>
          {data.diffs.map((diff, i) => (
            <DiffCard key={`${diff.appId}-${diff.date}-${i}`} diff={diff} />
          ))}
        </div>
      )}

      {/* Raw Changelog */}
      {data.changelog.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              Change Log
              <span className="ml-2 text-text-muted font-normal">{data.changelog.length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border-subtle">
              {data.changelog.slice(0, 50).map((entry) => (
                <ChangeLogRow key={entry.id} entry={entry} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function DiffCard({ diff }: { diff: ListingDiff }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">{diff.appName}</CardTitle>
            {diff.packageName && (
              <span className="text-[10px] font-mono text-text-muted">{diff.packageName}</span>
            )}
          </div>
          {diff.date && (
            <span className="text-[10px] text-text-muted">{formatDate(diff.date)}</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {diff.changes.map((change, i) => (
          <div key={i} className="space-y-1.5">
            <Badge variant="muted" className="text-[10px] uppercase">
              {fieldLabel(change.field)}
            </Badge>
            <div className="grid grid-cols-2 gap-3">
              {change.oldValue && (
                <div className="rounded-lg bg-red-500/5 border border-red-500/10 p-3">
                  <p className="text-[10px] text-red-400 font-medium mb-1">Before</p>
                  <p className="text-xs text-text-secondary leading-relaxed line-clamp-4 whitespace-pre-wrap">
                    {change.oldValue}
                  </p>
                </div>
              )}
              {change.newValue && (
                <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 p-3">
                  <p className="text-[10px] text-emerald-400 font-medium mb-1">After</p>
                  <p className="text-xs text-text-secondary leading-relaxed line-clamp-4 whitespace-pre-wrap">
                    {change.newValue}
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function ChangeLogRow({ entry }: { entry: ChangeLogEntry }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text-primary">{entry.appName}</span>
          {entry.changeType && (
            <Badge
              className={cn(
                'text-[10px]',
                entry.changeType === 'title_change' && 'bg-purple-500/15 text-purple-400 border-purple-500/20',
                entry.changeType === 'description_change' && 'bg-blue-500/15 text-blue-400 border-blue-500/20',
                entry.changeType === 'icon_update' && 'bg-amber-500/15 text-amber-400 border-amber-500/20',
              )}
            >
              {entry.changeType?.replace(/_/g, ' ')}
            </Badge>
          )}
        </div>
        {entry.field && (
          <p className="text-[11px] text-text-secondary mt-0.5">
            <span className="text-text-muted">{fieldLabel(entry.field)}:</span>{' '}
            {entry.newValue ? truncate(entry.newValue, 80) : 'removed'}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {entry.source && (
          <span className="text-[9px] text-text-muted font-mono">{entry.source}</span>
        )}
        {entry.timestamp && (
          <span className="text-[10px] text-text-muted tabular-nums">{formatDate(entry.timestamp)}</span>
        )}
      </div>
    </div>
  )
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    title: 'Title',
    shortDesc: 'Short Description',
    longDesc: 'Full Description',
    iconUrl: 'Icon',
    version: 'Version',
    installsText: 'Installs',
    screenshotUrls: 'Screenshots',
    videoUrl: 'Video',
  }
  return labels[field] ?? field
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '...' : text
}
