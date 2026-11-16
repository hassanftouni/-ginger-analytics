import { EyeOff, Eye, Users } from 'lucide-react'
import { useState } from 'react'
import { BarList } from '@/components/charts/BarList'
import { MultiLineChart } from '@/components/charts/MultiLineChart'
import { CurrencyPicker } from '@/components/dashboard/CurrencyPicker'
import { NoDataBanner } from '@/components/dashboard/NoDataBanner'
import { GlobalFilterBar } from '@/components/filters/GlobalFilterBar'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { StatTile } from '@/components/ui/StatTile'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useCurrency } from '@/hooks/useCurrency'
import { formatCount, formatMoney, formatNumber } from '@/utils/format'

export function CustomersPage() {
  const result = useAnalytics()
  const { customerActivity: activity, customers } = result
  const [sortBy, setSortBy] = useState<'spend' | 'orders'>('spend')
  const [limit, setLimit] = useState<'10' | '20' | 'all'>('20')
  const [showNames, setShowNames] = useState(false)
  const currencies = Object.keys(customers.spendByCurrency).sort()
  const [currency, setCurrency] = useCurrency(currencies)

  const ranked = customers.rows
    .filter((r) => r.currency === currency)
    .sort((a, b) => (sortBy === 'spend' ? b.spend - a.spend : (b.orders ?? 0) - (a.orders ?? 0) || b.spend - a.spend))
  const shown = limit === 'all' ? ranked : ranked.slice(0, Number(limit))
  const distribution = customers.spendDistribution.find((d) => d.currency === currency)

  return (
    <>
      <PageHeader title="Customer insights" description="Daily customer activity and top customers from Weevi exports. Customer names are hidden by default." />
      <GlobalFilterBar />
      <NoDataBanner result={result} />

      <h2 className="mb-3 text-sm font-semibold text-slate-900">Daily customer activity</h2>
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="New registrations" value={activity.totals.newRegistrations !== undefined ? formatCount(activity.totals.newRegistrations) : undefined} hint={activity.range ? `${activity.range.start} → ${activity.range.end}` : undefined} />
        <StatTile label="New customers" value={activity.totals.newCustomers !== undefined ? formatCount(activity.totals.newCustomers) : undefined} hint={activity.range ? 'Sum of daily counts' : undefined} />
        <StatTile
          label="Returning customer-days"
          value={activity.totals.returningCustomerDays !== undefined ? formatCount(activity.totals.returningCustomerDays) : undefined}
          hint={activity.totals.returningCustomerDays !== undefined ? 'Sum of daily counts — not distinct customers' : undefined}
        />
      </div>
      <Panel title="Activity by day" description="Customer activity is not an order count" className="mb-8">
        {activity.daily.length === 0 ? (
          <EmptyState icon={Users} title="No customer activity data" description="Requires Weevi daily customer activity exports." compact />
        ) : (
          <MultiLineChart
            data={activity.daily.map((d) => ({ ...d }))}
            xKey="date"
            series={[
              { key: 'newRegistrations', name: 'New registrations' },
              { key: 'newCustomers', name: 'New customers' },
              { key: 'returningCustomers', name: 'Returning customers' },
            ].filter((s) => activity.daily.some((d) => d[s.key as 'newRegistrations'] !== undefined))}
            formatValue={(v) => formatNumber(v)}
          />
        )}
      </Panel>

      <h2 className="mb-3 text-sm font-semibold text-slate-900">Top customers</h2>
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Customers in export" value={customers.count > 0 ? formatCount(customers.count) : undefined} />
        <StatTile label={`Customer spend${currency ? ` · ${currency}` : ''}`} value={currency ? formatMoney(customers.spendByCurrency[currency], currency) : undefined} hint={currency ? 'Not added to sales revenue' : undefined} />
        <StatTile label="Orders by these customers" value={customers.totalOrders !== undefined ? formatCount(customers.totalOrders) : undefined} />
      </div>

      {customers.count > 0 && (
        <Alert level="info" className="mb-4">
          The top-customers export is a separate report, so its spend and order totals can differ from daily sales. Differences are listed under data quality and are not adjusted.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel
          title="Customer ranking"
          description={showNames ? 'Names visible on this screen only' : 'Anonymised identifiers'}
          className="xl:col-span-2"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <CurrencyPicker currencies={currencies} value={currency} onChange={setCurrency} />
              <SegmentedControl label="Sort by" value={sortBy} onChange={setSortBy} options={[{ value: 'spend', label: 'By spending' }, { value: 'orders', label: 'By orders' }]} />
              <SegmentedControl label="Show" value={limit} onChange={setLimit} options={[{ value: '10', label: 'Top 10' }, { value: '20', label: 'Top 20' }, { value: 'all', label: 'All' }]} />
              <Button variant="ghost" onClick={() => setShowNames(!showNames)} aria-pressed={showNames}>
                {showNames ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                {showNames ? 'Hide names' : 'Show names'}
              </Button>
            </div>
          }
        >
          <DataTable
            columns={[
              { key: 'rank', header: '#', align: 'right', render: (r) => ranked.indexOf(r) + 1 },
              { key: 'id', header: 'Customer', render: (r) => <span className="font-medium text-slate-800">{showNames && r.name ? r.name : r.anonId}</span> },
              { key: 'spend', header: `Spend (${currency})`, align: 'right', render: (r) => formatMoney(r.spend, r.currency) },
              { key: 'orders', header: 'Orders', align: 'right', render: (r) => (r.orders !== undefined ? formatCount(r.orders) : '—') },
              { key: 'aov', header: 'Avg order (calculated)', align: 'right', render: (r) => (r.averageOrderValue !== undefined ? formatMoney(r.averageOrderValue, r.currency) : '—') },
              { key: 'exp', header: 'Avg order (exported)', align: 'right', render: (r) => (r.exportedAverage !== undefined ? formatNumber(r.exportedAverage, 2) : '—') },
            ]}
            rows={shown}
            rowKey={(r) => r.anonId}
            empty={<EmptyState icon={Users} title="No top-customer data" description="Requires Weevi top customers exports." compact />}
          />
        </Panel>

        <Panel title="Spending distribution" description="Number of customers by total spend">
          {distribution && distribution.buckets.some((b) => b.count > 0) ? (
            <BarList layout="vertical" data={distribution.buckets.map((b) => ({ label: b.label, value: b.count }))} seriesName="Customers" formatValue={(v) => formatCount(v)} maxBars={8} />
          ) : (
            <EmptyState title="No data" compact />
          )}
        </Panel>
        <Panel title="Order frequency" description="Number of customers by orders placed">
          {customers.frequencyDistribution.some((b) => b.count > 0) ? (
            <BarList layout="vertical" data={customers.frequencyDistribution.map((b) => ({ label: b.label, value: b.count }))} seriesName="Customers" formatValue={(v) => formatCount(v)} />
          ) : (
            <EmptyState title="No data" compact />
          )}
        </Panel>
      </div>
    </>
  )
}
