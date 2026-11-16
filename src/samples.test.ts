/**
 * Validation against the real Weevi sample exports in samples/weevi/ginger.
 * The samples contain customer data and are git-ignored; these tests are skipped when the
 * folder is absent (e.g. in CI). Nothing personal is printed or snapshotted.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runAnalysis } from '@/analytics'
import { datasetFrom, rawFromDisk } from '@/test/build'
import { DEFAULT_FILTERS } from '@/types/filters'
import { DEFAULT_SETTINGS } from '@/types/settings'
import { buildManualBranchDataset } from '@/import/manual'

const DIR = join(process.cwd(), 'samples', 'weevi', 'ginger')
const present = existsSync(DIR)
const find = (prefix: string) => join(DIR, readdirSync(DIR).find((f) => f.startsWith(prefix)) as string)

describe.skipIf(!present)('Weevi samples — Ginger & Co, October 2026', () => {
  it('daily sales: 31 days, USD 40,699, 593 orders, AOV ≈ 68.63', async () => {
    const ds = datasetFrom(await rawFromDisk(find('salesWidget')))
    expect(ds.metadata.formatId).toBe('weevi-daily-sales')
    expect(ds.metadata.currency).toBe('USD')
    expect(ds.records).toHaveLength(31)
    expect(ds.stats).toMatchObject({ minDate: '2026-10-01', maxDate: '2026-10-31', skippedRows: 0, valueCurrencies: ['USD'] })

    const result = runAnalysis([ds], DEFAULT_FILTERS, DEFAULT_SETTINGS)
    const usd = result.totals.byCurrency[0]
    expect(usd.currency).toBe('USD')
    expect(usd.revenue).toBe(40699)
    expect(usd.orders).toBe(593)
    expect(usd.averageOrderValue).toBeCloseTo(68.63, 2)
    expect(result.daily).toHaveLength(31)
    expect(result.monthly[0]).toMatchObject({ key: '2026-10', revenue: 40699, orders: 593 })
  })

  it('daily customer activity: 450 registrations, 339 new, 312 returning customer-days', async () => {
    const ds = datasetFrom(await rawFromDisk(find('customersWidget')))
    expect(ds.metadata.formatId).toBe('weevi-daily-customers')
    const result = runAnalysis([ds], DEFAULT_FILTERS, DEFAULT_SETTINGS)
    expect(result.customerActivity.totals).toEqual({ newRegistrations: 450, newCustomers: 339, returningCustomerDays: 312 })
    expect(result.customerActivity.daily).toHaveLength(31)
    expect(result.totals.orders).toBeUndefined() // activity is never treated as orders
  })

  it('top products: 213 records, amounts sum to 41,128, currency not assumed', async () => {
    const raw = await rawFromDisk(find('top-chart-products'))
    const ds = datasetFrom(raw, { currency: 'USD', periodStart: '2026-10-01', periodEnd: '2026-10-31' })
    expect(ds.metadata.formatId).toBe('weevi-top-products')
    expect(ds.records).toHaveLength(213)
    expect(ds.records.reduce((s, r) => s + (r.revenue ?? 0), 0)).toBe(41128)
    expect(Object.keys(ds.mapping)).not.toContain('Column 5')
    expect(ds.stats.valueCurrencies).toEqual([])
  })

  it('top customers: 436 records, misspelled column mapped, names never required for analysis', async () => {
    const ds = datasetFrom(await rawFromDisk(find('top-chart-customers')), { currency: 'USD', periodStart: '2026-10-01', periodEnd: '2026-10-31' })
    expect(ds.metadata.formatId).toBe('weevi-top-customers')
    expect(ds.mapping.averageOrderValue).toBe('Avarage Order Price')
    expect(ds.records).toHaveLength(436)
    const result = runAnalysis([ds], DEFAULT_FILTERS, DEFAULT_SETTINGS)
    expect(result.customers.count).toBe(436)
    expect(result.customers.rows.every((r) => /^CUST-/.test(r.anonId))).toBe(true)
  })

  it('all four together: sales revenue unchanged, reconciliation reported', async () => {
    const meta = { currency: 'USD', periodStart: '2026-10-01', periodEnd: '2026-10-31' }
    const datasets = [
      datasetFrom(await rawFromDisk(find('salesWidget'))),
      datasetFrom(await rawFromDisk(find('customersWidget'))),
      datasetFrom(await rawFromDisk(find('top-chart-products')), meta),
      datasetFrom(await rawFromDisk(find('top-chart-customers')), meta),
    ]
    const result = runAnalysis(datasets, DEFAULT_FILTERS, DEFAULT_SETTINGS)
    expect(result.totals.byCurrency[0].revenue).toBe(40699)
    expect(result.totals.orders).toBe(593)
    const products = result.reconciliation.find((r) => r.source === 'Products')
    expect(products).toMatchObject({ otherAmount: 41128, salesRevenue: 40699, difference: 429, periodsMatch: true })
    const customers = result.reconciliation.find((r) => r.source === 'Customers')
    expect(customers).toMatchObject({ otherAmount: 39288, otherOrders: 551, salesOrders: 593 })
  })

  it('branch views on the real October totals: separate vs Hamra + Discount', async () => {
    const sales = datasetFrom(await rawFromDisk(find('salesWidget')))
    // User-confirmed October figures (no branch export exists yet).
    const branches = buildManualBranchDataset(
      { brandId: 'ginger-and-co', platformId: 'weevi', currency: 'USD', periodStart: '2026-10-01', periodEnd: '2026-10-31', note: 'user-confirmed', rows: [{ branch: 'Hamra', revenue: 3303, orders: 54 }, { branch: 'Discount', revenue: 100, orders: 2 }] },
      'manual-oct',
    )
    const october = { from: '2026-10-01', to: '2026-10-31' }
    const separate = runAnalysis([sales, branches], { ...DEFAULT_FILTERS, ...october }, DEFAULT_SETTINGS)
    const combined = runAnalysis([sales, branches], { ...DEFAULT_FILTERS, ...october, branchView: 'combined' }, DEFAULT_SETTINGS)
    for (const r of [separate, combined]) expect(r.totals.byCurrency[0]).toMatchObject({ revenue: 40699, orders: 593 })
    expect(separate.branches.rows.map((r) => [r.label, r.revenue, r.orders])).toEqual([['Hamra', 3303, 54], ['Discount', 100, 2]])
    const group = combined.branches.rows.find((r) => r.label === 'Hamra + Discount')
    expect([group?.revenue, group?.orders]).toEqual([3403, 56])
    expect(group?.averageOrderValue).toBeCloseTo(60.77, 2)
    expect(combined.branches.rows).toHaveLength(1)
  })
})
