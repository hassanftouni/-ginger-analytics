import { MessageSquareText, Star } from 'lucide-react'
import { BarList } from '@/components/charts/BarList'
import { NoDataBanner } from '@/components/dashboard/NoDataBanner'
import { GlobalFilterBar } from '@/components/filters/GlobalFilterBar'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { StatTile } from '@/components/ui/StatTile'
import { BRANDS, PLATFORMS } from '@/config/brands'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useDataStore } from '@/state/dataStore'
import { formatCount, formatNumber } from '@/utils/format'

export function FeedbackPage() {
  const result = useAnalytics()
  const { settings } = useDataStore()
  const { ratings } = result
  const threshold = settings.lowRatingThreshold
  const lowCount = threshold === null ? undefined : result.records.filter((r) => r.category === 'ratings' && r.rating !== undefined && r.rating < threshold).length

  return (
    <>
      <PageHeader title="Customer feedback" description="From Weevi customer ratings exports." />
      <GlobalFilterBar />
      <NoDataBanner result={result} />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Average rating" value={ratings.average !== undefined ? formatNumber(ratings.average, 2) : undefined} />
        <StatTile label="Ratings received" value={ratings.count > 0 ? formatCount(ratings.count) : undefined} />
        <StatTile
          label="Low ratings"
          value={lowCount !== undefined && ratings.count > 0 ? formatCount(lowCount) : undefined}
          hint={threshold === null ? 'Set a threshold in Reporting settings' : `Below ${threshold}`}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Rating distribution" description="Ratings rounded to the nearest whole number">
          {ratings.distribution.length === 0 ? (
            <EmptyState icon={Star} title="No ratings" description="Requires customer ratings exports." compact />
          ) : (
            <BarList layout="vertical" data={ratings.distribution.map((d) => ({ label: String(d.rating), value: d.count }))} seriesName="Ratings" formatValue={(v) => formatCount(v)} />
          )}
        </Panel>
        <Panel title="By source">
          <DataTable
            columns={[
              { key: 'src', header: 'Brand · Platform', render: (p) => `${BRANDS[p.brandId].name} · ${PLATFORMS[p.platformId].name}` },
              { key: 'avg', header: 'Average', align: 'right', render: (p) => formatNumber(p.average, 2) },
              { key: 'n', header: 'Ratings', align: 'right', render: (p) => formatCount(p.count) },
            ]}
            rows={ratings.byPlatform}
            rowKey={(p) => `${p.brandId}-${p.platformId}`}
            empty={<EmptyState title="No ratings" compact />}
          />
        </Panel>
        <Panel title="Recent comments" description="Shown locally only; not included in exports" className="xl:col-span-2">
          <DataTable
            columns={[
              { key: 'date', header: 'Date', render: (c) => c.date ?? '—' },
              { key: 'branch', header: 'Branch', render: (c) => c.branch ?? '—' },
              { key: 'rating', header: 'Rating', align: 'right', render: (c) => formatNumber(c.rating, 1) },
              { key: 'comment', header: 'Comment', render: (c) => <span className="block max-w-xl whitespace-normal">{c.comment}</span> },
            ]}
            rows={ratings.comments.slice(0, 50).map((c, i) => ({ ...c, i }))}
            rowKey={(c) => String(c.i)}
            empty={<EmptyState icon={MessageSquareText} title="No comments" description="Map a Comment column when importing ratings." compact />}
          />
        </Panel>
      </div>
    </>
  )
}
