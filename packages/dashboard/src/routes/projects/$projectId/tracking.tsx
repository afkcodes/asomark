import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { TrendingUp } from 'lucide-react'
import { PageLoader, EmptyState } from '#/components/ui/spinner'
import { RankChart } from '#/components/charts/rank-chart'
import { HealthGauge } from '#/components/charts/health-gauge'
import { Card, CardHeader, CardTitle, CardContent } from '#/components/ui/card'
import { rankings, health } from '#/lib/api'
import { useProjectContext } from '#/lib/project-context'
import { formatDate } from '#/lib/utils'

export const Route = createFileRoute('/projects/$projectId/tracking')({
  component: TrackingSection,
})

function TrackingSection() {
  const { project } = useProjectContext()

  const { data: rankData = [], isLoading } = useQuery({
    queryKey: ['rankings', project.appId],
    queryFn: () => rankings.forApp(project.appId),
  })

  const { data: healthData } = useQuery({
    queryKey: ['health-latest', project.appId],
    queryFn: () => health.latest(project.appId),
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

  return (
    <div className="space-y-6">
      {/* Health Score */}
      {healthData && (
        <div className="grid grid-cols-12 gap-4">
          <Card className="col-span-4 flex flex-col items-center justify-center py-4">
            <HealthGauge score={healthData.overallScore ?? 0} />
          </Card>
          <Card className="col-span-8 p-5">
            <CardHeader className="p-0 mb-3">
              <CardTitle className="text-sm">ASO Health Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {healthData.breakdownJson ? (
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(healthData.breakdownJson as Record<string, number>).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between text-sm">
                      <span className="text-text-tertiary capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <span className="text-text-primary font-medium tabular-nums">{value}/100</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-text-muted">Run the health check to see breakdown</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Rank Chart */}
      {!chartData ? (
        <EmptyState
          icon={<TrendingUp size={32} />}
          title="No ranking data yet"
          description="Rankings are tracked automatically every 6 hours for keywords you're tracking. Mark keywords as tracked in the Keywords section."
        />
      ) : (
        <div>
          <h3 className="text-sm font-semibold text-text-primary mb-3">Keyword Rank History</h3>
          <RankChart dates={chartData.dates} series={chartData.series} />
        </div>
      )}
    </div>
  )
}
