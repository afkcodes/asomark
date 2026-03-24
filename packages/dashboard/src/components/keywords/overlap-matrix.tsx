import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardContent } from '#/components/ui/card'
import { Badge } from '#/components/ui/badge'
import { PageLoader, EmptyState } from '#/components/ui/spinner'
import { cn } from '#/lib/utils'
import { api } from '#/lib/api'

interface OverlapApp {
  id: string
  name: string
  packageName: string | null
  isOurs: boolean
}

interface OverlapRow {
  keyword: string
  difficulty: number | null
  volume: number | null
  myRank: number | null
  bestCompRank: number | null
  bestCompPackage: string | null
  appRanks: Record<string, number | null>
  flags: {
    cannibalized: boolean
    opportunity: boolean
    threat: boolean
  }
}

interface OverlapPair {
  app1: string
  app2: string
  sharedKeywords: number
}

interface OverlapResponse {
  apps: OverlapApp[]
  matrix: OverlapRow[]
  overlap: OverlapPair[]
  summary: {
    totalKeywords: number
    rankedKeywords: number
    opportunities: number
    threats: number
    cannibalized: number
  }
}

export function OverlapMatrix({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['keyword-overlap', projectId],
    queryFn: () => api.get<OverlapResponse>(`/api/projects/${projectId}/keyword-overlap`),
  })

  if (isLoading) return <PageLoader />
  if (!data || data.matrix.length === 0) {
    return <EmptyState title="No keywords to analyze" description="Discover keywords first to see the overlap matrix." />
  }

  const { apps: overlapApps, matrix, overlap, summary } = data

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-3">
        <SummaryCard label="Total Keywords" value={summary.totalKeywords} />
        <SummaryCard label="We Rank For" value={summary.rankedKeywords} color="text-emerald-400" />
        <SummaryCard label="Opportunities" value={summary.opportunities} color="text-blue-400" />
        <SummaryCard label="Threats" value={summary.threats} color="text-amber-400" />
        <SummaryCard label="Cannibalized" value={summary.cannibalized} color="text-red-400" />
      </div>

      {/* Overlap Pairs */}
      {overlap.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Keyword Overlap with Competitors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {overlap.map((pair) => (
                <div
                  key={`${pair.app1}-${pair.app2}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-secondary"
                >
                  <span className="text-xs font-mono text-text-secondary truncate max-w-[140px]">
                    {pair.app2.split('.').pop()}
                  </span>
                  <Badge variant={pair.sharedKeywords > 10 ? 'danger' : 'muted'} className="text-[10px]">
                    {pair.sharedKeywords} shared
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Matrix Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            Keyword Matrix
            <span className="ml-2 text-text-muted font-normal">{matrix.length} keywords</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="text-left px-4 py-2.5 text-text-tertiary font-medium uppercase tracking-wider">Keyword</th>
                  <th className="text-center px-3 py-2.5 text-text-tertiary font-medium uppercase tracking-wider">My Rank</th>
                  <th className="text-center px-3 py-2.5 text-text-tertiary font-medium uppercase tracking-wider">Best Comp.</th>
                  <th className="text-center px-3 py-2.5 text-text-tertiary font-medium uppercase tracking-wider">Difficulty</th>
                  <th className="text-center px-3 py-2.5 text-text-tertiary font-medium uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((row) => (
                  <tr key={row.keyword} className="border-b border-border-subtle/50 hover:bg-surface-secondary/50 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-text-primary">{row.keyword}</span>
                    </td>
                    <td className="text-center px-3 py-2.5">
                      <RankCell rank={row.myRank} isOurs />
                    </td>
                    <td className="text-center px-3 py-2.5">
                      <RankCell rank={row.bestCompRank} />
                      {row.bestCompPackage && (
                        <div className="text-[9px] text-text-muted mt-0.5 font-mono">
                          {row.bestCompPackage.split('.').pop()}
                        </div>
                      )}
                    </td>
                    <td className="text-center px-3 py-2.5">
                      <DifficultyBar value={row.difficulty} />
                    </td>
                    <td className="text-center px-3 py-2.5">
                      {row.flags.opportunity && (
                        <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/20 text-[10px]">Opportunity</Badge>
                      )}
                      {row.flags.threat && (
                        <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/20 text-[10px]">Threat</Badge>
                      )}
                      {row.flags.cannibalized && (
                        <Badge className="bg-red-500/15 text-red-400 border-red-500/20 text-[10px]">Cannibalized</Badge>
                      )}
                      {!row.flags.opportunity && !row.flags.threat && !row.flags.cannibalized && row.myRank != null && (
                        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-[10px]">Ranked</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <Card className="p-4 text-center">
      <p className={cn('text-2xl font-bold tabular-nums', color ?? 'text-text-primary')}>{value}</p>
      <p className="text-[10px] text-text-tertiary mt-0.5 uppercase tracking-wider">{label}</p>
    </Card>
  )
}

function RankCell({ rank, isOurs }: { rank: number | null; isOurs?: boolean }) {
  if (rank == null) return <span className="text-text-muted">—</span>
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center w-8 h-5 rounded text-[11px] font-semibold tabular-nums',
        rank <= 3 && 'bg-emerald-500/20 text-emerald-400',
        rank > 3 && rank <= 10 && 'bg-amber-500/20 text-amber-400',
        rank > 10 && 'bg-surface-tertiary text-text-secondary',
        isOurs && rank <= 3 && 'ring-1 ring-emerald-500/30',
      )}
    >
      #{rank}
    </span>
  )
}

function DifficultyBar({ value }: { value: number | null }) {
  if (value == null) return <span className="text-text-muted">—</span>
  const color =
    value <= 30 ? 'bg-emerald-500' : value <= 60 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-1.5 justify-center">
      <div className="w-12 h-1.5 rounded-full bg-surface-tertiary overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] text-text-secondary tabular-nums">{value}</span>
    </div>
  )
}
