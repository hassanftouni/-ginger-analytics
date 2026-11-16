import { CalendarRange } from 'lucide-react'
import { useState } from 'react'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { Panel } from '@/components/ui/Panel'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useCurrency } from '@/hooks/useCurrency'
import type { PeriodRow } from '@/types/analytics'
import { formatCount, formatMoney, formatSignedPercent } from '@/utils/format'
import { CurrencyPicker } from './CurrencyPicker'

function Change({ value }: { value: number | undefined }) {
  if (value === undefined) return <span className="text-slate-300">—</span>
  const tone = value > 0 ? 'text-emerald-700' : value < 0 ? 'text-red-700' : 'text-slate-600'
  return <span className={`tabular-nums ${tone}`}>{formatSignedPercent(value)}</span>
}

/** Weekly and monthly totals with change versus the previous bucket. */
export function PeriodTablePanel({ weekly, monthly, className }: { weekly: PeriodRow[]; monthly: PeriodRow[]; className?: string }) {
  const [grain, setGrain] = useState<'week' | 'month'>('week')
  const source = grain === 'week' ? weekly : monthly
  const currencies = [...new Set(source.map((r) => r.currency))].sort()
  const [currency, setCurrency] = useCurrency(currencies)
  const rows = source.filter((r) => r.currency === currency)

  return (
    <Panel
      title="Weekly & monthly comparison"
      description="Change versus the previous week or month · AOV = revenue ÷ orders"
      className={className}
      actions={
        <div className="flex gap-2">
          <CurrencyPicker currencies={currencies} value={currency} onChange={setCurrency} />
          <SegmentedControl label="Period" value={grain} onChange={setGrain} options={[{ value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }]} />
        </div>
      }
    >
      <DataTable
        columns={[
          {
            key: 'period',
            header: grain === 'week' ? 'Week (Mon–Sun)' : 'Month',
            render: (r) => (
              <span className="text-slate-800">
                {grain === 'week' ? `${r.start} – ${r.end}` : r.key}
                {r.partial && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">partial · {r.days} days</span>}
              </span>
            ),
          },
          { key: 'revenue', header: `Revenue (${currency})`, align: 'right', render: (r) => formatMoney(r.revenue, r.currency) },
          { key: 'rc', header: 'Change', align: 'right', render: (r) => <Change value={r.revenueChange} /> },
          { key: 'orders', header: 'Orders', align: 'right', render: (r) => (r.orders !== undefined ? formatCount(r.orders) : '—') },
          { key: 'oc', header: 'Change', align: 'right', render: (r) => <Change value={r.ordersChange} /> },
          { key: 'aov', header: 'AOV', align: 'right', render: (r) => (r.averageOrderValue !== undefined ? formatMoney(r.averageOrderValue, r.currency) : '—') },
        ]}
        rows={rows}
        rowKey={(r) => `${r.key}|${r.currency}`}
        empty={<EmptyState icon={CalendarRange} title="No dated sales data" description="Requires daily sales exports." compact />}
      />
      {rows.some((r) => r.partial) && <p className="mt-2 text-xs text-slate-500">Partial periods extend beyond the analysed dates, so their change is not like-for-like.</p>}
    </Panel>
  )
}
