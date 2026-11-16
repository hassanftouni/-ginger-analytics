import { BRANDS, PLATFORMS, type BrandId, type PlatformId } from '@/config/brands'
import { CATEGORIES } from '@/config/categories'
import type { AnalyticsResult, GroupBreakdown, PeriodComparison, QualityItem, SalesFact, ScopedRecord } from '@/types/analytics'
import type { Dataset } from '@/types/dataset'
import type { Filters } from '@/types/filters'
import type { ReportingSettings } from '@/types/settings'
import { formatCount } from '@/utils/format'
import { branchBreakdown } from './branches'
import { buildInsights } from './insights'
import {
  addDays,
  dailySeries,
  daysBetween,
  findRate,
  groupFacts,
  percentChange,
  productRanking,
  ratingSummary,
  totalOrders,
  totalsByCurrency,
} from './metrics'
import { customerActivity, customerInsights } from './customers'
import { periodTable, salesExtremes } from './periods'
import { reconcile } from './reconcile'
import { buildSalesFacts } from './sales'
import { datasetsInScope, scopeRecords } from './scope'

const sourceLabel = (brandId: BrandId, platformId: PlatformId) => `${BRANDS[brandId].name} · ${PLATFORMS[platformId].name}`

function salesFor(datasets: Dataset[], filters: Filters, settings: ReportingSettings) {
  const scoped = scopeRecords(datasetsInScope(datasets, filters), filters, settings)
  return { scoped, sales: buildSalesFacts(scoped.records) }
}

function dateRangeOf(facts: { date?: string }[]): { start: string; end: string } | null {
  let start: string | undefined
  let end: string | undefined
  for (const f of facts) {
    if (!f.date) continue
    if (!start || f.date < start) start = f.date
    if (!end || f.date > end) end = f.date
  }
  return start && end ? { start, end } : null
}

/** Breakdown from sales facts, falling back to a dedicated category when facts lack the dimension. */
function breakdownWithFallback(
  facts: SalesFact[],
  records: ScopedRecord[],
  dimension: 'channel',
  fallbackCategory: 'delivery-pickup',
  basisLabel: string,
): GroupBreakdown {
  const fromFacts = groupFacts(facts, (f) => f[dimension], (k) => k, basisLabel)
  if (fromFacts.rows.length > 0) return fromFacts
  const fallback: SalesFact[] = records
    .filter((r) => r.category === fallbackCategory && r[dimension])
    .map((r) => ({ ...r, orders: r.orderCount }))
  return groupFacts(fallback, (f) => f[dimension], (k) => k, `${CATEGORIES[fallbackCategory].name} exports`)
}

/** Run the full analysis for the given filters. Pure: same inputs, same output. */
export function runAnalysis(allDatasets: Dataset[], filters: Filters, settings: ReportingSettings): AnalyticsResult {
  const inScope = datasetsInScope(allDatasets, filters)
  const { scoped, sales } = salesFor(allDatasets, filters, settings)
  const { records, status } = scoped
  const facts = sales.facts

  const byCurrency = totalsByCurrency(facts)
  const dateRange = filters.from && filters.to ? { start: filters.from, end: filters.to } : dateRangeOf(facts)

  // Converted total, only with explicit user-supplied rates for every currency.
  let converted: AnalyticsResult['totals']['converted']
  if (settings.reportingCurrency && byCurrency.length > 0) {
    const target = settings.reportingCurrency
    const rates = byCurrency.map((c) => findRate(c.currency, target, settings.exchangeRates))
    if (rates.every((r) => r !== undefined)) {
      converted = {
        currency: target,
        revenue: byCurrency.reduce((sum, c, i) => sum + c.revenue * (rates[i] as number), 0),
        note: `Converted using your exchange rates: ${
          byCurrency
            .map((c, i) => ({ currency: c.currency, rate: rates[i] as number }))
            .filter((c) => c.currency !== target)
            .map((c) => `1 ${c.currency} = ${c.rate} ${target}`)
            .join(', ') || 'no conversion needed'
        }`,
      }
    }
  }

  // Comparison with the previous period of equal length.
  let comparison: PeriodComparison | null = null
  if (dateRange && facts.length > 0) {
    const length = daysBetween(dateRange.start, dateRange.end) + 1
    const previous = { start: addDays(dateRange.start, -length), end: addDays(dateRange.start, -1) }
    const prevSales = salesFor(allDatasets, { ...filters, from: previous.start, to: previous.end }, settings).sales.facts.filter((f) => f.date)
    const curDated = facts.filter((f) => f.date)
    const prevTotals = totalsByCurrency(prevSales)
    const curTotals = totalsByCurrency(curDated)
    const currencies = [...new Set([...curTotals, ...prevTotals].map((t) => t.currency))].sort()
    const curOrders = totalOrders(curDated)
    const prevOrders = totalOrders(prevSales)
    comparison = {
      current: dateRange,
      previous,
      hasPreviousData: prevSales.length > 0,
      revenue: currencies.map((currency) => {
        const cur = curTotals.find((t) => t.currency === currency)?.revenue ?? 0
        const prev = prevTotals.find((t) => t.currency === currency)?.revenue ?? 0
        return { currency, current: cur, previous: prev, change: prevSales.length > 0 ? percentChange(cur, prev) : undefined }
      }),
      orders: {
        current: curOrders,
        previous: prevOrders,
        change: curOrders !== undefined && prevOrders !== undefined ? percentChange(curOrders, prevOrders) : undefined,
      },
    }
  }

  const totalsBasis = `${[...new Set(sales.basis.map((b) => CATEGORIES[b.category].name))].join(' / ')} exports`
  const branches = branchBreakdown(facts, records, inScope, filters, dateRange, totalsBasis)
  const channels = breakdownWithFallback(facts, records, 'channel', 'delivery-pickup', totalsBasis)
  const platforms = groupFacts(
    facts,
    (f) => `${f.brandId}|${f.platformId}`,
    (k) => {
      const [b, p] = k.split('|') as [BrandId, PlatformId]
      return sourceLabel(b, p)
    },
    totalsBasis,
  )
  const products = productRanking(records)
  const ratings = ratingSummary(records)

  const daily = dailySeries(facts)
  const weekly = periodTable(daily, 'week', dateRange)
  const monthly = periodTable(daily, 'month', dateRange)
  const extremes = salesExtremes(daily)
  const activity = customerActivity(records)
  const customers = customerInsights(records)
  const reconciliation = reconcile(facts, records, inScope)

  const customerIds = new Set(records.filter((r) => r.category === 'customers' && r.customerId).map((r) => r.customerId as string))
  const hasCustomerData = records.some((r) => r.category === 'customers')

  // Data quality notes for the current scope.
  const quality: QualityItem[] = []
  if (filters.brandId === 'all' && new Set(inScope.map((d) => d.metadata.brandId)).size > 1) {
    quality.push({ level: 'info', message: 'Cross-brand report: figures combine Ginger & Co and Pertutti because “Both brands” is selected.' })
  }
  for (const r of reconciliation) {
    const pct = r.ratio !== undefined ? ` (${r.ratio > 0 ? '+' : ''}${(r.ratio * 100).toFixed(1)}%)` : ''
    quality.push({
      level: 'warning',
      message: `Reconciliation — ${BRANDS[r.brandId].name}: ${r.source.toLowerCase()} export “${r.fileName}” totals ${r.currency} ${r.otherAmount.toLocaleString('en-US')} vs daily sales ${r.currency} ${r.salesRevenue.toLocaleString('en-US')}${pct}${r.otherOrders !== undefined && r.salesOrders !== undefined ? `; orders ${r.otherOrders.toLocaleString('en-US')} vs ${r.salesOrders.toLocaleString('en-US')}` : ''}. ${r.periodsMatch ? 'Same period.' : `Periods: ${r.period} vs ${r.salesPeriod}.`} Figures are shown as exported and are not forced to match or added together.`,
    })
  }
  if (activity.totals.returningCustomerDays !== undefined) {
    quality.push({ level: 'info', message: 'Returning customers are summed from daily counts; the total is not the number of distinct returning customers. Customer activity is not an order count.' })
  }
  if (branches.rows.some((r) => r.userConfirmed)) {
    quality.push({ level: 'warning', message: 'Branch results include user-confirmed figures that are not backed by a branch export.' })
  }
  const incompleteBranches = [...branches.rows.filter((r) => r.status === 'incomplete').map((r) => r.label), ...(branches.missing ?? []).map((m) => m.label)]
  if (incompleteBranches.length > 0 && (branches.rows.length > 0 || inScope.length > 0)) {
    quality.push({
      level: 'warning',
      message: `Incomplete branch data for ${incompleteBranches.join(', ')}${dateRange ? ` (${dateRange.start} to ${dateRange.end})` : ''}. No figures are assumed for missing branches or periods.`,
    })
  }
  if (branches.rows.length > 0 && byCurrency.length > 0) {
    quality.push({ level: 'info', message: 'Branch figures come from separate sources and are compared side by side; their sum is not used as the brand total.' })
  }
  if (scoped.branchFromScopeRows > 0) {
    quality.push({ level: 'info', message: `${formatCount(scoped.branchFromScopeRows)} row(s) are attributed to a branch from the import's declared single-branch scope, not from a branch column.` })
  }
  const combinedScope = inScope.filter((d) => !d.mapping.branch && d.metadata.branchScope && !(d.metadata.branchScope.mode === 'selected' && d.metadata.branchScope.branches.length === 1))
  if (combinedScope.length > 0 && filters.branch === 'all') {
    quality.push({ level: 'info', message: `${combinedScope.length} file(s) cover several branches combined and have no branch column, so they contribute no branch-level results.` })
  }
  const excluded = allDatasets.filter(
    (d) =>
      !d.included &&
      (filters.brandId === 'all' || d.metadata.brandId === filters.brandId) &&
      (filters.platformId === 'all' || d.metadata.platformId === filters.platformId),
  )
  for (const d of excluded) {
    quality.push({ level: 'warning', message: `“${d.source.fileName}” is excluded from analysis${d.exclusionReason ? `: ${d.exclusionReason}` : '.'}` })
  }
  for (const s of sales.skipped) {
    quality.push({
      level: 'info',
      message: `${sourceLabel(s.brandId, s.platformId)}: ${CATEGORIES[s.category].name} exports are not added to totals because ${CATEGORIES[s.primary].name} exports are used for the same source (avoids double counting).`,
    })
  }
  if (sales.duplicateOrdersRemoved > 0) {
    quality.push({ level: 'info', message: `${formatCount(sales.duplicateOrdersRemoved)} duplicate order row(s) removed by Order ID.` })
  }
  if (sales.orderBasis === 'rows' || sales.orderBasis === 'mixed') {
    quality.push({ level: 'warning', message: 'Some order exports have no Order ID mapped, so orders are counted as rows and duplicates cannot be detected.' })
  }
  if (status.statusMapped && settings.cancelledStatuses.length === 0 && settings.refundedStatuses.length === 0) {
    quality.push({
      level: 'warning',
      message: 'Order statuses are present but no cancelled / refunded values are configured in Settings, so every order is counted.',
    })
  }
  if (status.excludedRows > 0) {
    quality.push({ level: 'info', message: `${formatCount(status.excludedRows)} cancelled / refunded row(s) excluded by the reporting policy.` })
  }
  if (scoped.undatedExcluded > 0) {
    quality.push({ level: 'info', message: `${formatCount(scoped.undatedExcluded)} undated row(s) left out because their file's period is not fully inside the selected dates.` })
  }
  if (byCurrency.length > 1) {
    quality.push({
      level: 'info',
      message: `Revenue is reported separately for ${byCurrency.map((c) => c.currency).join(', ')}${converted ? '' : ' (no conversion rate set for a combined total)'}.`,
    })
  }
  if (byCurrency.some((c) => c.currency === 'UNSPECIFIED')) {
    quality.push({ level: 'warning', message: 'Some revenue has no currency and is shown as UNSPECIFIED.' })
  }
  if (byCurrency.some((c) => c.averageOrderValue === undefined && c.revenue > 0)) {
    quality.push({ level: 'info', message: 'Average order value is not shown where order counts are missing from the source exports.' })
  }
  for (const d of inScope) {
    const n = d.warnings.filter((w) => w.level === 'warning').length
    if (n > 0) quality.push({ level: 'warning', message: `“${d.source.fileName}” was imported with ${n} warning(s): ${d.warnings.filter((w) => w.level === 'warning').map((w) => w.message).join(' ')}` })
  }

  const insights = buildInsights({ branches, products, comparison, ratings, datasets: inScope, allDatasets, filters, settings, extremes, customers })

  return {
    filters,
    datasetsInScope: inScope,
    dateRange,
    hasSales: facts.length > 0,
    totals: {
      byCurrency,
      orders: totalOrders(facts),
      orderBasis: sales.orderBasis,
      rowCount: facts.length,
      duplicateOrdersRemoved: sales.duplicateOrdersRemoved,
      converted,
    },
    comparison,
    daily,
    weekly,
    monthly,
    extremes,
    customerActivity: activity,
    customers,
    reconciliation,
    branchFromScopeRows: scoped.branchFromScopeRows,
    branches,
    platforms,
    channels,
    products,
    ratings,
    uniqueCustomers: hasCustomerData ? customerIds.size : undefined,
    status,
    insights,
    quality,
    records,
    sourceBasis: sales.basis,
  }
}
