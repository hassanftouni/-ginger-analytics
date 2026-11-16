import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import type { DailyPoint } from '@/types/analytics'
import { formatCompactMoney, formatMoney, formatNumber } from '@/utils/format'
import { ChartTooltip } from './ChartTooltip'
import { CHART, axisProps } from './chartTheme'

type Metric = 'revenue' | 'orders'
type Grain = 'day' | 'week' | 'month'

/** ISO week start (Monday) for a yyyy-mm-dd date. */
function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day)
  return d.toISOString().slice(0, 10)
}

function bucket(date: string, grain: Grain): string {
  if (grain === 'week') return weekStart(date)
  if (grain === 'month') return date.slice(0, 7)
  return date
}

interface DailyTrendChartProps {
  points: DailyPoint[]
  currency: string
}

/** Revenue or orders over time for one currency (currencies never share an axis). */
export function DailyTrendChart({ points, currency }: DailyTrendChartProps) {
  const [metric, setMetric] = useState<Metric>('revenue')
  const [grain, setGrain] = useState<Grain>('day')

  const data = useMemo(() => {
    const map = new Map<string, { label: string; revenue: number; orders: number; ordersKnown: boolean }>()
    for (const p of points) {
      if (p.currency !== currency) continue
      const key = bucket(p.date, grain)
      const acc = map.get(key) ?? { label: key, revenue: 0, orders: 0, ordersKnown: true }
      acc.revenue += p.revenue
      if (p.orders === undefined) acc.ordersKnown = false
      else acc.orders += p.orders
      map.set(key, acc)
    }
    return [...map.values()]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((a) => ({ label: a.label, revenue: a.revenue, orders: a.ordersKnown ? a.orders : null }))
  }, [points, currency, grain])

  const ordersAvailable = data.some((d) => d.orders !== null)
  const activeMetric = metric === 'orders' && !ordersAvailable ? 'revenue' : metric
  const format = activeMetric === 'revenue' ? (v: number) => formatMoney(v, currency) : (v: number) => formatNumber(v)
  const tick = activeMetric === 'revenue' ? (v: number) => formatCompactMoney(v, currency) : (v: number) => formatNumber(v)

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          label="Metric"
          value={activeMetric}
          onChange={setMetric}
          options={[
            { value: 'revenue', label: `Revenue (${currency})` },
            ...(ordersAvailable ? [{ value: 'orders' as Metric, label: 'Orders' }] : []),
          ]}
        />
        <SegmentedControl
          label="Granularity"
          value={grain}
          onChange={setGrain}
          options={[
            { value: 'day', label: 'Daily' },
            { value: 'week', label: 'Weekly' },
            { value: 'month', label: 'Monthly' },
          ]}
        />
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="label" {...axisProps} minTickGap={24} />
          <YAxis {...axisProps} axisLine={false} tickFormatter={tick} width={80} />
          <Tooltip content={(p) => <ChartTooltip {...p} formatValue={format} />} />
          <Line
            isAnimationActive={false}
            type="linear"
            dataKey={activeMetric}
            name={activeMetric === 'revenue' ? `Revenue (${currency})` : 'Orders'}
            stroke={CHART.primary}
            strokeWidth={2}
            dot={data.length <= 31 ? { r: 3, strokeWidth: 0, fill: CHART.primary } : false}
            activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
