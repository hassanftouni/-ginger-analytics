import { BreakdownPanel } from '@/components/dashboard/BreakdownPanel'
import { InsightsPanel } from '@/components/dashboard/InsightsPanel'
import { KpiRow } from '@/components/dashboard/KpiRow'
import { NoDataBanner } from '@/components/dashboard/NoDataBanner'
import { PeriodTablePanel } from '@/components/dashboard/PeriodTablePanel'
import { ProductsPanel } from '@/components/dashboard/ProductsPanel'
import { QualityPanel } from '@/components/dashboard/QualityPanel'
import { SourceCoverage } from '@/components/dashboard/SourceCoverage'
import { TrendPanel } from '@/components/dashboard/TrendPanel'
import { GlobalFilterBar } from '@/components/filters/GlobalFilterBar'
import { PageHeader } from '@/components/ui/PageHeader'
import { BRAND_LIST, PLATFORMS, getBrandSource, type PlatformId } from '@/config/brands'
import { CATEGORIES } from '@/config/categories'
import { useAnalytics } from '@/hooks/useAnalytics'

export function PlatformPage({ platformId }: { platformId: PlatformId }) {
  const platform = PLATFORMS[platformId]
  const fixed = { platformId }
  const result = useAnalytics(fixed)
  const brands = BRAND_LIST.filter((b) => getBrandSource(b.id, platformId))
  const supports = (c: (typeof platform.categories)[number]) => platform.categories.includes(c)

  return (
    <>
      <PageHeader
        title={`${platform.name} analytics`}
        description={`${platform.description}. Used by ${brands.map((b) => b.name).join(' and ')}. Report types: ${platform.categories.map((c) => CATEGORIES[c].name).join(', ')}.`}
      />
      <GlobalFilterBar fixed={fixed} />
      <NoDataBanner result={result} />
      <KpiRow result={result} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <TrendPanel points={result.daily} className="xl:col-span-2" />
        <InsightsPanel insights={result.insights} />
        <PeriodTablePanel weekly={result.weekly} monthly={result.monthly} className="xl:col-span-3" />
        <BreakdownPanel title="Revenue by brand" dimensionLabel="Brand · Platform" breakdown={result.platforms} emptyDescription="Requires sales exports with revenue." className="xl:col-span-2" />
        <SourceCoverage platformId={platformId} />
        <BreakdownPanel title="Branch performance" dimensionLabel="Branch" breakdown={result.branches} emptyDescription="Requires a mapped Branch field." className="xl:col-span-2" />
        <BreakdownPanel title="Sales by channel" dimensionLabel="Channel" breakdown={result.channels} emptyDescription="Requires a mapped Sales channel field." showTable={false} />
        {supports('products') && <ProductsPanel products={result.products} compact className="xl:col-span-3" />}
        <QualityPanel items={result.quality} className="xl:col-span-3" />
      </div>
    </>
  )
}
