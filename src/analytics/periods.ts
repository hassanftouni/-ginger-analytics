import type { DailyPoint, PeriodRow, SalesExtremes } from '@/types/analytics'
import { addDays, percentChange } from './metrics'

export type Grain = 'week' | 'month'

/** ISO week start (Monday) for a yyyy-mm-dd date. */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

function bucketBounds(date: string, grain: Grain): { key: string; start: string; end: string } {
  if (grain === 'week') {
    const start = weekStart(date)
    return { key: start, start, end: addDays(start, 6) }
  }
  const start = `${date.slice(0, 7)}-01`
  const next = new Date(`${start}T00:00:00Z`)
  next.setUTCMonth(next.getUTCMonth() + 1)
  return { key: date.slice(0, 7), start, end: addDays(next.toISOString().slice(0, 10), -1) }
}

/**
 * Weekly or monthly totals per currency with change versus the previous bucket.
 * AOV is weighted (revenue ÷ orders). Buckets that extend beyond the analysed range are
 * flagged as partial so incomplete weeks are not read as declines.
 */
export function periodTable(daily: DailyPoint[], grain: Grain, range: { start: string; end: string } | null): PeriodRow[] {
  const map = new Map<string, PeriodRow & { ordersKnown: boolean }>()
  for (const p of daily) {
    const b = bucketBounds(p.date, grain)
    const id = `${b.key}|${p.currency}`
    const row = map.get(id) ?? {
      ...b,
      currency: p.currency,
      days: 0,
      revenue: 0,
      orders: 0,
      ordersKnown: true,
      averageOrderValue: undefined,
      revenueChange: undefined,
      ordersChange: undefined,
      partial: false,
    }
    row.days++
    row.revenue += p.revenue
    if (p.orders === undefined) row.ordersKnown = false
    else row.orders = (row.orders ?? 0) + p.orders
    map.set(id, row)
  }

  const rows = [...map.values()]
    .map(({ ordersKnown, ...r }) => ({
      ...r,
      orders: ordersKnown ? r.orders : undefined,
      averageOrderValue: ordersKnown && r.orders ? r.revenue / r.orders : undefined,
      partial: range ? r.start < range.start || r.end > range.end : false,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency) || a.start.localeCompare(b.start))

  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]
    const cur = rows[i]
    if (prev.currency !== cur.currency) continue
    cur.revenueChange = percentChange(cur.revenue, prev.revenue)
    cur.ordersChange = cur.orders !== undefined && prev.orders !== undefined ? percentChange(cur.orders, prev.orders) : undefined
  }
  return rows
}

/** Highest and lowest revenue day per currency (needs at least two days). */
export function salesExtremes(daily: DailyPoint[]): SalesExtremes[] {
  const byCurrency = new Map<string, DailyPoint[]>()
  for (const p of daily) byCurrency.set(p.currency, [...(byCurrency.get(p.currency) ?? []), p])
  const result: SalesExtremes[] = []
  for (const [currency, points] of byCurrency) {
    if (points.length < 2) continue
    const sorted = [...points].sort((a, b) => b.revenue - a.revenue || a.date.localeCompare(b.date))
    result.push({ currency, highest: sorted[0], lowest: sorted[sorted.length - 1], days: points.length })
  }
  return result.sort((a, b) => a.currency.localeCompare(b.currency))
}
