import { CalendarRange, ChartLine, Download, Loader2, Truck, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { QualityPanel } from '@/components/dashboard/QualityPanel'
import { BRAND_COLOR, branchColor } from '@/components/toters/colors'
import { TotersBranchLinesChart, TotersDailyChart, TotersPeriodChart, TotersShareBars } from '@/components/toters/TotersCharts'
import { TotersFilterBar } from '@/components/toters/TotersFilterBar'
import { TotersHistoryPanel } from '@/components/toters/TotersHistoryPanel'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { StatTile } from '@/components/ui/StatTile'
import { SERIES } from '@/components/charts/chartTheme'
import { TOTERS_CONVERSION } from '@/config/toters'
import { downloadWorkbook } from '@/export/workbook'
import { buildTotersWorkbook } from '@/export/totersWorkbook'
import { hrefFor } from '@/hooks/useHashRoute'
import { useTotersStore } from '@/state/totersStore'
import { computeTotersAnalytics, type TotersBranchRow } from '@/toters/analytics'
import { cn, formatCount, formatMoney, formatPercent, formatSignedPercent } from '@/utils/format'

const usd = (v: number) => formatMoney(v, 'USD')

function Change({ value }: { value: number | undefined }) {
  if (value === undefined) return <span className="text-slate-300">—</span>
  return <span className={cn('tabular-nums', value > 0 ? 'text-emerald-700' : value < 0 ? 'text-red-700' : 'text-slate-600')}>{formatSignedPercent(value)}</span>
}

function branchStatus(r: TotersBranchRow) {
  if (r.daysWithData === 0) return <Badge tone="warning">No data imported</Badge>
  if (r.invalidDays > 0) return <Badge tone="danger">{r.invalidDays} invalid day(s)</Badge>
  if (r.missingDays > 0) return <Badge tone="warning">{r.missingDays} missing day(s)</Badge>
  return <Badge tone="success">Complete</Badge>
}

export function TotersPage() {
  const { state, filters } = useTotersStore()
  const a = useMemo(() => computeTotersAnalytics(state, filters), [state, filters])
  const [selected, setSelected] = useState<string[] | null>(null)
  const [exporting, setExporting] = useState<{ kind: 'idle' | 'working' | 'done' | 'error'; message?: string }>({ kind: 'idle' })
  const nothingImported = state.days.length === 0
  const lineBranches = a.branches.filter((b) => (selected ?? a.branches.map((x) => x.key)).includes(b.key))

  const toggle = (key: string) => {
    const current = selected ?? a.branches.map((b) => b.key)
    setSelected(current.includes(key) ? current.filter((k) => k !== key) : [...current, key])
  }

  const handleExport = async () => {
    setExporting({ kind: 'working' })
    try {
      const generatedAt = new Date()
      const wb = await buildTotersWorkbook(a, { title: 'Toters Sales Report — Ginger & Co / Pertutti', generatedAt })
      const name = `toters-report-${generatedAt.toISOString().slice(0, 10)}.xlsx`
      await downloadWorkbook(wb, name)
      setExporting({ kind: 'done', message: `Downloaded ${name} with ${wb.worksheets.length} sheets for the current filters.` })
    } catch (error) {
      setExporting({ kind: 'error', message: error instanceof Error ? error.message : 'The report could not be generated.' })
    }
  }

  const t = a.totals
  return (
    <>
      <PageHeader
        title="Toters analytics"
        description="Toters delivery revenue in USD, by brand and branch. Reported separately from Weevi — Toters revenue is never added to app revenue."
        actions={
          <>
            <a href={hrefFor('/import')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              <Upload className="size-4" aria-hidden="true" /> Import Toters CSV
            </a>
            <Button variant="primary" onClick={handleExport} disabled={!a.hasData || exporting.kind === 'working'}>
              {exporting.kind === 'working' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
              Export Toters report
            </Button>
          </>
        }
      />
      <TotersFilterBar />

      {exporting.kind === 'done' && <Alert level="info" className="mb-4">{exporting.message}</Alert>}
      {exporting.kind === 'error' && <Alert level="error" className="mb-4" title="Export failed">{exporting.message}</Alert>}

      {nothingImported ? (
        <div className="mb-6 flex flex-col items-start gap-3 rounded-xl border border-accent-100 bg-accent-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">No Toters data imported yet</p>
            <p className="text-xs text-slate-600">Import Toters daily revenue CSVs (one branch per file, or all branches in one file). Branches are identified by store ID.</p>
          </div>
          <a href={hrefFor('/import')} className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-accent-700">
            <Upload className="size-4" aria-hidden="true" /> Import data
          </a>
        </div>
      ) : (
        !a.hasData && (
          <Alert level="warning" className="mb-6" title="No Toters data matches the current filters">
            Adjust the brand, branch or dates, or import Toters exports covering this selection.
          </Alert>
        )
      )}

      <p className="mb-4 text-xs text-slate-500">
        <span className="font-medium text-slate-700">Conversion:</span> {TOTERS_CONVERSION.formula} · fixed rate {TOTERS_CONVERSION.lbpPerUsd.toLocaleString('en-US')} LBP per USD · figures rounded for display only.
      </p>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Total Toters revenue" value={a.hasData ? usd(t.revenueUsd) : undefined} hint={a.range ? `${a.range.start} → ${a.range.end}` : undefined} />
        <StatTile label="Average daily revenue" value={t.averageDailyUsd !== undefined ? usd(t.averageDailyUsd) : undefined} hint={t.averageDailyUsd !== undefined ? 'Total ÷ days with imported data' : undefined} />
        <StatTile label="Active Toters branches" value={a.branches.length > 0 ? `${t.branchesWithData} of ${a.branches.length}` : undefined} hint={a.unavailable.length > 0 ? `${a.unavailable.map((u) => u.label).join(', ')}: not available` : 'With data in this range'} />
        <StatTile label="Highest revenue branch" value={a.highestBranch ? usd(a.highestBranch.revenueUsd) : undefined} hint={a.highestBranch?.info.label} />
        <StatTile
          label="Days with imported data"
          value={a.range ? `${t.daysWithData} of ${t.calendarDays}` : undefined}
          hint={a.range ? (t.missingDays + t.invalidDays > 0 ? `${t.missingDays} missing · ${t.invalidDays} invalid branch-day(s)` : 'No missing branch-days') : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          title={a.filters.grain === 'day' ? 'Daily Toters revenue trend' : a.filters.grain === 'week' ? 'Weekly Toters revenue' : 'Monthly Toters revenue'}
          description="USD · days without imported data are marked, never shown as zero"
          className="xl:col-span-2"
        >
          {!a.hasData ? (
            <div className="flex min-h-64 flex-col justify-center">
              <EmptyState icon={ChartLine} title="No Toters revenue in this selection" compact />
            </div>
          ) : a.filters.grain === 'day' ? (
            <TotersDailyChart daily={a.daily} />
          ) : (
            <TotersPeriodChart periods={a.periods} grain={a.filters.grain} />
          )}
        </Panel>

        <Panel title="Brand revenue comparison" description="Toters revenue and share by brand">
          {a.hasData ? (
            <TotersShareBars labelWidth={92} rows={a.brandRows.map((b) => ({ key: b.brandId, label: b.name, value: b.revenueUsd, share: b.share, color: BRAND_COLOR[b.brandId] ?? SERIES[0] }))} />
          ) : (
            <EmptyState icon={Truck} title="No Toters revenue in this selection" compact />
          )}
        </Panel>

        <Panel
          title="Daily branch comparison"
          description="Several branches on one daily chart · gaps = no imported data"
          className="xl:col-span-3"
          actions={
            a.branches.length > 1 ? (
              <div className="flex flex-wrap justify-end gap-1.5" role="group" aria-label="Branches shown">
                {a.branches.map((b) => {
                  const on = lineBranches.some((x) => x.key === b.key)
                  return (
                    <button
                      key={b.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(b.key)}
                      className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium', on ? 'border-slate-300 bg-white text-slate-800' : 'border-slate-200 bg-slate-50 text-slate-400')}
                    >
                      <span className="inline-block size-2 rounded-full" style={{ background: on ? branchColor(b) : '#cbd5e1' }} aria-hidden="true" />
                      {b.label}
                    </button>
                  )
                })}
              </div>
            ) : undefined
          }
        >
          {a.hasData && lineBranches.length > 0 ? (
            <TotersBranchLinesChart daily={a.daily} branches={lineBranches} />
          ) : (
            <EmptyState icon={ChartLine} title={a.hasData ? 'Select at least one branch' : 'No Toters revenue in this selection'} compact />
          )}
        </Panel>

        <Panel title="Branch revenue comparison" description="Revenue totals and share of Toters revenue in this selection" className="xl:col-span-2">
          {a.hasData ? (
            <TotersShareBars
              rows={[...a.branchRows].sort((x, y) => y.revenueUsd - x.revenueUsd).map((r) => ({ key: r.info.key, label: r.info.label, value: r.revenueUsd, share: r.share, color: branchColor(r.info) }))}
            />
          ) : (
            <EmptyState icon={Truck} title="No Toters revenue in this selection" compact />
          )}
        </Panel>

        <Panel title="Toters availability" description="Which branches have a Toters channel">
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {a.branchRows.map((r) => (
              <li key={r.info.key} className="flex items-center gap-3 px-4 py-3">
                <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: branchColor(r.info) }} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{r.info.label}</p>
                  <p className="text-xs text-slate-500">Store ID {r.info.storeId}</p>
                </div>
                {branchStatus(r)}
              </li>
            ))}
            {a.unavailable.map((u) => (
              <li key={u.label} className="flex items-center gap-3 px-4 py-3">
                <span className="inline-block size-2.5 shrink-0 rounded-full bg-slate-200" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-500">{u.label}</p>
                  <p className="text-xs text-slate-400">{u.reason}</p>
                </div>
                <Badge>Not available</Badge>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Branch performance" description="All amounts from Toters branch rows · LBP = CSV total × 1,500" className="xl:col-span-3">
          <DataTable
            columns={[
              { key: 'branch', header: 'Branch', render: (r) => <span className="font-medium text-slate-800">{r.info.label}</span> },
              { key: 'usd', header: 'Revenue (USD)', align: 'right', render: (r) => (r.daysWithData > 0 ? usd(r.revenueUsd) : '—') },
              { key: 'share', header: 'Share', align: 'right', render: (r) => (r.share !== undefined && r.daysWithData > 0 ? formatPercent(r.share) : '—') },
              { key: 'avg', header: 'Avg per day', align: 'right', render: (r) => (r.averageDailyUsd !== undefined ? usd(r.averageDailyUsd) : '—') },
              { key: 'days', header: 'Days with data', align: 'right', render: (r) => formatCount(r.daysWithData) },
              { key: 'zero', header: 'Zero-sales days', align: 'right', render: (r) => formatCount(r.zeroDays) },
              { key: 'best', header: 'Best day', render: (r) => (r.best ? `${r.best.date} · ${usd(r.best.revenueUsd)}` : '—') },
              { key: 'lbp', header: 'Revenue (LBP)', align: 'right', render: (r) => (r.daysWithData > 0 ? formatMoney(r.revenueLbp, 'LBP') : '—') },
              { key: 'status', header: 'Data', render: branchStatus },
            ]}
            rows={a.branchRows}
            rowKey={(r) => r.info.key}
            empty={<EmptyState icon={Truck} title="No Toters branches in this selection" compact />}
          />
        </Panel>

        <Panel title={`${{ day: 'Daily', week: 'Weekly', month: 'Monthly' }[a.filters.grain]} Toters revenue`} description="Change versus the previous period · partial = some days or branches without data" className="xl:col-span-2">
          <div className="max-h-96 overflow-y-auto">
            <DataTable
              columns={[
                {
                  key: 'p',
                  header: a.filters.grain === 'day' ? 'Date' : a.filters.grain === 'week' ? 'Week (Mon–Sun)' : 'Month',
                  render: (p) => (
                    <span className="text-slate-800">
                      {a.filters.grain === 'month' ? p.key : p.start === p.end ? p.start : `${p.start} – ${p.end}`}
                      {p.daysWithData === 0 ? (
                        <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">no data imported</span>
                      ) : (
                        p.partial && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">partial · {p.daysWithData}/{p.calendarDays} days</span>
                      )}
                    </span>
                  ),
                },
                { key: 'r', header: 'Revenue (USD)', align: 'right', render: (p) => (p.daysWithData > 0 ? usd(p.revenueUsd) : '—') },
                { key: 'c', header: 'Change', align: 'right', render: (p) => <Change value={p.change} /> },
              ]}
              rows={a.periods}
              rowKey={(p) => p.key}
              empty={<EmptyState icon={CalendarRange} title="No dates in this selection" compact />}
            />
          </div>
        </Panel>

        <QualityPanel items={a.quality} />
        <TotersHistoryPanel className="xl:col-span-3" storeIds={a.branches.map((b) => b.storeId)} />
      </div>
    </>
  )
}
