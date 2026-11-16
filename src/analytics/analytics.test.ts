import { describe, expect, it } from 'vitest'
import { datasetFrom, rawCsv, rawSheet } from '@/test/build'
import { DEFAULT_FILTERS, type Filters } from '@/types/filters'
import { DEFAULT_SETTINGS } from '@/types/settings'
import { runAnalysis } from './engine'

const d = (day: number) => new Date(Date.UTC(2026, 9, day))
const sales = rawSheet([
  ['Days', 'Orders', 'Amount'],
  [d(3), '10', 'USD 500'],
  [d(2), '20', 'USD 1,500'],
  [d(1), '30', 'USD 1,000'],
])
const activity = rawSheet([
  ['Days', 'New Registrations', 'New Customers', 'Returning Customers'],
  [d(1), '5', '4', '3'],
  [d(2), '6', '5', '3'],
])
const products = rawCsv('id,Product Name,Items Sold,Total Amount,\r\n1,Item A,10,1200\r\n2,Item B,30,900\r\n3,Item C,5,1000\r\n')
const customers = rawCsv('id,Full Name,Total Sale,Avarage Order Price,Total Orders,\r\nc-1,Person One,400,100,4\r\nc-2,Person Two,90,90,1\r\n')
const period = { periodStart: '2026-10-01', periodEnd: '2026-10-03', currency: 'USD' }
const run = (datasets: ReturnType<typeof datasetFrom>[], filters: Partial<Filters> = {}) => runAnalysis(datasets, { ...DEFAULT_FILTERS, ...filters }, DEFAULT_SETTINGS)

describe('daily sales', () => {
  const result = run([datasetFrom(sales)])

  it('totals revenue and orders from daily rows', () => {
    expect(result.totals.byCurrency).toEqual([{ currency: 'USD', revenue: 3000, orders: 60, averageOrderValue: 50 }])
  })
  it('uses reported daily order counts, not row counts', () => {
    expect(result.totals.orders).toBe(60)
    expect(result.totals.rowCount).toBe(3)
    expect(result.totals.orderBasis).toBe('reported')
  })
  it('computes a weighted AOV (total revenue ÷ total orders), not an average of daily AOVs', () => {
    const dailyAovMean = (500 / 10 + 1500 / 20 + 1000 / 30) / 3
    expect(result.totals.byCurrency[0].averageOrderValue).toBe(50)
    expect(result.totals.byCurrency[0].averageOrderValue).not.toBeCloseTo(dailyAovMean)
  })
  it('finds the highest and lowest sales days', () => {
    expect(result.extremes[0].highest.date).toBe('2026-10-02')
    expect(result.extremes[0].lowest.date).toBe('2026-10-03')
  })
  it('builds weekly and monthly tables', () => {
    expect(result.monthly).toHaveLength(1)
    expect(result.monthly[0]).toMatchObject({ key: '2026-10', revenue: 3000, orders: 60, averageOrderValue: 50, partial: true, days: 3 }) // 3 of 31 days → partial month
    expect(result.weekly.reduce((s, w) => s + w.revenue, 0)).toBe(3000)
  })
})

describe('separate measures are never added to revenue', () => {
  const result = run([datasetFrom(sales), datasetFrom(products, period), datasetFrom(customers, period), datasetFrom(activity)])

  it('keeps sales revenue unchanged when product and customer exports are present', () => {
    expect(result.totals.byCurrency[0].revenue).toBe(3000)
    expect(result.totals.orders).toBe(60)
  })
  it('reports reconciliation differences instead of forcing a match', () => {
    const prod = result.reconciliation.find((r) => r.source === 'Products')
    expect(prod).toMatchObject({ otherAmount: 3100, salesRevenue: 3000, difference: 100 })
    const cust = result.reconciliation.find((r) => r.source === 'Customers')
    expect(cust).toMatchObject({ otherAmount: 490, otherOrders: 5, salesOrders: 60 })
    expect(result.quality.some((q) => q.message.startsWith('Reconciliation'))).toBe(true)
  })
  it('ranks products by quantity and by revenue with contribution shares', () => {
    expect(result.products[0].product).toBe('Item B')
    expect(result.products.find((p) => p.product === 'Item A')?.revenueShareByCurrency.USD).toBeCloseTo(1200 / 3100)
  })
  it('sums daily customer activity without claiming distinct returning customers', () => {
    expect(result.customerActivity.totals).toEqual({ newRegistrations: 11, newCustomers: 9, returningCustomerDays: 6 })
    expect(result.quality.some((q) => /not the number of distinct returning customers/.test(q.message))).toBe(true)
  })
  it('anonymises customers and computes distributions', () => {
    expect(result.customers.rows[0].anonId).toMatch(/^CUST-[0-9A-F]{6}$/)
    expect(result.customers.rows[0].averageOrderValue).toBe(100)
    expect(result.customers.frequencyDistribution.find((b) => b.label === '1 order')?.count).toBe(1)
  })
})

describe('branch scope', () => {
  it('does not fabricate branch results for "all selected branches"', () => {
    const result = run([datasetFrom(sales, { branchScope: { mode: 'all', branches: [] } })])
    expect(result.branches.rows).toEqual([])
    expect(run([datasetFrom(sales, { branchScope: { mode: 'all', branches: [] } })], { branch: 'Hamra' }).totals.byCurrency).toEqual([])
  })
  it('does not split a multi-branch file', () => {
    const result = run([datasetFrom(sales, { branchScope: { mode: 'selected', branches: ['Hamra', 'Hazmieh'] } })])
    expect(result.branches.rows).toEqual([])
  })
  it('attributes a single declared branch and says so', () => {
    const result = run([datasetFrom(sales, { branchScope: { mode: 'selected', branches: ['Hamra'] } })], { branch: 'Hamra' })
    expect(result.totals.byCurrency[0].revenue).toBe(3000)
    expect(result.branchFromScopeRows).toBe(3)
  })
})

describe('brands are kept separate', () => {
  const ginger = datasetFrom(sales)
  const pertutti = datasetFrom(rawSheet([['Days', 'Orders', 'Amount'], [d(1), '2', 'USD 100']], 'p.xlsx'), { brandId: 'pertutti' })

  it('filters to one brand by default', () => {
    expect(run([ginger, pertutti]).totals.byCurrency[0].revenue).toBe(3000)
  })
  it('combines only with an explicit cross-brand selection, and labels it', () => {
    const result = run([ginger, pertutti], { brandId: 'all' })
    expect(result.totals.byCurrency[0].revenue).toBe(3100)
    expect(result.quality.some((q) => q.message.startsWith('Cross-brand report'))).toBe(true)
  })
})

describe('currencies', () => {
  it('reports each currency separately', () => {
    const eur = datasetFrom(rawSheet([['Days', 'Orders', 'Amount'], [d(1), '1', 'EUR 40']], 'eur.xlsx'), { platformId: 'weevi' })
    const result = run([datasetFrom(sales), eur])
    expect(result.totals.byCurrency.map((c) => c.currency)).toEqual(['EUR', 'USD'])
    expect(result.totals.converted).toBeUndefined()
  })
})
