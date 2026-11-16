import { Building2 } from 'lucide-react'
import { BarList } from '@/components/charts/BarList'
import { CurrencyPicker } from '@/components/dashboard/CurrencyPicker'
import { InsightsPanel } from '@/components/dashboard/InsightsPanel'
import { ManualBranchEntry } from '@/components/dashboard/ManualBranchEntry'
import { NoDataBanner } from '@/components/dashboard/NoDataBanner'
import { QualityPanel } from '@/components/dashboard/QualityPanel'
import { BranchViewToggle } from '@/components/filters/BranchViewToggle'
import { GlobalFilterBar } from '@/components/filters/GlobalFilterBar'
import { Badge } from '@/components/ui/Badge'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useCurrency } from '@/hooks/useCurrency'
import { useFilters } from '@/state/filters'
import { formatCompactMoney, formatCount, formatMoney, formatNumber, formatPercent } from '@/utils/format'

export function BranchesPage() {
  const result = useAnalytics()
  const { filters } = useFilters()
  const { branches } = result
  const currencies = [...new Set(branches.rows.map((r) => r.currency))].sort()
  const [currency, setCurrency] = useCurrency(currencies)
  const rows = branches.rows.filter((r) => r.currency === currency)
  const listedRevenue = rows.reduce((s, r) => s + r.revenue, 0)
  const listedOrders = rows.every((r) => r.orders !== undefined) ? rows.reduce((s, r) => s + (r.orders ?? 0), 0) : undefined
  const brandTotal = result.totals.byCurrency.find((c) => c.currency === currency)
  const branchInsights = result.insights.filter((i) => i.id.startsWith('branch-') || i.id === 'rating-low-branches')

  return (
    <>
      <PageHeader
        title="Branch performance"
        description="Branches are compared side by side. Hamra and Discount stay separate in the data; the combined view only changes how they are reported."
        actions={<BranchViewToggle />}
      />
      <GlobalFilterBar />
      <NoDataBanner result={result} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          title={filters.branchView === 'combined' ? 'Revenue by branch — Hamra + Discount combined' : 'Revenue by branch — separate branches'}
          description={rows.length > 0 ? `Source: ${branches.basis}${branches.checkedRange ? ` · checked against ${branches.checkedRange.start} to ${branches.checkedRange.end}` : ''}` : undefined}
          className="xl:col-span-2"
          actions={<CurrencyPicker currencies={currencies} value={currency} onChange={setCurrency} />}
        >
          {rows.length === 0 && (branches.missing ?? []).length === 0 ? (
            <EmptyState icon={Building2} title="No branch data" description="Import exports with a branch column, or add user-confirmed branch figures below." compact />
          ) : (
            <div className="space-y-4">
              {rows.length > 0 && currency && (
                <BarList
                  data={rows.map((r) => ({ label: r.status === 'incomplete' ? `${r.label} (incomplete)` : r.label, value: r.revenue }))}
                  seriesName={`Revenue (${currency})`}
                  formatValue={(v) => formatMoney(v, currency)}
                  formatTick={(v) => formatCompactMoney(v, currency)}
                />
              )}
              <DataTable
                columns={[
                  {
                    key: 'branch',
                    header: 'Branch',
                    render: (r) => (
                      <div>
                        <span className="font-medium text-slate-800">{r.label}</span>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {r.members && <Badge tone="accent">Group</Badge>}
                          {r.status === 'incomplete' && <Badge tone="warning">Incomplete data</Badge>}
                          {r.userConfirmed && <Badge>User-confirmed</Badge>}
                        </div>
                      </div>
                    ),
                  },
                  { key: 'rev', header: `Revenue (${currency})`, align: 'right', render: (r) => formatMoney(r.revenue, r.currency) },
                  { key: 'orders', header: 'Orders', align: 'right', render: (r) => (r.orders !== undefined ? formatCount(r.orders) : '—') },
                  { key: 'aov', header: 'AOV', align: 'right', render: (r) => (r.averageOrderValue !== undefined ? formatMoney(r.averageOrderValue, r.currency) : '—') },
                  { key: 'share', header: 'Share of listed', align: 'right', render: (r) => formatPercent(r.share) },
                  { key: 'notes', header: 'Notes', render: (r) => <span className="block max-w-xs whitespace-normal text-xs text-slate-500">{r.notes?.join(' · ')}</span> },
                ]}
                rows={rows}
                rowKey={(r) => `${r.key}|${r.currency}`}
                empty={null}
              />
              {(branches.missing ?? []).length > 0 && (
                <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {branches.missing?.map((m) => (
                    <li key={m.label}>
                      <strong>{m.label}</strong> — {m.reason}
                    </li>
                  ))}
                </ul>
              )}
              {rows.length > 0 && currency && (
                <p className="text-xs text-slate-500">
                  Listed branches: {formatMoney(listedRevenue, currency)}
                  {listedOrders !== undefined ? ` · ${formatCount(listedOrders)} orders` : ''}
                  {listedOrders ? ` · AOV ${formatMoney(listedRevenue / listedOrders, currency)}` : ''}. Each branch appears once
                  {filters.branchView === 'combined' ? ' (the group replaces its members)' : ''}.
                  {brandTotal ? ` Brand total from sales exports: ${formatMoney(brandTotal.revenue, currency)}${brandTotal.orders !== undefined ? ` · ${formatCount(brandTotal.orders)} orders` : ''} — not replaced by the branch sum.` : ''}
                </p>
              )}
            </div>
          )}
        </Panel>
        <InsightsPanel insights={branchInsights} />

        <div className="xl:col-span-3">
          <ManualBranchEntry defaultBrand={filters.brandId === 'all' ? 'ginger-and-co' : filters.brandId} />
        </div>

        <Panel title="Ratings by branch" className="xl:col-span-3">
          <DataTable
            columns={[
              { key: 'branch', header: 'Branch', render: (b) => <span className="font-medium text-slate-800">{b.branch}</span> },
              { key: 'avg', header: 'Average rating', align: 'right', render: (b) => formatNumber(b.average, 2) },
              { key: 'count', header: 'Ratings', align: 'right', render: (b) => formatCount(b.count) },
            ]}
            rows={result.ratings.byBranch}
            rowKey={(b) => b.branch}
            empty={<EmptyState title="No branch ratings" description="Requires rating exports with a mapped Branch field." compact />}
          />
        </Panel>
        <QualityPanel items={result.quality} className="xl:col-span-3" />
      </div>
    </>
  )
}
