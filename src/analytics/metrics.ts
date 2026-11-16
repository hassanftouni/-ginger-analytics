import type { CurrencyTotals, DailyPoint, GroupBreakdown, GroupRow, ProductRow, RatingSummary, SalesFact, ScopedRecord } from '@/types/analytics'
import type { ExchangeRate } from '@/types/settings'

interface Acc {
  revenue: number
  orders: number
  ordersKnown: boolean
}

const newAcc = (): Acc => ({ revenue: 0, orders: 0, ordersKnown: true })

function add(acc: Acc, f: SalesFact) {
  acc.revenue += f.revenue ?? 0
  if (f.orders === undefined) acc.ordersKnown = false
  else acc.orders += f.orders
}

const aov = (a: Acc) => (a.ordersKnown && a.orders > 0 ? a.revenue / a.orders : undefined)

export function totalsByCurrency(facts: SalesFact[]): CurrencyTotals[] {
  const map = new Map<string, Acc>()
  for (const f of facts) {
    const acc = map.get(f.currencyCode) ?? newAcc()
    add(acc, f)
    map.set(f.currencyCode, acc)
  }
  return [...map.entries()]
    .map(([currency, a]) => ({ currency, revenue: a.revenue, orders: a.ordersKnown ? a.orders : undefined, averageOrderValue: aov(a) }))
    .sort((a, b) => a.currency.localeCompare(b.currency))
}

/** Total orders across currencies; undefined if any contributing fact lacks an order count. */
export function totalOrders(facts: SalesFact[]): number | undefined {
  if (facts.length === 0) return undefined
  let total = 0
  for (const f of facts) {
    if (f.orders === undefined) return undefined
    total += f.orders
  }
  return total
}

export function dailySeries(facts: SalesFact[]): DailyPoint[] {
  const map = new Map<string, Acc & { date: string; currency: string }>()
  for (const f of facts) {
    if (!f.date) continue
    const key = `${f.date}|${f.currencyCode}`
    const acc = map.get(key) ?? { ...newAcc(), date: f.date, currency: f.currencyCode }
    add(acc, f)
    map.set(key, acc)
  }
  return [...map.values()]
    .map((a) => ({ date: a.date, currency: a.currency, revenue: a.revenue, orders: a.ordersKnown ? a.orders : undefined }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency))
}

/** Group facts by a key within each currency; shares are computed per currency. */
export function groupFacts(facts: SalesFact[], keyOf: (f: SalesFact) => string | undefined, labelOf: (key: string) => string, basis: string): GroupBreakdown {
  const map = new Map<string, Acc & { key: string; currency: string }>()
  const currencyTotals = new Map<string, number>()
  for (const f of facts) {
    const key = keyOf(f)
    if (!key) continue
    const id = `${key}|${f.currencyCode}`
    const acc = map.get(id) ?? { ...newAcc(), key, currency: f.currencyCode }
    add(acc, f)
    map.set(id, acc)
    currencyTotals.set(f.currencyCode, (currencyTotals.get(f.currencyCode) ?? 0) + (f.revenue ?? 0))
  }
  const rows: GroupRow[] = [...map.values()]
    .map((a) => {
      const total = currencyTotals.get(a.currency) ?? 0
      return {
        key: a.key,
        label: labelOf(a.key),
        currency: a.currency,
        revenue: a.revenue,
        orders: a.ordersKnown ? a.orders : undefined,
        averageOrderValue: aov(a),
        share: total > 0 ? a.revenue / total : 0,
      }
    })
    .sort((a, b) => a.currency.localeCompare(b.currency) || b.revenue - a.revenue)
  return { rows, basis }
}

/** Products keyed by product ID when present, otherwise by name. Sorted by quantity sold. */
export function productRanking(records: ScopedRecord[]): ProductRow[] {
  const map = new Map<string, ProductRow>()
  for (const r of records) {
    if (r.category !== 'products' || !r.productName) continue
    const key = r.productId ? `id:${r.productId}` : `name:${r.productName}`
    const row = map.get(key) ?? {
      productId: r.productId,
      product: r.productName,
      category: r.productCategory,
      quantity: 0,
      revenueByCurrency: {},
      revenueShareByCurrency: {},
      quantityShare: 0,
    }
    row.quantity += r.quantity ?? 0
    if (r.revenue !== undefined) row.revenueByCurrency[r.currencyCode] = (row.revenueByCurrency[r.currencyCode] ?? 0) + r.revenue
    if (!row.category && r.productCategory) row.category = r.productCategory
    map.set(key, row)
  }
  const rows = [...map.values()]
  const totalQty = rows.reduce((s, p) => s + p.quantity, 0)
  const totals: Record<string, number> = {}
  for (const p of rows) for (const [c, v] of Object.entries(p.revenueByCurrency)) totals[c] = (totals[c] ?? 0) + v
  for (const p of rows) {
    p.quantityShare = totalQty > 0 ? p.quantity / totalQty : 0
    for (const [c, v] of Object.entries(p.revenueByCurrency)) p.revenueShareByCurrency[c] = totals[c] ? v / totals[c] : 0
  }
  return rows.sort((a, b) => b.quantity - a.quantity || a.product.localeCompare(b.product))
}

export function ratingSummary(records: ScopedRecord[]): RatingSummary {
  const rated = records.filter((r) => r.category === 'ratings' && r.rating !== undefined)
  const dist = new Map<number, number>()
  const byBranch = new Map<string, { sum: number; count: number }>()
  const byPlatform = new Map<string, { sum: number; count: number; platformId: ScopedRecord['platformId']; brandId: ScopedRecord['brandId'] }>()
  let sum = 0
  for (const r of rated) {
    const v = r.rating as number
    sum += v
    const bucket = Math.round(v)
    dist.set(bucket, (dist.get(bucket) ?? 0) + 1)
    if (r.branch) {
      const b = byBranch.get(r.branch) ?? { sum: 0, count: 0 }
      b.sum += v
      b.count++
      byBranch.set(r.branch, b)
    }
    const pk = `${r.brandId}|${r.platformId}`
    const p = byPlatform.get(pk) ?? { sum: 0, count: 0, platformId: r.platformId, brandId: r.brandId }
    p.sum += v
    p.count++
    byPlatform.set(pk, p)
  }
  return {
    count: rated.length,
    average: rated.length > 0 ? sum / rated.length : undefined,
    distribution: [...dist.entries()].map(([rating, count]) => ({ rating, count })).sort((a, b) => a.rating - b.rating),
    byBranch: [...byBranch.entries()].map(([branch, b]) => ({ branch, average: b.sum / b.count, count: b.count })).sort((a, b) => b.average - a.average),
    byPlatform: [...byPlatform.values()].map((p) => ({ platformId: p.platformId, brandId: p.brandId, average: p.sum / p.count, count: p.count })),
    comments: rated
      .filter((r) => r.comment)
      .map((r) => ({ date: r.date, branch: r.branch, rating: r.rating as number, comment: r.comment as string }))
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
  }
}

export function percentChange(current: number, previous: number): number | undefined {
  if (previous === 0) return undefined
  return (current - previous) / Math.abs(previous)
}

/** Rate to convert `from` into `to` using only user-supplied rates (direct or inverse). */
export function findRate(from: string, to: string, rates: ExchangeRate[]): number | undefined {
  if (from === to) return 1
  const direct = rates.find((r) => r.from === from && r.to === to && r.rate > 0)
  if (direct) return direct.rate
  const inverse = rates.find((r) => r.from === to && r.to === from && r.rate > 0)
  if (inverse) return 1 / inverse.rate
  return undefined
}

/** ISO date arithmetic helpers (UTC, no time zones). */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000)
}
