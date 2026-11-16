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
import { BRANDS, PLATFORMS, type BrandId } from '@/config/brands'
import { useAnalytics } from '@/hooks/useAnalytics'

export function BrandPage({ brandId }: { brandId: BrandId }) {
  const brand = BRANDS[brandId]
  const fixed = { brandId }
  const result = useAnalytics(fixed)
  return (
    <>
      <PageHeader title={brand.name} description={`Sources: ${brand.sources.map((s) => `${PLATFORMS[s.platformId].name} (${s.country})`).join(', ')}. Toters revenue is reported separately in Toters analytics.`} />
      <GlobalFilterBar fixed={fixed} />
      <NoDataBanner result={result} />
      <KpiRow result={result} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <TrendPanel points={result.daily} className="xl:col-span-2" />
        <InsightsPanel insights={result.insights} />
        <PeriodTablePanel weekly={result.weekly} monthly={result.monthly} className="xl:col-span-3" />
        <BreakdownPanel title="Revenue by platform" dimensionLabel="Platform" breakdown={result.platforms} emptyDescription="Requires sales exports with revenue." className="xl:col-span-2" />
        <SourceCoverage brandId={brandId} />
        <BreakdownPanel title="Branch performance" dimensionLabel="Branch" breakdown={result.branches} emptyDescription="Requires a mapped Branch field." className="xl:col-span-2" />
        <BreakdownPanel title="Delivery vs pickup" dimensionLabel="Channel" breakdown={result.channels} emptyDescription="Requires a mapped Sales channel field." showTable={false} />
        <ProductsPanel products={result.products} compact className="xl:col-span-3" />
        <QualityPanel items={result.quality} className="xl:col-span-3" />
      </div>
    </>
  )
}
