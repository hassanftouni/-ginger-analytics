import { Search, ShoppingBag } from 'lucide-react'
import { useState } from 'react'
import { BarList } from '@/components/charts/BarList'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { TextInput } from '@/components/ui/FormControls'
import { Panel } from '@/components/ui/Panel'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useCurrency } from '@/hooks/useCurrency'
import type { ProductRow } from '@/types/analytics'
import { formatCount, formatMoney, formatPercent } from '@/utils/format'
import { CurrencyPicker } from './CurrencyPicker'

type SortKey = 'quantity' | 'revenue' | 'name'
type Limit = '10' | '20' | 'all'

interface ProductsPanelProps {
  products: ProductRow[]
  /** Compact mode for dashboards: fixed top 10 by quantity, no controls. */
  compact?: boolean
  className?: string
}

export function ProductsPanel({ products, compact = false, className }: ProductsPanelProps) {
  const [sort, setSort] = useState<SortKey>('quantity')
  const [limit, setLimit] = useState<Limit>(compact ? '10' : '20')
  const [query, setQuery] = useState('')
  const currencies = [...new Set(products.flatMap((p) => Object.keys(p.revenueByCurrency)))].sort()
  const [currency, setCurrency] = useCurrency(currencies)

  const rev = (p: ProductRow) => (currency ? (p.revenueByCurrency[currency] ?? 0) : 0)
  const sorted = [...products].sort((a, b) => (sort === 'name' ? a.product.localeCompare(b.product) : sort === 'revenue' ? rev(b) - rev(a) : b.quantity - a.quantity))
  const rankOf = new Map(sorted.map((p, i) => [p, i + 1]))
  const q = query.trim().toLowerCase()
  const filtered = q ? sorted.filter((p) => p.product.toLowerCase().includes(q) || p.productId?.toLowerCase().includes(q)) : sorted
  const rows = limit === 'all' || q ? filtered : filtered.slice(0, Number(limit))

  const columns: Column<ProductRow>[] = [
    { key: 'rank', header: '#', align: 'right', render: (p) => rankOf.get(p) },
    { key: 'product', header: 'Product', render: (p) => <span className="font-medium text-slate-800">{p.product}</span> },
    { key: 'id', header: 'ID', render: (p) => <span className="text-xs text-slate-500">{p.productId ?? '—'}</span> },
    { key: 'qty', header: 'Items sold', align: 'right', render: (p) => formatCount(p.quantity) },
    { key: 'qshare', header: 'Share of items', align: 'right', render: (p) => formatPercent(p.quantityShare) },
    ...(currency
      ? [
          { key: 'rev', header: `Amount (${currency})`, align: 'right' as const, render: (p: ProductRow) => (p.revenueByCurrency[currency] !== undefined ? formatMoney(p.revenueByCurrency[currency], currency) : '—') },
          { key: 'rshare', header: 'Revenue contribution', align: 'right' as const, render: (p: ProductRow) => formatPercent(p.revenueShareByCurrency[currency] ?? 0) },
        ]
      : []),
  ]

  const chartByRevenue = sort === 'revenue' && currency
  const chartData = sorted.slice(0, 10).map((p) => ({ label: p.product, value: chartByRevenue ? rev(p) : p.quantity }))

  return (
    <Panel
      title={compact ? 'Best-selling products' : 'Product rankings'}
      description={compact ? 'Top 10 by items sold' : 'From product exports · amounts are not added to sales revenue'}
      className={className}
      actions={!compact && products.length > 0 ? <CurrencyPicker currencies={currencies} value={currency} onChange={setCurrency} /> : undefined}
    >
      {products.length === 0 ? (
        <EmptyState icon={ShoppingBag} title="No product data" description="Requires Weevi top products exports." compact />
      ) : (
        <div className="space-y-4">
          {!compact && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" aria-hidden="true" />
                <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products or IDs" className="pl-9" aria-label="Search products" />
              </div>
              <SegmentedControl
                label="Sort by"
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'quantity', label: 'By quantity' },
                  ...(currency ? [{ value: 'revenue' as SortKey, label: 'By revenue' }] : []),
                  { value: 'name', label: 'A–Z' },
                ]}
              />
              <SegmentedControl label="Show" value={limit} onChange={setLimit} options={[{ value: '10', label: 'Top 10' }, { value: '20', label: 'Top 20' }, { value: 'all', label: `All ${products.length}` }]} />
            </div>
          )}
          {sort !== 'name' && !q && (
            <BarList
              data={chartData}
              seriesName={chartByRevenue ? `Amount (${currency})` : 'Items sold'}
              formatValue={(v) => (chartByRevenue && currency ? formatMoney(v, currency) : formatCount(v))}
            />
          )}
          <DataTable columns={compact ? columns.filter((c) => c.key !== 'id' && c.key !== 'qshare') : columns} rows={rows} rowKey={(p) => p.productId ?? p.product} empty={<EmptyState title="No matching products" compact />} />
        </div>
      )}
    </Panel>
  )
}
