import type { BrandId } from '@/config/brands'
import type { ReconciliationItem, SalesFact, ScopedRecord } from '@/types/analytics'
import type { Dataset } from '@/types/dataset'

const periodOf = (d: Dataset) => `${d.stats.minDate ?? d.metadata.periodStart} → ${d.stats.maxDate ?? d.metadata.periodEnd}`

/**
 * Compare product and top-customer totals with sales totals for the same brand and currency.
 * These exports measure overlapping things in different ways, so differences are reported —
 * never adjusted, and never added together.
 */
export function reconcile(facts: SalesFact[], records: ScopedRecord[], datasets: Dataset[]): ReconciliationItem[] {
  const items: ReconciliationItem[] = []
  const byId = new Map(datasets.map((d) => [d.id, d]))

  // Sales totals and date range per brand × currency.
  const sales = new Map<string, { revenue: number; orders: number; ordersKnown: boolean; start?: string; end?: string }>()
  for (const f of facts) {
    const key = `${f.brandId}|${f.currencyCode}`
    const s = sales.get(key) ?? { revenue: 0, orders: 0, ordersKnown: true }
    s.revenue += f.revenue ?? 0
    if (f.orders === undefined) s.ordersKnown = false
    else s.orders += f.orders
    if (f.date) {
      if (!s.start || f.date < s.start) s.start = f.date
      if (!s.end || f.date > s.end) s.end = f.date
    }
    sales.set(key, s)
  }

  // Totals per product / customer dataset and currency.
  const others = new Map<string, { dataset: Dataset; currency: string; amount: number; orders: number; hasOrders: boolean }>()
  for (const r of records) {
    if (r.category !== 'products' && r.category !== 'customers') continue
    if (r.revenue === undefined) continue
    const key = `${r.datasetId}|${r.currencyCode}`
    const dataset = byId.get(r.datasetId)
    if (!dataset) continue
    const o = others.get(key) ?? { dataset, currency: r.currencyCode, amount: 0, orders: 0, hasOrders: false }
    o.amount += r.revenue
    if (r.category === 'customers' && r.orderCount !== undefined) {
      o.orders += r.orderCount
      o.hasOrders = true
    }
    others.set(key, o)
  }

  for (const o of others.values()) {
    const brandId: BrandId = o.dataset.metadata.brandId
    const s = sales.get(`${brandId}|${o.currency}`)
    if (!s) continue
    const salesPeriod = s.start && s.end ? `${s.start} → ${s.end}` : 'undated'
    const period = periodOf(o.dataset)
    items.push({
      brandId,
      currency: o.currency,
      source: o.dataset.metadata.category === 'products' ? 'Products' : 'Customers',
      fileName: o.dataset.source.fileName,
      period,
      salesPeriod,
      salesRevenue: s.revenue,
      otherAmount: o.amount,
      difference: o.amount - s.revenue,
      ratio: s.revenue !== 0 ? o.amount / s.revenue - 1 : undefined,
      salesOrders: s.ordersKnown ? s.orders : undefined,
      otherOrders: o.hasOrders ? o.orders : undefined,
      periodsMatch: period === salesPeriod,
    })
  }
  return items
}
