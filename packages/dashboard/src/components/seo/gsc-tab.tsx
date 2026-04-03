import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Link2,
  RefreshCw,
  TrendingUp,
  MousePointerClick,
  Eye,
  BarChart3,
  Unlink,
  ExternalLink,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent } from '#/components/ui/card'
import { EmptyState, Spinner } from '#/components/ui/spinner'
import { useToast } from '#/components/ui/toast'
import { gsc, type GscQueryRow } from '#/lib/api'
import { cn } from '#/lib/utils'

interface GscTabProps {
  projectId: string
}

export function GscTab({ projectId }: GscTabProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [view, setView] = useState<'queries' | 'pages' | 'overlap'>('queries')

  const { data: conn, isLoading: connLoading } = useQuery({
    queryKey: ['gsc-connection', projectId],
    queryFn: () => gsc.connection(projectId),
  })

  const { data: queries } = useQuery({
    queryKey: ['gsc-top-queries', projectId],
    queryFn: () => gsc.topQueries(projectId, { limit: 100 }),
    enabled: conn?.connected === true,
  })

  const { data: pages } = useQuery({
    queryKey: ['gsc-top-pages', projectId],
    queryFn: () => gsc.topPages(projectId),
    enabled: conn?.connected === true && view === 'pages',
  })

  const { data: overlapData } = useQuery({
    queryKey: ['gsc-overlap', projectId],
    queryFn: () => gsc.overlap(projectId),
    enabled: conn?.connected === true && view === 'overlap',
  })

  const connectMutation = useMutation({
    mutationFn: async () => {
      const { url } = await gsc.getAuthUrl(projectId)
      window.location.href = url
    },
    onError: (err) => {
      toast(`Failed to connect: ${(err as Error).message}`, 'error')
    },
  })

  const syncMutation = useMutation({
    mutationFn: () => gsc.sync(projectId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['gsc-top-queries', projectId] })
      queryClient.invalidateQueries({ queryKey: ['gsc-top-pages', projectId] })
      queryClient.invalidateQueries({ queryKey: ['gsc-overlap', projectId] })
      toast(`Synced ${data.synced} rows (${data.dateRange.from} to ${data.dateRange.to})`, 'success')
    },
    onError: (err) => {
      toast(`Sync failed: ${(err as Error).message}`, 'error')
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: () => gsc.disconnect(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gsc-connection', projectId] })
      toast('Google Search Console disconnected', 'info')
    },
  })

  if (connLoading) return <div className="py-8 flex justify-center"><Spinner size={24} /></div>

  // Not connected — show connect prompt
  if (!conn?.connected) {
    return (
      <EmptyState
        icon={<Link2 size={32} />}
        title="Connect Google Search Console"
        description="See real clicks, impressions, CTR, and position data for your website keywords. Connect your Google account to get started."
        action={
          <Button
            onClick={() => connectMutation.mutate()}
            disabled={connectMutation.isPending}
          >
            {connectMutation.isPending ? <Spinner size={13} /> : <ExternalLink size={13} />}
            <span className="ml-1.5">Connect with Google</span>
          </Button>
        }
      />
    )
  }

  // Connected — show data
  const queryRows = queries?.data ?? []
  const totalClicks = queryRows.reduce((s, r) => s + r.clicks, 0)
  const totalImpressions = queryRows.reduce((s, r) => s + r.impressions, 0)
  const avgPosition = queryRows.length > 0
    ? queryRows.reduce((s, r) => s + r.avgPosition, 0) / queryRows.length
    : 0
  const avgCtr = queryRows.length > 0
    ? queryRows.reduce((s, r) => s + r.avgCtr, 0) / queryRows.length
    : 0

  return (
    <div className="space-y-5">
      {/* Connection info + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          <span className="w-2 h-2 rounded-full bg-emerald" />
          Connected: <span className="text-text-secondary">{conn.siteUrl}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? <Spinner size={11} /> : <RefreshCw size={11} />}
            <span className="ml-1">{syncMutation.isPending ? 'Syncing...' : 'Sync Now'}</span>
          </Button>
          <button
            onClick={() => disconnectMutation.mutate()}
            className="text-[10px] text-text-muted hover:text-rose transition-colors cursor-pointer flex items-center gap-1"
          >
            <Unlink size={10} />
            Disconnect
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={MousePointerClick} label="Clicks" value={totalClicks.toLocaleString()} color="text-accent" />
        <StatCard icon={Eye} label="Impressions" value={totalImpressions.toLocaleString()} color="text-blue-400" />
        <StatCard icon={TrendingUp} label="Avg Position" value={avgPosition > 0 ? avgPosition.toFixed(1) : '—'} color="text-emerald" />
        <StatCard icon={BarChart3} label="Avg CTR" value={avgCtr > 0 ? `${(avgCtr * 100).toFixed(1)}%` : '—'} color="text-amber" />
      </div>

      {/* Sub-view tabs */}
      <div className="flex items-center gap-1 border-b border-border/50 pb-px">
        {(['queries', 'pages', 'overlap'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors cursor-pointer capitalize',
              view === v
                ? 'text-text-primary border-b-2 border-accent -mb-px'
                : 'text-text-tertiary hover:text-text-secondary',
            )}
          >
            {v === 'queries' ? 'Top Queries' : v === 'pages' ? 'Top Pages' : 'Keyword Overlap'}
          </button>
        ))}
      </div>

      {/* Query data */}
      {queryRows.length === 0 && !syncMutation.isPending ? (
        <EmptyState
          title="No search data yet"
          description="Click 'Sync Now' to pull data from Google Search Console. Data is typically 2-3 days behind."
          action={
            <Button size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
              <RefreshCw size={12} />
              <span className="ml-1">Sync Now</span>
            </Button>
          }
        />
      ) : (
        <>
          {view === 'queries' && <QueriesTable rows={queryRows} />}
          {view === 'pages' && <PagesTable rows={pages?.data ?? []} />}
          {view === 'overlap' && <OverlapView data={overlapData} />}
        </>
      )}
    </div>
  )
}

// ─── Sub-components ───

function StatCard({ icon: Icon, label, value, color }: { icon: typeof TrendingUp; label: string; value: string; color: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={12} className={color} />
        <span className="text-[10px] text-text-muted uppercase tracking-wider">{label}</span>
      </div>
      <p className={cn('text-xl font-bold tabular-nums', color)}>{value}</p>
    </Card>
  )
}

function QueriesTable({ rows }: { rows: GscQueryRow[] }) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-1 text-[10px] text-text-muted uppercase tracking-wider">
            <th className="text-left p-3">Query</th>
            <th className="text-right p-3 w-24">Clicks</th>
            <th className="text-right p-3 w-28">Impressions</th>
            <th className="text-right p-3 w-20">CTR</th>
            <th className="text-right p-3 w-24">Position</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border/50 hover:bg-surface-1/50 transition-colors">
              <td className="p-3 text-text-primary">{row.query || '(not set)'}</td>
              <td className="p-3 text-right tabular-nums text-text-primary font-medium">{row.clicks}</td>
              <td className="p-3 text-right tabular-nums text-text-secondary">{row.impressions}</td>
              <td className="p-3 text-right tabular-nums text-text-secondary">{(row.avgCtr * 100).toFixed(1)}%</td>
              <td className="p-3 text-right tabular-nums">
                <span className={cn(
                  'font-medium',
                  row.avgPosition <= 3 ? 'text-emerald' :
                  row.avgPosition <= 10 ? 'text-accent' :
                  row.avgPosition <= 20 ? 'text-amber' : 'text-text-tertiary',
                )}>
                  {row.avgPosition.toFixed(1)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PagesTable({ rows }: { rows: Array<{ page: string | null; clicks: number; impressions: number; avgPosition: number }> }) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-1 text-[10px] text-text-muted uppercase tracking-wider">
            <th className="text-left p-3">Page</th>
            <th className="text-right p-3 w-24">Clicks</th>
            <th className="text-right p-3 w-28">Impressions</th>
            <th className="text-right p-3 w-24">Avg Pos</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border/50 hover:bg-surface-1/50 transition-colors">
              <td className="p-3 text-text-primary truncate max-w-md">{row.page || '/'}</td>
              <td className="p-3 text-right tabular-nums text-text-primary font-medium">{row.clicks}</td>
              <td className="p-3 text-right tabular-nums text-text-secondary">{row.impressions}</td>
              <td className="p-3 text-right tabular-nums text-text-secondary">{row.avgPosition.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function OverlapView({ data }: { data?: { data: Array<{ query: string | null; clicks: number; impressions: number; avgPosition: number; inSeoKeywords: boolean }>; summary: { totalGscQueries: number; matchingSeoKeywords: number; newOpportunities: number } } }) {
  if (!data) return <div className="py-8 flex justify-center"><Spinner size={20} /></div>

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3">
          <p className="text-[10px] text-text-muted uppercase mb-1">GSC Queries</p>
          <p className="text-lg font-bold text-text-primary">{data.summary.totalGscQueries}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-text-muted uppercase mb-1">Match SEO Keywords</p>
          <p className="text-lg font-bold text-emerald">{data.summary.matchingSeoKeywords}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-text-muted uppercase mb-1">New Opportunities</p>
          <p className="text-lg font-bold text-accent">{data.summary.newOpportunities}</p>
          <p className="text-[10px] text-text-muted">queries not in your SEO keywords</p>
        </Card>
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-1 text-[10px] text-text-muted uppercase tracking-wider">
              <th className="text-left p-3">Query</th>
              <th className="text-right p-3 w-24">Clicks</th>
              <th className="text-right p-3 w-28">Impressions</th>
              <th className="text-right p-3 w-24">Position</th>
              <th className="text-center p-3 w-24">In SEO KWs</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((row, i) => (
              <tr key={i} className="border-t border-border/50 hover:bg-surface-1/50 transition-colors">
                <td className="p-3 text-text-primary">{row.query || '(not set)'}</td>
                <td className="p-3 text-right tabular-nums font-medium">{row.clicks}</td>
                <td className="p-3 text-right tabular-nums text-text-secondary">{row.impressions}</td>
                <td className="p-3 text-right tabular-nums text-text-secondary">{row.avgPosition.toFixed(1)}</td>
                <td className="p-3 text-center">
                  {row.inSeoKeywords ? (
                    <Badge variant="success" className="text-[9px]">Yes</Badge>
                  ) : (
                    <Badge variant="accent" className="text-[9px]">New</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
