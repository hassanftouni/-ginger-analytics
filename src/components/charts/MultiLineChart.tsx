import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartTooltip } from './ChartTooltip'
import { CHART, SERIES, axisProps } from './chartTheme'

export interface LineSeries {
  key: string
  name: string
}

interface MultiLineChartProps {
  data: Record<string, string | number | undefined>[]
  xKey: string
  series: LineSeries[]
  formatValue: (v: number) => string
}

/** Up to three series on one count axis, colours in the validated fixed order, with a legend. */
export function MultiLineChart({ data, xKey, series, formatValue }: MultiLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey={xKey} {...axisProps} minTickGap={24} />
        <YAxis {...axisProps} axisLine={false} width={48} tickFormatter={formatValue} allowDecimals={false} />
        <Tooltip content={(p) => <ChartTooltip {...p} formatValue={formatValue} />} />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: CHART.axis }} />
        {series.map((s, i) => (
          <Line
            key={s.key}
            isAnimationActive={false}
            type="linear"
            dataKey={s.key}
            name={s.name}
            stroke={SERIES[i]}
            strokeWidth={2}
            dot={data.length <= 31 ? { r: 3, strokeWidth: 0, fill: SERIES[i] } : false}
            activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
