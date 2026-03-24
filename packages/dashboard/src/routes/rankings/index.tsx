import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { TrendingUp } from 'lucide-react'
import { projects as projectsApi, rankings } from '#/lib/api'
import { RankChart } from '#/components/charts/rank-chart'
import { PageLoader, EmptyState } from '#/components/ui/spinner'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { formatDate } from '#/lib/utils'

export const Route = createFileRoute('/rankings/')({
  component: RankingsPage,
})

function RankingsPage() {
  const { data: allProjects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  })

  if (loadingProjects) return <PageLoader />

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-text-primary">Rankings</h1>
        <p className="text-sm text-text-tertiary mt-1">
          Keyword rank performance across all projects
        </p>
      </div>

      {allProjects.length === 0 ? (
        <EmptyState
          icon={<TrendingUp size={32} />}
          title="No projects yet"
          description="Create a project to start tracking keyword rankings"
        />
      ) : (
        <div className="space-y-6">
          {allProjects.map((project) => (
            <ProjectRankings key={project.id} appId={project.appId} name={project.name} />
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectRankings({ appId, name }: { appId: string; name: string }) {
  const { data: rankData = [], isLoading } = useQuery({
    queryKey: ['rankings', appId],
    queryFn: () => rankings.forApp(appId),
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

  if (isLoading) return <Card className="p-8"><PageLoader /></Card>
  if (!chartData) return null

  return <RankChart title={name} dates={chartData.dates} series={chartData.series} />
}
