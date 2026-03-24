import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { rankChartOptions } from '#/lib/echarts'
import { Card, CardHeader, CardTitle, CardContent } from '#/components/ui/card'

echarts.use([LineChart, TooltipComponent, GridComponent, LegendComponent, DataZoomComponent, CanvasRenderer])

interface RankChartProps {
  title?: string
  dates: string[]
  series: { name: string; data: (number | null)[] }[]
  height?: number
}

export function RankChart({ title = 'Rank History', dates, series, height = 320 }: RankChartProps) {
  const options = rankChartOptions(dates, series)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="pr-2">
        <ReactEChartsCore
          echarts={echarts}
          option={options}
          style={{ height }}
          notMerge
          lazyUpdate
          theme="dark"
        />
      </CardContent>
    </Card>
  )
}
