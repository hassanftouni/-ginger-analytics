import { NoDataBanner } from '@/components/dashboard/NoDataBanner'
import { ProductsPanel } from '@/components/dashboard/ProductsPanel'
import { GlobalFilterBar } from '@/components/filters/GlobalFilterBar'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatTile } from '@/components/ui/StatTile'
import { useAnalytics } from '@/hooks/useAnalytics'
import { formatCount, formatMoney } from '@/utils/format'

export function ProductsPage() {
  const result = useAnalytics()
  const { products } = result
  const totalQty = products.reduce((s, p) => s + p.quantity, 0)
  const totals: Record<string, number> = {}
  for (const p of products) for (const [c, v] of Object.entries(p.revenueByCurrency)) totals[c] = (totals[c] ?? 0) + v
  const periods = [...new Set(result.datasetsInScope.filter((d) => d.metadata.category === 'products').map((d) => `${d.metadata.periodStart} → ${d.metadata.periodEnd}`))]
  return (
    <>
      <PageHeader title="Products & best sellers" description="From products exports. Product amounts are shown on their own and never added to sales revenue." />
      <GlobalFilterBar />
      <NoDataBanner result={result} />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Products" value={products.length > 0 ? formatCount(products.length) : undefined} hint={periods.length ? `Period: ${periods.join(', ')}` : undefined} />
        <StatTile label="Items sold" value={products.length > 0 ? formatCount(totalQty) : undefined} />
        {Object.entries(totals).map(([c, v]) => (
          <StatTile key={c} label={`Product amounts · ${c}`} value={formatMoney(v, c)} hint="As exported; see reconciliation" />
        ))}
        <StatTile label="Best seller (items)" value={products[0]?.product} hint={products[0] ? `${formatCount(products[0].quantity)} items` : undefined} />
      </div>
      <ProductsPanel products={products} />
    </>
  )
}
