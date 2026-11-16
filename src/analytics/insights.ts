import { BRANDS, PLATFORMS, allSources } from '@/config/brands'
import type { CustomerInsights, GroupBreakdown, Insight, PeriodComparison, ProductRow, RatingSummary, SalesExtremes } from '@/types/analytics'
import type { Dataset } from '@/types/dataset'
import type { Filters } from '@/types/filters'
import type { ReportingSettings } from '@/types/settings'
import { formatMoney, formatNumber, formatPercent } from '@/utils/format'

/**
 * Rule-based insights. Each rule states a fact computed from imported data; rules
 * whose inputs are missing produce nothing. No conclusions are generated beyond the rules.
 */
export function buildInsights(input: {
  branches: GroupBreakdown
  products: ProductRow[]
  comparison: PeriodComparison | null
  ratings: RatingSummary
  datasets: Dataset[]
  allDatasets: Dataset[]
  filters: Filters
  settings: ReportingSettings
  extremes: SalesExtremes[]
  customers: CustomerInsights
}): Insight[] {
  const insights: Insight[] = []
  const { branches, products, comparison, ratings, settings, filters } = input

  // Highest / lowest revenue branch, per currency (needs at least two branches).
  const currencies = [...new Set(branches.rows.map((r) => r.currency))]
  for (const currency of currencies) {
    // Only branches with complete data for the period are ranked.
    const rows = branches.rows.filter((r) => r.currency === currency && r.status !== 'incomplete').sort((a, b) => b.revenue - a.revenue)
    if (rows.length < 2) continue
    const top = rows[0]
    const bottom = rows[rows.length - 1]
    insights.push({
      id: `branch-top-${currency}`,
      tone: 'positive',
      title: `Highest revenue branch: ${top.label}`,
      detail: `${formatMoney(top.revenue, currency)} (${formatPercent(top.share)} of ${currency} revenue across ${rows.length} branches).`,
    })
    insights.push({
      id: `branch-bottom-${currency}`,
      tone: 'neutral',
      title: `Lowest revenue branch: ${bottom.label}`,
      detail: `${formatMoney(bottom.revenue, currency)} (${formatPercent(bottom.share)} of ${currency} revenue).`,
    })
  }

  // Highest and lowest sales days.
  for (const e of input.extremes) {
    insights.push({
      id: `day-high-${e.currency}`,
      tone: 'positive',
      title: `Highest sales day: ${e.highest.date}`,
      detail: `${formatMoney(e.highest.revenue, e.currency)}${e.highest.orders !== undefined ? ` from ${formatNumber(e.highest.orders)} orders` : ''} (of ${e.days} days).`,
    })
    insights.push({
      id: `day-low-${e.currency}`,
      tone: 'neutral',
      title: `Lowest sales day: ${e.lowest.date}`,
      detail: `${formatMoney(e.lowest.revenue, e.currency)}${e.lowest.orders !== undefined ? ` from ${formatNumber(e.lowest.orders)} orders` : ''}.`,
    })
  }

  // Best-selling product by quantity.
  if (products.length > 0) {
    const top = products[0]
    insights.push({
      id: 'product-top',
      tone: 'positive',
      title: `Best-selling product: ${top.product}`,
      detail: `${formatNumber(top.quantity)} units sold${products.length > 1 ? `, ahead of ${products[1].product} (${formatNumber(products[1].quantity)})` : ''}.`,
    })
  }

  // Best seller by revenue, when different from the quantity leader.
  const revenueCurrencies = [...new Set(products.flatMap((p) => Object.keys(p.revenueByCurrency)))]
  for (const c of revenueCurrencies) {
    const top = [...products].sort((a, b) => (b.revenueByCurrency[c] ?? 0) - (a.revenueByCurrency[c] ?? 0))[0]
    if (top && top.product !== products[0]?.product) {
      insights.push({
        id: `product-revenue-${c}`,
        tone: 'positive',
        title: `Top product by revenue: ${top.product}`,
        detail: `${formatMoney(top.revenueByCurrency[c] ?? 0, c)} (${formatPercent(top.revenueShareByCurrency[c] ?? 0)} of ${c} product revenue).`,
      })
    }
  }

  // Customer concentration (anonymised).
  const custCurrencies = Object.keys(input.customers.spendByCurrency)
  for (const c of custCurrencies) {
    const rows = input.customers.rows.filter((r) => r.currency === c)
    const total = input.customers.spendByCurrency[c]
    if (rows.length < 10 || !total) continue
    const top10 = rows.slice(0, 10).reduce((s, r) => s + r.spend, 0)
    insights.push({
      id: `customers-top10-${c}`,
      tone: 'neutral',
      title: `Top 10 customers: ${formatPercent(top10 / total)} of customer spend`,
      detail: `${formatMoney(top10, c)} of ${formatMoney(total, c)} across ${rows.length} customers in the top-customers export.`,
    })
  }

  // Sales trend versus the previous period of equal length.
  if (comparison?.hasPreviousData) {
    for (const r of comparison.revenue) {
      if (r.change === undefined) continue
      const direction = r.change > 0 ? 'increased' : r.change < 0 ? 'decreased' : 'was unchanged'
      insights.push({
        id: `trend-${r.currency}`,
        tone: r.change > 0 ? 'positive' : r.change < 0 ? 'negative' : 'neutral',
        title: `${r.currency} revenue ${direction}${r.change !== 0 ? ` ${formatPercent(Math.abs(r.change))}` : ''}`,
        detail: `${formatMoney(r.current, r.currency)} from ${comparison.current.start} to ${comparison.current.end}, versus ${formatMoney(r.previous, r.currency)} from ${comparison.previous.start} to ${comparison.previous.end}.`,
      })
    }
  }

  // Low customer ratings — only when the user has set a threshold.
  if (settings.lowRatingThreshold !== null && ratings.average !== undefined) {
    const threshold = settings.lowRatingThreshold
    if (ratings.average < threshold) {
      insights.push({
        id: 'rating-low',
        tone: 'negative',
        title: `Average rating ${formatNumber(ratings.average, 2)} is below ${threshold}`,
        detail: `Based on ${formatNumber(ratings.count)} ratings in the selected scope.`,
      })
    }
    const lowBranches = ratings.byBranch.filter((b) => b.average < threshold)
    if (lowBranches.length > 0) {
      insights.push({
        id: 'rating-low-branches',
        tone: 'negative',
        title: `${lowBranches.length} branch(es) rated below ${threshold}`,
        detail: lowBranches.map((b) => `${b.branch} (${formatNumber(b.average, 2)}, ${b.count} ratings)`).join('; '),
      })
    }
  }

  // Missing source data for configured sources within the current filters.
  const expected = allSources().filter(
    (s) =>
      (filters.brandId === 'all' || s.brandId === filters.brandId) &&
      (filters.platformId === 'all' || s.platformId === filters.platformId) &&
      (filters.country === 'all' || s.country === filters.country),
  )
  const missing = expected.filter((s) => !input.datasets.some((d) => d.metadata.brandId === s.brandId && d.metadata.platformId === s.platformId))
  if (missing.length > 0 && input.allDatasets.length > 0) {
    insights.push({
      id: 'missing-sources',
      tone: 'warning',
      title: `No data for ${missing.length} source(s)`,
      detail: missing.map((s) => `${BRANDS[s.brandId].name} · ${PLATFORMS[s.platformId].name}`).join(', '),
    })
  }

  return insights
}
