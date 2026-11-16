import { BreakdownPanel } from '@/components/dashboard/BreakdownPanel'
import { InsightsPanel } from '@/components/dashboard/InsightsPanel'
import { KpiRow } from '@/components/dashboard/KpiRow'
import { NoDataBanner } from '@/components/dashboard/NoDataBanner'
import { PeriodTablePanel } from '@/components/dashboard/PeriodTablePanel'
import { QualityPanel } from '@/components/dashboard/QualityPanel'
import { SourceCoverage } from '@/components/dashboard/SourceCoverage'
import { TrendPanel } from '@/components/dashboard/TrendPanel'
import { GlobalFilterBar } from '@/components/filters/GlobalFilterBar'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAnalytics } from '@/hooks/useAnalytics'

export function OverviewPage() {
  const result = useAnalytics()
  return (
    <>
      <PageHeader title="Executive overview" description="Choose a brand, or “Both brands” for an explicit cross-brand view. Revenue is reported separately per currency." />
      <GlobalFilterBar />
      <NoDataBanner result={result} />
      <KpiRow result={result} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <TrendPanel points={result.daily} className="xl:col-span-2" />
        <InsightsPanel insights={result.insights} />
        <PeriodTablePanel weekly={result.weekly} monthly={result.monthly} className="xl:col-span-3" />
        <BreakdownPanel
          title="Platform comparison"
          dimensionLabel="Brand · Platform"
          breakdown={result.platforms}
          emptyDescription="Requires sales exports with revenue."
          className="xl:col-span-2"
        />
        <BreakdownPanel title="Delivery vs pickup" dimensionLabel="Channel" breakdown={result.channels} emptyDescription="Requires a mapped Sales channel field or Weevi delivery / pickup exports." showTable={false} />
        <BreakdownPanel title="Branch comparison" dimensionLabel="Branch" breakdown={result.branches} emptyDescription="Requires a mapped Branch field." className="xl:col-span-2" />
        <SourceCoverage />
        <QualityPanel items={result.quality} className="xl:col-span-3" />
      </div>
    </>
  )
}
