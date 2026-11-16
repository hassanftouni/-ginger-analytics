import type { BrandId, PlatformId } from '@/config/brands'
import type { ImportCategory } from '@/config/categories'
import type { OrderBasis, SalesFact, ScopedRecord } from '@/types/analytics'

/**
 * Source precedence for revenue and order totals. For each brand × platform × country, only
 * the most detailed category with data is added to totals; the others are still used by their
 * own views (e.g. branch performance) but never summed on top, to avoid double counting.
 */
export const SALES_PRECEDENCE: ImportCategory[] = ['orders', 'sales-summary', 'delivery-pickup', 'branch-performance']

const sourceKey = (r: { brandId: BrandId; platformId: PlatformId; country: string }) => `${r.brandId}|${r.platformId}|${r.country}`

export interface SalesFactsResult {
  facts: SalesFact[]
  orderBasis: OrderBasis
  duplicateOrdersRemoved: number
  basis: { brandId: BrandId; platformId: PlatformId; country: string; category: ImportCategory; datasets: number }[]
  /** Categories with data that were not added to totals because a more detailed one exists. */
  skipped: { brandId: BrandId; platformId: PlatformId; category: ImportCategory; primary: ImportCategory }[]
}

const isSalesRecord = (r: ScopedRecord) => r.revenue !== undefined || r.orderCount !== undefined || r.category === 'orders'

export function buildSalesFacts(records: ScopedRecord[]): SalesFactsResult {
  const bySource = new Map<string, ScopedRecord[]>()
  for (const r of records) {
    if (!SALES_PRECEDENCE.includes(r.category) || !isSalesRecord(r)) continue
    const key = sourceKey(r)
    const group = bySource.get(key)
    if (group) group.push(r)
    else bySource.set(key, [r])
  }

  const facts: SalesFact[] = []
  const basis: SalesFactsResult['basis'] = []
  const skipped: SalesFactsResult['skipped'] = []
  const bases = new Set<OrderBasis>()
  let duplicateOrdersRemoved = 0

  for (const group of bySource.values()) {
    const present = new Set(group.map((r) => r.category))
    const primary = SALES_PRECEDENCE.find((c) => present.has(c)) as ImportCategory
    const sample = group[0]
    for (const c of present) if (c !== primary) skipped.push({ brandId: sample.brandId, platformId: sample.platformId, category: c, primary })

    const rows = group.filter((r) => r.category === primary)
    basis.push({
      brandId: sample.brandId,
      platformId: sample.platformId,
      country: sample.country,
      category: primary,
      datasets: new Set(rows.map((r) => r.datasetId)).size,
    })

    if (primary === 'orders') {
      const seen = new Set<string>()
      let anyId = false
      let anyWithoutId = false
      for (const r of rows) {
        if (r.orderId) {
          anyId = true
          if (seen.has(r.orderId)) {
            duplicateOrdersRemoved++
            continue
          }
          seen.add(r.orderId)
        } else {
          anyWithoutId = true
        }
        facts.push({ ...r, orders: 1 })
      }
      if (anyId) bases.add('unique-ids')
      if (anyWithoutId) bases.add('rows')
    } else {
      for (const r of rows) facts.push({ ...r, orders: r.orderCount })
      bases.add(rows.some((r) => r.orderCount !== undefined) ? 'reported' : 'none')
    }
  }

  const orderBasis: OrderBasis = bases.size === 0 ? 'none' : bases.size === 1 ? [...bases][0] : 'mixed'
  return { facts, orderBasis, duplicateOrdersRemoved, basis, skipped }
}
