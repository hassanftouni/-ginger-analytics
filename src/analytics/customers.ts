import type { ActivityPoint, Bucket, CustomerActivity, CustomerInsights, CustomerRow, ScopedRecord } from '@/types/analytics'
import { anonymiseCustomer } from '@/utils/hash'
import { formatNumber } from '@/utils/format'

/**
 * Daily customer activity. Daily returning-customer counts are summed as "customer-days";
 * they are never presented as distinct returning customers, and never treated as orders.
 */
export function customerActivity(records: ScopedRecord[]): CustomerActivity {
  const byDate = new Map<string, ActivityPoint>()
  const has = { reg: false, new: false, ret: false }
  for (const r of records) {
    if (r.category !== 'customer-activity' || !r.date) continue
    const p = byDate.get(r.date) ?? { date: r.date }
    if (r.newRegistrations !== undefined) {
      p.newRegistrations = (p.newRegistrations ?? 0) + r.newRegistrations
      has.reg = true
    }
    if (r.newCustomers !== undefined) {
      p.newCustomers = (p.newCustomers ?? 0) + r.newCustomers
      has.new = true
    }
    if (r.returningCustomers !== undefined) {
      p.returningCustomers = (p.returningCustomers ?? 0) + r.returningCustomers
      has.ret = true
    }
    byDate.set(r.date, p)
  }
  const daily = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  const sum = (k: keyof Omit<ActivityPoint, 'date'>) => daily.reduce((s, p) => s + (p[k] ?? 0), 0)
  return {
    daily,
    totals: {
      newRegistrations: has.reg ? sum('newRegistrations') : undefined,
      newCustomers: has.new ? sum('newCustomers') : undefined,
      returningCustomerDays: has.ret ? sum('returningCustomers') : undefined,
    },
    range: daily.length > 0 ? { start: daily[0].date, end: daily[daily.length - 1].date } : null,
  }
}

/**
 * Bucket upper bounds following a 1 – 2.5 – 5 progression up to the first value ≥ max,
 * keeping the last eight so the chart stays readable. Presentation only — not a business rule.
 */
export function niceBounds(max: number): number[] {
  if (max <= 0) return [0]
  const bounds: number[] = []
  for (let magnitude = 1; bounds.length === 0 || bounds[bounds.length - 1] < max; magnitude *= 10) {
    for (const step of [1, 2.5, 5]) {
      bounds.push(step * magnitude)
      if (step * magnitude >= max) break
    }
  }
  return bounds.slice(-8)
}

function spendBuckets(values: number[], currency: string): Bucket[] {
  const bounds = niceBounds(Math.max(...values))
  const buckets: Bucket[] = bounds.map((upper, i) => ({
    label: i === 0 ? `≤ ${formatNumber(upper)} ${currency}` : `${formatNumber(bounds[i - 1])}–${formatNumber(upper)} ${currency}`,
    count: 0,
  }))
  for (const v of values) {
    const i = bounds.findIndex((b) => v <= b)
    buckets[i === -1 ? buckets.length - 1 : i].count++
  }
  return buckets
}

const FREQUENCY: { label: string; min: number; max: number }[] = [
  { label: '1 order', min: 1, max: 1 },
  { label: '2 orders', min: 2, max: 2 },
  { label: '3 orders', min: 3, max: 3 },
  { label: '4–5 orders', min: 4, max: 5 },
  { label: '6–10 orders', min: 6, max: 10 },
  { label: '11+ orders', min: 11, max: Infinity },
]

/** Top-customer analytics. Names are carried only so the UI can reveal them on request. */
export function customerInsights(records: ScopedRecord[]): CustomerInsights {
  const rows: CustomerRow[] = records
    .filter((r) => r.category === 'customers' && r.customerId)
    .map((r) => ({
      anonId: anonymiseCustomer(r.customerId as string),
      name: r.customerName,
      currency: r.currencyCode,
      spend: r.revenue ?? 0,
      orders: r.orderCount,
      averageOrderValue: r.revenue !== undefined && r.orderCount ? r.revenue / r.orderCount : undefined,
      exportedAverage: r.averageOrderValue,
    }))
    .sort((a, b) => b.spend - a.spend)

  const spendByCurrency: Record<string, number> = {}
  for (const r of rows) spendByCurrency[r.currency] = (spendByCurrency[r.currency] ?? 0) + r.spend
  const allOrdersKnown = rows.length > 0 && rows.every((r) => r.orders !== undefined)

  const currencies = Object.keys(spendByCurrency).sort()
  const frequencyDistribution = rows.some((r) => r.orders !== undefined)
    ? FREQUENCY.map((f) => ({ label: f.label, count: rows.filter((r) => r.orders !== undefined && r.orders >= f.min && r.orders <= f.max).length }))
    : []

  return {
    rows,
    count: rows.length,
    spendByCurrency,
    totalOrders: allOrdersKnown ? rows.reduce((s, r) => s + (r.orders ?? 0), 0) : undefined,
    spendDistribution: currencies.map((c) => ({ currency: c, buckets: spendBuckets(rows.filter((r) => r.currency === c).map((r) => r.spend), c) })),
    frequencyDistribution,
  }
}
