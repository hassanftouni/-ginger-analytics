import { Bike, CalendarRange, ChartLine, Download, Loader2, ShoppingBag, Upload } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { QualityPanel } from '@/components/dashboard/QualityPanel'
import { FoodyBranchLinesChart, FoodyDailyChart, FoodyPeriodChart, FoodyShareBars } from '@/components/foody/FoodyCharts'
import { foodyBranchColor } from '@/components/foody/colors'
import { FoodyFilterBar } from '@/components/foody/FoodyFilterBar'
import { FoodyHistoryPanel } from '@/components/foody/FoodyHistoryPanel'
import { BRAND, SERIES } from '@/components/charts/chartTheme'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { StatTile } from '@/components/ui/StatTile'
import { FOODY_CURRENCY, FOODY_RULES } from '@/config/foody'
import { buildFoodyWorkbook } from '@/export/foodyWorkbook'
import { downloadWorkbook } from '@/export/workbook'
import { computeFoodyAnalytics, type FoodyBranchRow, type FoodyComparison, type FoodyMixRow } from '@/foody/analytics'
import { orderNet } from '@/foody/parse'
import { hrefFor } from '@/hooks/useHashRoute'
import { useFoodyStore } from '@/state/foodyStore'
import { cn, formatCount, formatMoney, formatPercent, formatSignedPercent } from '@/utils/format'

const eur = (v: number) => formatMoney(v, FOODY_CURRENCY)
const money = (v: number | undefined) => (v === undefined ? '—' : eur(v))

/** Signed change. `lowerIsBetter` only flips the colour (fewer cancellations = green), never the number. */
function Change({ value, points, lowerIsBetter }: { value: number | undefined; points?: boolean; lowerIsBetter?: boolean }) {
  if (value === undefined) return <span className="text-slate-300">—</span>
  const text = points ? `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)} pts` : formatSignedPercent(value)
  const good = lowerIsBetter ? value < 0 : value > 0
  return <span className={cn('tabular-nums', value === 0 ? 'text-slate-600' : good ? 'text-emerald-700' : 'text-red-700')}>{text}</span>
}

function branchStatus(r: FoodyBranchRow) {
  if (r.daysCovered === 0) return <Badge tone="warning">No data imported</Badge>
  if (r.missingDays > 0) return <Badge tone="warning">{r.missingDays} missing day(s)</Badge>
  return <Badge tone="success">Complete</Badge>
}

/** Comparison rows: metric, current, baseline, change. Lower is better for cancellations and complaints. */
function comparisonRows(c: FoodyComparison) {
  const a = c.current.metrics
  const b = c.baseline.metrics
  const rows: { key: string; label: string; current: string; baseline: string; change: ReactNode }[] = [
    { key: 'net', label: 'Net sales', current: eur(a.net), baseline: eur(b.net), change: <Change value={c.change.net} /> },
    { key: 'gross', label: 'Gross sales', current: eur(a.gross), baseline: eur(b.gross), change: <Change value={c.change.gross} /> },
    { key: 'orders', label: 'Valid orders', current: formatCount(a.validOrders), baseline: formatCount(b.validOrders), change: <Change value={c.change.validOrders} /> },
    { key: 'aov', label: 'Average order value', current: money(a.aov), baseline: money(b.aov), change: <Change value={c.change.aov} /> },
    { key: 'disc', label: 'Discounts', current: eur(a.discount), baseline: eur(b.discount), change: <Change value={c.change.discount} /> },
    { key: 'vouch', label: 'Vouchers', current: eur(a.voucher), baseline: eur(b.voucher), change: <Change value={c.change.voucher} /> },
    { key: 'promo', label: 'Orders with discount / voucher', current: formatCount(a.promoOrders), baseline: formatCount(b.promoOrders), change: <Change value={c.change.promoOrders} /> },
    {
      key: 'rate',
      label: 'Discount + voucher share of gross',
      current: a.promoRate !== undefined ? formatPercent(a.promoRate) : '—',
      baseline: b.promoRate !== undefined ? formatPercent(b.promoRate) : '—',
      change: <Change value={c.pointChange.promoRate} points />,
    },
    { key: 'canc', label: 'Cancelled orders', current: formatCount(a.cancelledOrders), baseline: formatCount(b.cancelledOrders), change: <Change value={c.change.cancelledOrders} lowerIsBetter /> },
    { key: 'comp', label: 'Orders with a complaint', current: formatCount(a.complaints), baseline: formatCount(b.complaints), change: <Change value={c.change.complaints} lowerIsBetter /> },
  ]
  return rows
}

/** Label / value list for narrow panels (no horizontal scrolling). */
function CompactList({ title, rows }: { title: string; rows: { key: string; label: string; value: string; sub?: string }[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing in this selection.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {rows.map((r) => (
            <li key={r.key} className="flex items-start justify-between gap-3 px-3 py-2">
              <span className="min-w-0 text-sm text-slate-800">{r.label}</span>
              <span className="shrink-0 text-right text-sm font-medium tabular-nums text-slate-900">
                {r.value}
                {r.sub && <span className="block text-xs font-normal text-slate-500">{r.sub}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function MixList({ title, rows }: { title: string; rows: FoodyMixRow[] }) {
  return <CompactList title={title} rows={rows.map((r) => ({ key: r.label, label: r.label, value: `${formatCount(r.orders)} orders`, sub: `${r.share !== undefined ? formatPercent(r.share) : '—'} · ${eur(r.net)}` }))} />
}

const tileChange = (c: FoodyComparison | undefined, key: keyof FoodyComparison['change']) => (c && !c.baselineIncomplete ? c.change[key] : undefined)

export function FoodyPage() {
  const { state, filters } = useFoodyStore()
  const a = useMemo(() => computeFoodyAnalytics(state, filters), [state, filters])
  const [exporting, setExporting] = useState<{ kind: 'idle' | 'working' | 'done' | 'error'; message?: string }>({ kind: 'idle' })
  const nothingImported = state.orders.length === 0
  const latest = useMemo(() => state.orders.reduce<string | undefined>((m, o) => (!m || o.date > m ? o.date : m), undefined), [state.orders])
  const t = a.totals
  const c = a.comparison
  const changeLabel = c ? `vs ${c.baseline.start} → ${c.baseline.end}` : undefined

  const handleExport = async () => {
    setExporting({ kind: 'working' })
    try {
      const generatedAt = new Date()
      const wb = await buildFoodyWorkbook(a, { title: 'Foody Sales Report — Ginger & Co Cyprus', generatedAt })
      const name = `foody-report-${generatedAt.toISOString().slice(0, 10)}.xlsx`
      await downloadWorkbook(wb, name)
      setExporting({ kind: 'done', message: `Downloaded ${name} with ${wb.worksheets.length} sheets for the current filters.` })
    } catch (error) {
      setExporting({ kind: 'error', message: error instanceof Error ? error.message : 'The report could not be generated.' })
    }
  }

  const metricTile = (label: string, value: string | undefined, key: keyof FoodyComparison['change'] | undefined, hint?: string) => (
    <StatTile label={label} value={value} change={key ? tileChange(c, key) : undefined} changeLabel={changeLabel} hint={hint ?? (key && tileChange(c, key) !== undefined ? changeLabel : undefined)} />
  )

  return (
    <>
      <PageHeader
        title="Foody analytics"
        description="Ginger & Co Cyprus — Foody orders in EUR. Reported separately: Foody sales are never converted or added to Lebanon (Weevi, Toters) figures."
        actions={
          <>
            <a href={hrefFor('/import')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              <Upload className="size-4" aria-hidden="true" /> Import Foody Excel
            </a>
            <Button variant="primary" onClick={handleExport} disabled={!a.hasData || exporting.kind === 'working'}>
              {exporting.kind === 'working' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
              Export Foody report
            </Button>
          </>
        }
      />
      <FoodyFilterBar latest={latest} />

      {exporting.kind === 'done' && <Alert level="info" className="mb-4">{exporting.message}</Alert>}
      {exporting.kind === 'error' && <Alert level="error" className="mb-4" title="Export failed">{exporting.message}</Alert>}

      {nothingImported ? (
        <div className="mb-6 flex flex-col items-start gap-3 rounded-xl border border-accent-100 bg-accent-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">No Foody data imported yet</p>
            <p className="text-xs text-slate-600">Import Foody “orderDetails” Excel exports. They are recognised from their headers; the branch comes from the Store ID.</p>
          </div>
          <a href={hrefFor('/import')} className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-accent-700">
            <Upload className="size-4" aria-hidden="true" /> Import data
          </a>
        </div>
      ) : (
        !a.hasData && (
          <Alert level="warning" className="mb-6" title="No Foody data matches the current filters">
            Adjust the branch or dates, or import Foody exports covering this selection.
          </Alert>
        )
      )}

      <p className="mb-4 text-xs text-slate-500">
        <span className="font-medium text-slate-700">Rules:</span> {FOODY_RULES.net} · {FOODY_RULES.aov} · cancelled orders excluded and tracked separately · amounts in EUR, no conversion.
        {c && (
          <>
            {' '}
            <span className="font-medium text-slate-700">Comparison:</span> {c.current.start} → {c.current.end} vs {c.baseline.start} → {c.baseline.end}
            {c.baselineIncomplete && <span className="text-amber-700"> (comparison period has days without imported data — changes hidden on the tiles)</span>}
          </>
        )}
      </p>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricTile('Net sales', a.hasData ? eur(t.net) : undefined, 'net', a.range && !(c && !c.baselineIncomplete) ? `${a.range.start} → ${a.range.end}` : undefined)}
        {metricTile('Gross sales', a.hasData ? eur(t.gross) : undefined, 'gross')}
        {metricTile('Valid orders', a.hasData ? formatCount(t.validOrders) : undefined, 'validOrders')}
        {metricTile('Average order value', t.aov !== undefined ? eur(t.aov) : undefined, 'aov')}
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricTile('Discounts', a.hasData ? eur(t.discount) : undefined, 'discount')}
        {metricTile('Vouchers', a.hasData ? eur(t.voucher) : undefined, 'voucher')}
        <StatTile
          label="Cancelled orders"
          value={a.hasData ? `${formatCount(t.cancelledOrders)} · ${eur(t.cancelledSubtotal)}` : undefined}
          hint={a.hasData ? `Subtotal not included in sales${t.cancellationRate !== undefined ? ` · ${formatPercent(t.cancellationRate)} of orders` : ''}` : undefined}
        />
        <StatTile label="Days with imported data" value={a.range ? `${t.daysCovered} of ${t.calendarDays}` : undefined} hint={a.range ? (t.missingBranchDays > 0 ? `${t.missingBranchDays} branch-day(s) without data` : `Avg net per day ${money(t.averageDailyNet)}`) : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          title={a.filters.grain === 'day' ? 'Daily Foody sales trend' : a.filters.grain === 'week' ? 'Weekly Foody net sales' : 'Monthly Foody net sales'}
          description="EUR · net sales (primary) and gross sales · days without imported data are marked, never shown as zero"
          className="xl:col-span-2"
        >
          {!a.hasData ? (
            <div className="flex min-h-64 flex-col justify-center">
              <EmptyState icon={ChartLine} title="No Foody sales in this selection" compact />
            </div>
          ) : a.filters.grain === 'day' ? (
            <FoodyDailyChart daily={a.daily} />
          ) : (
            <FoodyPeriodChart periods={a.periods} grain={a.filters.grain} />
          )}
        </Panel>

        <Panel title="Sales composition" description="From gross to net sales (valid orders)">
          {a.hasData ? (
            <FoodyShareBars
              labelWidth={96}
              measure="Amount"
              rows={[
                { key: 'g', label: 'Gross sales', value: t.gross, color: SERIES[0] },
                { key: 'd', label: 'Discounts', value: t.discount, share: t.gross ? t.discount / t.gross : undefined, color: SERIES[3] },
                { key: 'v', label: 'Vouchers', value: t.voucher, share: t.gross ? t.voucher / t.gross : undefined, color: SERIES[1] },
                { key: 'n', label: 'Net sales', value: t.net, share: t.gross ? t.net / t.gross : undefined, color: BRAND },
              ]}
            />
          ) : (
            <EmptyState icon={Bike} title="No Foody sales in this selection" compact />
          )}
          {a.hasData && (
            <p className="mt-2 text-xs text-slate-500">
              {formatCount(t.promoOrders)} of {formatCount(t.validOrders)} orders used a discount or voucher. Minimum-order fees {eur(t.minOrderFees)} and packaging {eur(t.packaging)} are not part of sales.
            </p>
          )}
        </Panel>

        <Panel
          title="Campaign / period comparison"
          description={c ? `${c.current.start} → ${c.current.end} (${c.current.calendarDays} days) vs ${c.baseline.start} → ${c.baseline.end} (${c.baseline.calendarDays} days)` : 'Choose a comparison in the filters above'}
          className="xl:col-span-2"
        >
          {c && c.baseline.daysCovered === 0 ? (
            <EmptyState
              icon={CalendarRange}
              title="No Foody data imported for the comparison period"
              description={`${c.baseline.start} → ${c.baseline.end} has no imported Foody export. Import that period, or pick a custom comparison range in the filters (e.g. the weeks before a campaign).`}
              compact
            />
          ) : c ? (
            <>
              {(c.baselineIncomplete || c.currentIncomplete) && (
                <Alert level="warning" className="mb-3">
                  {c.baselineIncomplete ? `The comparison period has data on ${c.baseline.daysCovered} of ${c.baseline.calendarDays} day(s). ` : ''}
                  {c.currentIncomplete ? `The selected period has data on ${c.current.daysCovered} of ${c.current.calendarDays} day(s). ` : ''}
                  Changes are not like for like — import the missing Foody exports first.
                </Alert>
              )}
              <DataTable
                columns={[
                  { key: 'l', header: 'Metric', render: (r) => <span className="font-medium text-slate-800">{r.label}</span> },
                  { key: 'c', header: 'Selected period', align: 'right', render: (r) => r.current },
                  { key: 'b', header: 'Comparison period', align: 'right', render: (r) => r.baseline },
                  { key: 'x', header: 'Change', align: 'right', render: (r) => r.change },
                ]}
                rows={comparisonRows(c)}
                rowKey={(r) => r.key}
                empty={null}
              />
              <p className="mt-2 text-xs text-slate-500">Green = better: higher sales, orders and AOV; fewer cancellations and complaints. Discount and voucher changes are shown as they are, without a judgement.</p>
            </>
          ) : (
            <EmptyState icon={CalendarRange} title={a.range ? 'No comparison selected' : 'No Foody data in this selection'} description="Set “Compare with” to the previous period or a custom range — e.g. a campaign period against the weeks before it." compact />
          )}
        </Panel>

        <Panel title="Cancellations" description="Excluded from sales, orders and AOV">
          {a.cancellations.orders.length === 0 ? (
            <EmptyState icon={Bike} title={a.hasData ? 'No cancelled orders in this selection' : 'No Foody data in this selection'} compact />
          ) : (
            <div className="space-y-4">
              <CompactList title="By reason" rows={a.cancellations.byReason.map((r) => ({ key: r.label, label: r.label, value: `${formatCount(r.orders)}`, sub: eur(r.subtotal) }))} />
              <CompactList title="Cancelled by" rows={a.cancellations.byOwner.map((r) => ({ key: r.label, label: r.label, value: `${formatCount(r.orders)}`, sub: eur(r.subtotal) }))} />
              {a.complaints.orders.length > 0 && <CompactList title="Complaints" rows={a.complaints.byReason.map((r) => ({ key: r.label, label: r.label, value: formatCount(r.orders) }))} />}
            </div>
          )}
        </Panel>

        {a.branches.length > 1 && (
          <Panel title="Daily branch comparison" description="Net sales by branch · gaps = no imported data" className="xl:col-span-3">
            {a.hasData ? <FoodyBranchLinesChart daily={a.daily} branches={a.branches} /> : <EmptyState icon={ChartLine} title="No Foody sales in this selection" compact />}
          </Panel>
        )}

        <Panel title="Branch performance" description="Foody branches are identified by Store ID · EUR" className="xl:col-span-3">
          <DataTable
            columns={[
              {
                key: 'branch',
                header: 'Branch',
                render: (r) => (
                  <span className="flex items-center gap-2 font-medium text-slate-800">
                    <span className="inline-block size-2.5 rounded-full" style={{ background: foodyBranchColor(r.info) }} aria-hidden="true" />
                    {r.info.label}
                    <span className="text-xs font-normal text-slate-500">store {r.info.storeId}</span>
                  </span>
                ),
              },
              { key: 'net', header: 'Net sales', align: 'right', render: (r) => (r.daysCovered > 0 ? eur(r.metrics.net) : '—') },
              { key: 'share', header: 'Share', align: 'right', render: (r) => (r.share !== undefined && r.daysCovered > 0 ? formatPercent(r.share) : '—') },
              { key: 'gross', header: 'Gross sales', align: 'right', render: (r) => (r.daysCovered > 0 ? eur(r.metrics.gross) : '—') },
              { key: 'orders', header: 'Valid orders', align: 'right', render: (r) => formatCount(r.metrics.validOrders) },
              { key: 'aov', header: 'AOV', align: 'right', render: (r) => money(r.metrics.aov) },
              { key: 'promo', header: 'Discounts + vouchers', align: 'right', render: (r) => (r.daysCovered > 0 ? eur(r.metrics.discount + r.metrics.voucher) : '—') },
              { key: 'canc', header: 'Cancelled', align: 'right', render: (r) => formatCount(r.metrics.cancelledOrders) },
              { key: 'best', header: 'Best day (net)', render: (r) => (r.best ? `${r.best.date} · ${eur(r.best.net)}` : '—') },
              { key: 'status', header: 'Data', render: branchStatus },
            ]}
            rows={a.branchRows}
            rowKey={(r) => r.info.key}
            empty={<EmptyState icon={Bike} title="No Foody branches in this selection" compact />}
          />
        </Panel>

        <Panel title={`${{ day: 'Daily', week: 'Weekly', month: 'Monthly' }[a.filters.grain]} Foody sales`} description="Net sales change versus the previous period · partial = some days without data" className="xl:col-span-2">
          <div className="max-h-96 overflow-y-auto">
            <DataTable
              columns={[
                {
                  key: 'p',
                  header: a.filters.grain === 'day' ? 'Date' : a.filters.grain === 'week' ? 'Week (Mon–Sun)' : 'Month',
                  render: (p) => (
                    <span className="text-slate-800">
                      {a.filters.grain === 'month' ? p.key : p.start === p.end ? p.start : `${p.start} – ${p.end}`}
                      {p.daysCovered === 0 ? (
                        <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">no data imported</span>
                      ) : (
                        p.partial && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">partial · {p.daysCovered}/{p.calendarDays} days</span>
                      )}
                    </span>
                  ),
                },
                { key: 'n', header: 'Net sales', align: 'right', render: (p) => (p.daysCovered > 0 ? eur(p.metrics.net) : '—') },
                { key: 'o', header: 'Orders', align: 'right', render: (p) => (p.daysCovered > 0 ? formatCount(p.metrics.validOrders) : '—') },
                { key: 'a', header: 'AOV', align: 'right', render: (p) => (p.daysCovered > 0 ? money(p.metrics.aov) : '—') },
                { key: 'd', header: 'Disc. + vouchers', align: 'right', render: (p) => (p.daysCovered > 0 ? eur(p.metrics.discount + p.metrics.voucher) : '—') },
                { key: 'c', header: 'Change', align: 'right', render: (p) => <Change value={p.change} /> },
              ]}
              rows={a.periods}
              rowKey={(p) => p.key}
              empty={<EmptyState icon={CalendarRange} title="No dates in this selection" compact />}
            />
          </div>
        </Panel>

        <Panel title="Order mix" description="Valid orders by delivery and payment type">
          <div className="space-y-4">
            <MixList title="Delivery type" rows={a.mix.deliveryType} />
            <MixList title="Payment type" rows={a.mix.paymentType} />
            {a.mix.pro.length > 0 && <MixList title="Pro orders" rows={a.mix.pro} />}
          </div>
        </Panel>

        <Panel title="Top items" description={`By quantity in valid orders (from the “Order items” text) · ${formatCount(a.items.ordersWithItems)} orders`} className="xl:col-span-2">
          <div className="max-h-96 overflow-y-auto">
            <DataTable
              columns={[
                { key: 'r', header: '#', align: 'right', render: (r) => formatCount(a.items.rows.indexOf(r) + 1) },
                { key: 'n', header: 'Item', render: (r) => <span className="text-slate-800">{r.name}</span> },
                { key: 'q', header: 'Quantity', align: 'right', render: (r) => formatCount(r.quantity) },
                { key: 'o', header: 'Orders containing it', align: 'right', render: (r) => formatCount(r.orders) },
              ]}
              rows={a.items.rows.slice(0, 25)}
              rowKey={(r) => r.name}
              empty={<EmptyState icon={ShoppingBag} title="No items in this selection" compact />}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">The export has no item prices, so items are ranked by quantity only. Modifiers in […] are not counted.</p>
        </Panel>

        <QualityPanel items={a.quality} />

        <Panel title="Cancelled and complaint orders" description="Order-level detail for follow-up" className="xl:col-span-3">
          <DataTable
            columns={[
              { key: 'd', header: 'Date', render: (o) => o.receivedAt ?? `${o.cancelledAt ?? o.date} (cancelled before receipt)` },
              { key: 'id', header: 'Order ID', render: (o) => o.orderId },
              { key: 's', header: 'Status', render: (o) => o.status },
              { key: 'w', header: 'Reason', render: (o) => (o.outcome === 'cancelled' ? (o.cancellationReason ?? '—') : (o.complaintReason ?? 'Complaint')) },
              { key: 'ow', header: 'Cancelled by', render: (o) => o.cancellationOwner ?? '—' },
              { key: 'v', header: 'Subtotal', align: 'right', render: (o) => eur(o.subtotal) },
              { key: 'n', header: 'Net in sales', align: 'right', render: (o) => (o.outcome === 'valid' ? eur(orderNet(o)) : 'Excluded') },
            ]}
            rows={[...a.cancellations.orders, ...a.complaints.orders.filter((o) => o.outcome !== 'cancelled')]}
            rowKey={(o) => o.orderId}
            empty={<EmptyState icon={Bike} title="No cancelled or complaint orders in this selection" compact />}
          />
        </Panel>

        <FoodyHistoryPanel className="xl:col-span-3" storeIds={a.branches.map((b) => b.storeId)} reconciliation={a.reconciliation} />
      </div>
    </>
  )
}

