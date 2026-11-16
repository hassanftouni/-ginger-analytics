import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartTooltip } from './ChartTooltip'
import { CHART, axisProps } from './chartTheme'

export interface BarDatum {
  label: string
  value: number
}

interface BarListProps {
  data: BarDatum[]
  seriesName: string
  formatValue: (value: number) => string
  formatTick?: (value: number) => string
  /** Horizontal bars suit long category labels (branches, products). */
  layout?: 'horizontal' | 'vertical'
  maxBars?: number
}

/** Single-series bar chart: one hue, thin bars, rounded data-ends, hover tooltip. */
export function BarList({ data, seriesName, formatValue, formatTick, layout = 'horizontal', maxBars = 12 }: BarListProps) {
  const rows = data.slice(0, maxBars)
  const tick = formatTick ?? formatValue

  if (layout === 'vertical') {
    return (
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} axisLine={false} tickFormatter={tick} width={72} />
          <Tooltip cursor={{ fill: '#f1f5f9' }} content={(p) => <ChartTooltip {...p} formatValue={formatValue} />} />
          <Bar isAnimationActive={false} dataKey="value" name={seriesName} fill={CHART.primary} radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  const height = Math.max(160, rows.length * 34 + 40)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid horizontal={false} stroke={CHART.grid} />
        <XAxis type="number" {...axisProps} tickFormatter={tick} />
        <YAxis type="category" dataKey="label" {...axisProps} axisLine={false} width={140} interval={0} />
        <Tooltip cursor={{ fill: '#f1f5f9' }} content={(p) => <ChartTooltip {...p} formatValue={formatValue} />} />
        <Bar isAnimationActive={false} dataKey="value" name={seriesName} fill={CHART.primary} radius={[0, 4, 4, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  )
}
