import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { GaugeChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
import { echartsTheme } from '#/lib/echarts'

echarts.use([GaugeChart, CanvasRenderer])

export function HealthGauge({ score, size = 160 }: { score: number; size?: number }) {
  const color =
    score >= 80 ? '#34d399' : score >= 60 ? '#fbbf24' : score >= 40 ? '#fb923c' : '#f87171'

  const option = {
    ...echartsTheme,
    series: [
      {
        type: 'gauge',
        startAngle: 220,
        endAngle: -40,
        min: 0,
        max: 100,
        radius: '100%',
        progress: {
          show: true,
          width: 10,
          roundCap: true,
          itemStyle: { color },
        },
        pointer: { show: false },
        axisLine: {
          lineStyle: { width: 10, color: [[1, '#1e232d']] },
          roundCap: true,
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        detail: {
          valueAnimation: true,
          offsetCenter: [0, '10%'],
          fontSize: 28,
          fontWeight: 700,
          fontFamily: 'Inter',
          color,
          formatter: '{value}',
        },
        title: {
          offsetCenter: [0, '45%'],
          fontSize: 11,
          color: '#636c80',
          fontFamily: 'Inter',
        },
        data: [{ value: score, name: 'Health Score' }],
      },
    ],
  }

  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      style={{ width: size, height: size }}
      notMerge
      lazyUpdate
      theme="dark"
    />
  )
}
