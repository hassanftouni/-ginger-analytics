import { ChartColumn } from 'lucide-react'
import { BarList } from '@/components/charts/BarList'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { Panel } from '@/components/ui/Panel'
import type { GroupBreakdown, GroupRow } from '@/types/analytics'
import { formatCompactMoney, formatCount, formatMoney, formatPercent } from '@/utils/format'
import { useCurrency } from '@/hooks/useCurrency'
import { CurrencyPicker } from './CurrencyPicker'

interface BreakdownPanelProps {
  title: string
  dimensionLabel: string
  breakdown: GroupBreakdown
  emptyDescription: string
  showTable?: boolean
  className?: string
}

/** Revenue by a dimension (branch, platform, channel) for one currency, as a bar chart and optional table. */
export function BreakdownPanel({ title, dimensionLabel, breakdown, emptyDescription, showTable = true, className }: BreakdownPanelProps) {
  const currencies = [...new Set(breakdown.rows.map((r) => r.currency))].sort()
  const [currency, setCurrency] = useCurrency(currencies)
  const rows = breakdown.rows.filter((r) => r.currency === currency)

  const columns: Column<GroupRow>[] = [
    { key: 'label', header: dimensionLabel, render: (r) => <span className="font-medium text-slate-800">{r.label}</span> },
    { key: 'revenue', header: `Revenue (${currency})`, align: 'right', render: (r) => formatMoney(r.revenue, r.currency) },
    { key: 'orders', header: 'Orders', align: 'right', render: (r) => (r.orders !== undefined ? formatCount(r.orders) : '—') },
    { key: 'aov', header: 'Avg order value', align: 'right', render: (r) => (r.averageOrderValue !== undefined ? formatMoney(r.averageOrderValue, r.currency) : '—') },
    { key: 'share', header: 'Share', align: 'right', render: (r) => formatPercent(r.share) },
  ]

  return (
    <Panel
      title={title}
      description={rows.length > 0 ? `Source: ${breakdown.basis}` : undefined}
      className={className}
      actions={<CurrencyPicker currencies={currencies} value={currency} onChange={setCurrency} />}
    >
      {rows.length === 0 || !currency ? (
        <EmptyState icon={ChartColumn} title="No data available" description={emptyDescription} compact />
      ) : (
        <div className="space-y-4">
          <BarList
            data={rows.map((r) => ({ label: r.label, value: r.revenue }))}
            seriesName={`Revenue (${currency})`}
            formatValue={(v) => formatMoney(v, currency)}
            formatTick={(v) => formatCompactMoney(v, currency)}
          />
          {showTable && <DataTable columns={columns} rows={rows} rowKey={(r) => `${r.key}|${r.currency}`} empty={null} />}
        </div>
      )}
    </Panel>
  )
}
