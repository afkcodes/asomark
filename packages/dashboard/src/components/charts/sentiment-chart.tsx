import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { TooltipComponent, GridComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { echartsTheme } from '#/lib/echarts'
import { Card, CardHeader, CardTitle, CardContent } from '#/components/ui/card'

echarts.use([BarChart, TooltipComponent, GridComponent, CanvasRenderer])

interface SentimentChartProps {
  data: { rating: number; count: number }[]
  height?: number
}

export function SentimentChart({ data, height = 200 }: SentimentChartProps) {
  const colors = ['#f87171', '#fb923c', '#fbbf24', '#a3e635', '#34d399']

  const option = {
    ...echartsTheme,
    tooltip: {
      ...echartsTheme.tooltip,
      trigger: 'axis',
    },
    xAxis: {
      ...echartsTheme.xAxis,
      type: 'category',
      data: data.map((d) => `${d.rating}\u2605`),
    },
    yAxis: {
      ...echartsTheme.yAxis,
      type: 'value',
    },
    grid: { left: 40, right: 16, top: 16, bottom: 28 },
    series: [
      {
        type: 'bar',
        data: data.map((d, i) => ({
          value: d.count,
          itemStyle: {
            color: colors[i],
            borderRadius: [4, 4, 0, 0],
          },
        })),
        barWidth: '50%',
      },
    ],
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rating Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <ReactEChartsCore
          echarts={echarts}
          option={option}
          style={{ height }}
          notMerge
          lazyUpdate
          theme="dark"
        />
      </CardContent>
    </Card>
  )
}
