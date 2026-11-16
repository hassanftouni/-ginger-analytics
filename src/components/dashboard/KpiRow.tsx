import { StatTile } from '@/components/ui/StatTile'
import { describeOrderBasis } from '@/export/describe'
import type { AnalyticsResult } from '@/types/analytics'
import { formatCount, formatMoney, formatNumber } from '@/utils/format'

/** Headline metrics. Revenue and AOV get one tile per currency; currencies are never summed. */
export function KpiRow({ result }: { result: AnalyticsResult }) {
  const { totals, comparison, ratings } = result
  const change = (currency: string) => comparison?.revenue.find((r) => r.currency === currency)?.change

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {totals.byCurrency.length === 0 ? (
        <>
          <StatTile label="Revenue" />
          <StatTile label="Average order value" />
        </>
      ) : (
        totals.byCurrency.map((c) => (
          <StatTile key={`rev-${c.currency}`} label={`Revenue · ${c.currency}`} value={formatMoney(c.revenue, c.currency)} change={change(c.currency)} />
        ))
      )}
      <StatTile
        label="Orders"
        value={totals.orders !== undefined ? formatCount(totals.orders) : undefined}
        change={comparison?.orders.change}
        hint={totals.orders !== undefined ? describeOrderBasis(totals.orderBasis) : undefined}
      />
      {totals.byCurrency.map((c) => (
        <StatTile
          key={`aov-${c.currency}`}
          label={`Avg order value · ${c.currency}`}
          value={c.averageOrderValue !== undefined ? formatMoney(c.averageOrderValue, c.currency) : undefined}
          hint={c.averageOrderValue === undefined ? 'Order counts not available' : undefined}
        />
      ))}
      <StatTile
        label="Average rating"
        value={ratings.average !== undefined ? formatNumber(ratings.average, 2) : undefined}
        hint={ratings.count > 0 ? `${formatCount(ratings.count)} ratings` : undefined}
      />
      {totals.converted && (
        <StatTile label={`Combined revenue · ${totals.converted.currency}`} value={formatMoney(totals.converted.revenue, totals.converted.currency)} hint="Using your exchange rates" />
      )}
    </div>
  )
}
