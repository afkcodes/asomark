import type { EChartsOption } from 'echarts'

/** ASOMARK ECharts theme — matches our design system */
export const echartsTheme = {
  backgroundColor: 'transparent',
  textStyle: {
    fontFamily: 'Inter, -apple-system, sans-serif',
    color: '#9ca3b4',
    fontSize: 11,
  },
  title: {
    textStyle: { color: '#f0f2f5', fontSize: 14, fontWeight: 500 },
  },
  legend: {
    textStyle: { color: '#9ca3b4', fontSize: 11 },
    icon: 'roundRect',
    itemWidth: 12,
    itemHeight: 8,
  },
  tooltip: {
    backgroundColor: '#161a22',
    borderColor: '#1e232d',
    borderWidth: 1,
    textStyle: { color: '#f0f2f5', fontSize: 12 },
    extraCssText: 'border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);',
  },
  xAxis: {
    axisLine: { lineStyle: { color: '#1e232d' } },
    axisTick: { show: false },
    axisLabel: { color: '#636c80', fontSize: 10 },
    splitLine: { lineStyle: { color: '#1e232d20' } },
  },
  yAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#636c80', fontSize: 10 },
    splitLine: { lineStyle: { color: '#1e232d' } },
  },
  grid: {
    left: 48,
    right: 24,
    top: 32,
    bottom: 32,
    containLabel: false,
  },
}

/** Color palette for multi-series charts */
export const chartColors = [
  '#6366f1', // indigo (primary)
  '#34d399', // emerald
  '#fbbf24', // amber
  '#f87171', // red
  '#a78bfa', // violet
  '#38bdf8', // sky
  '#fb923c', // orange
  '#e879f9', // fuchsia
]

/** Rank chart — Y-axis inverted (rank 1 at top) */
export function rankChartOptions(
  dates: string[],
  series: { name: string; data: (number | null)[] }[],
): EChartsOption {
  return {
    ...echartsTheme,
    xAxis: {
      ...echartsTheme.xAxis,
      type: 'category',
      data: dates,
      boundaryGap: false,
    },
    yAxis: {
      ...echartsTheme.yAxis,
      type: 'value',
      inverse: true,
      min: 1,
      axisLabel: {
        ...echartsTheme.yAxis.axisLabel,
        formatter: '#{value}',
      },
    },
    tooltip: {
      ...echartsTheme.tooltip,
      trigger: 'axis',
    },
    legend: {
      ...echartsTheme.legend,
      bottom: 0,
    },
    grid: { left: 48, right: 24, top: 16, bottom: 40 },
    series: series.map((s, i) => ({
      name: s.name,
      type: 'line' as const,
      data: s.data,
      smooth: true,
      symbol: 'circle',
      symbolSize: 4,
      lineStyle: { width: 2, color: chartColors[i % chartColors.length] },
      itemStyle: { color: chartColors[i % chartColors.length] },
      areaStyle: {
        color: {
          type: 'linear' as const,
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: `${chartColors[i % chartColors.length]}20` },
            { offset: 1, color: `${chartColors[i % chartColors.length]}00` },
          ],
        },
      },
      connectNulls: true,
    })),
    dataZoom: [{ type: 'inside', start: 0, end: 100 }],
  }
}
