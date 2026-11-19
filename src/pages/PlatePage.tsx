import { CalendarCheck, CalendarRange, ChartLine, Download, Loader2, Upload, Users } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { QualityPanel } from '@/components/dashboard/QualityPanel'
import { PlateBars, PlateDailyChart, PlateLocationLinesChart, PlatePeriodChart } from '@/components/plate/PlateCharts'
import { plateLocationColor } from '@/components/plate/colors'
import { PlateFilterBar } from '@/components/plate/PlateFilterBar'
import { PlateHistoryPanel } from '@/components/plate/PlateHistoryPanel'
import { SERIES } from '@/components/charts/chartTheme'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { StatTile } from '@/components/ui/StatTile'
import { PLATE_RULES } from '@/config/plate'
import { downloadWorkbook } from '@/export/workbook'
import { buildPlateWorkbook } from '@/export/plateWorkbook'
import { computePlateAnalytics, type PlateComparison, type PlateCountRow, type PlateLocationRow } from '@/plate/analytics'
import { hrefFor } from '@/hooks/useHashRoute'
import { usePlateStore } from '@/state/plateStore'
import { cn, formatCount, formatNumber, formatPercent, formatSignedPercent } from '@/utils/format'

const pct = (v: number | undefined) => (v === undefined ? '—' : formatPercent(v))
const dec1 = (v: number | undefined) => (v === undefined ? '—' : formatNumber(v, 1))

function Change({ value, points, lowerIsBetter }: { value: number | undefined; points?: boolean; lowerIsBetter?: boolean }) {
  if (value === undefined) return <span className="text-slate-300">—</span>
  const text = points ? `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)} pts` : formatSignedPercent(value)
  const good = lowerIsBetter ? value < 0 : value > 0
  return <span className={cn('tabular-nums', value === 0 ? 'text-slate-600' : good ? 'text-emerald-700' : 'text-red-700')}>{text}</span>
}

function locationStatus(r: PlateLocationRow) {
  if (r.daysCovered === 0) return <Badge tone="warning">No data imported</Badge>
  if (r.missingDays > 0) return <Badge tone="warning">{r.missingDays} missing day(s)</Badge>
  return <Badge tone="success">Complete</Badge>
}

function comparisonRows(c: PlateComparison) {
  const a = c.current.metrics
  const b = c.baseline.metrics
  const rows: { key: string; label: string; current: string; baseline: string; change: ReactNode }[] = [
    { key: 'cov', label: 'Guests (covers)', current: formatCount(a.covers), baseline: formatCount(b.covers), change: <Change value={c.change.covers} /> },
    { key: 'comp', label: 'Completed reservations', current: formatCount(a.completed), baseline: formatCount(b.completed), change: <Change value={c.change.completed} /> },
    { key: 'all', label: 'Total reservations', current: formatCount(a.bookings), baseline: formatCount(b.bookings), change: <Change value={c.change.bookings} /> },
    { key: 'avg', label: 'Average party size', current: dec1(a.avgPartySize), baseline: dec1(b.avgPartySize), change: <Change value={c.change.avgPartySize} /> },
    { key: 'g', label: 'Unique guests', current: formatCount(a.uniqueGuests), baseline: formatCount(b.uniqueGuests), change: <Change value={c.change.uniqueGuests} /> },
    { key: 'can', label: 'Cancelled reservations', current: formatCount(a.cancelled), baseline: formatCount(b.cancelled), change: <Change value={c.change.cancelled} lowerIsBetter /> },
    { key: 'canr', label: 'Cancellation rate', current: pct(a.cancellationRate), baseline: pct(b.cancellationRate), change: <Change value={c.pointChange.cancellationRate} points lowerIsBetter /> },
    { key: 'dec', label: 'Declined reservations', current: formatCount(a.declined), baseline: formatCount(b.declined), change: <Change value={c.change.declined} lowerIsBetter /> },
    { key: 'decr', label: 'Decline rate', current: pct(a.declineRate), baseline: pct(b.declineRate), change: <Change value={c.pointChange.declineRate} points lowerIsBetter /> },
  ]
  return rows
}

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

const mixRows = (rows: PlateCountRow[]) => rows.map((r) => ({ key: r.key, label: r.label, value: `${formatCount(r.bookings)} booking(s)`, sub: `${pct(r.share)} · ${formatCount(r.covers)} guests completed` }))
const tileChange = (c: PlateComparison | undefined, key: keyof PlateComparison['change']) => (c && !c.baselineIncomplete ? c.change[key] : undefined)

export function PlatePage() {
  const { state, filters } = usePlateStore()
  const a = useMemo(() => computePlateAnalytics(state, filters), [state, filters])
  const [exporting, setExporting] = useState<{ kind: 'idle' | 'working' | 'done' | 'error'; message?: string }>({ kind: 'idle' })
  const nothingImported = state.imports.length === 0
  const latest = useMemo(() => state.imports.reduce<string | undefined>((m, i) => (!m || i.periodEnd > m ? i.periodEnd : m), undefined), [state.imports])
  const t = a.totals
  const c = a.comparison
  const g = a.guests
  const changeLabel = c ? `vs ${c.baseline.start} → ${c.baseline.end}` : undefined

  const handleExport = async () => {
    setExporting({ kind: 'working' })
    try {
      const generatedAt = new Date()
      const wb = await buildPlateWorkbook(a, { title: 'Plate Reservations Report — Ginger & Co and Pertutti', generatedAt })
      const name = `plate-reservations-report-${generatedAt.toISOString().slice(0, 10)}.xlsx`
      await downloadWorkbook(wb, name)
      setExporting({ kind: 'done', message: `Downloaded ${name} with ${wb.worksheets.length} sheets for the current filters.` })
    } catch (error) {
      setExporting({ kind: 'error', message: error instanceof Error ? error.message : 'The report could not be generated.' })
    }
  }

  const tile = (label: string, value: string | undefined, key: keyof PlateComparison['change'] | undefined, hint?: string) => (
    <StatTile label={label} value={value} change={key ? tileChange(c, key) : undefined} changeLabel={changeLabel} hint={hint ?? (key && tileChange(c, key) !== undefined ? changeLabel : undefined)} />
  )

  return (
    <>
      <PageHeader
        title="Plate reservations"
        description="Reservations from Plate for Ginger & Co Hazmieh, Ginger & Co Jal El Dib, Pertutti Hazmieh and Hamra (Ginger & Co + Pertutti, one location). Reported separately — never combined with Weevi, Toters or Foody sales."
        actions={
          <>
            <a href={hrefFor('/import')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              <Upload className="size-4" aria-hidden="true" /> Import Plate CSV
            </a>
            <Button variant="primary" onClick={handleExport} disabled={!a.hasData || exporting.kind === 'working'}>
              {exporting.kind === 'working' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
              Export Plate report
            </Button>
          </>
        }
      />
      <PlateFilterBar latest={latest} />

      {exporting.kind === 'done' && <Alert level="info" className="mb-4">{exporting.message}</Alert>}
      {exporting.kind === 'error' && <Alert level="error" className="mb-4" title="Export failed">{exporting.message}</Alert>}

      {nothingImported ? (
        <div className="mb-6 flex flex-col items-start gap-3 rounded-xl border border-accent-100 bg-accent-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">No Plate data imported yet</p>
            <p className="text-xs text-slate-600">Import the Plate “Bookings” CSV exports (one per location). The location and period are read from the file name and confirmed on import.</p>
          </div>
          <a href={hrefFor('/import')} className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-accent-700">
            <Upload className="size-4" aria-hidden="true" /> Import data
          </a>
        </div>
      ) : (
        !a.hasData && (
          <Alert level="warning" className="mb-6" title="No Plate data matches the current filters">
            Adjust the location or dates, or import Plate exports covering this selection.
          </Alert>
        )
      )}

      <p className="mb-4 text-xs text-slate-500">
        <span className="font-medium text-slate-700">Rules:</span> reported by reservation date · guests = party size of completed reservations · cancelled (by the guest) and declined (by the restaurant) tracked separately · walk-ins and no-shows are not in the Plate export.
        {c && (
          <>
            {' '}
            <span className="font-medium text-slate-700">Comparison:</span> {c.current.start} → {c.current.end} vs {c.baseline.start} → {c.baseline.end}
            {c.baselineIncomplete && <span className="text-amber-700"> (comparison period has days without imported data — changes hidden on the tiles)</span>}
          </>
        )}
      </p>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tile('Guests (covers)', a.hasData ? formatCount(t.covers) : undefined, 'covers', a.range && !(c && !c.baselineIncomplete) ? `${a.range.start} → ${a.range.end}` : undefined)}
        {tile('Completed reservations', a.hasData ? formatCount(t.completed) : undefined, 'completed', a.hasData && !(c && !c.baselineIncomplete) ? `${pct(t.completionRate)} of all reservations` : undefined)}
        {tile('Total reservations', a.hasData ? formatCount(t.bookings) : undefined, 'bookings', a.hasData && !(c && !c.baselineIncomplete) ? 'All statuses' : undefined)}
        {tile('Average party size', a.hasData ? dec1(t.avgPartySize) : undefined, 'avgPartySize', a.hasData && !(c && !c.baselineIncomplete) ? 'Guests per completed reservation' : undefined)}
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Cancelled by guest" value={a.hasData ? `${formatCount(t.cancelled)} · ${formatCount(t.cancelledGuests)} guests` : undefined} hint={a.hasData ? `${pct(t.cancellationRate)} of reservations` : undefined} />
        <StatTile label="Declined by restaurant" value={a.hasData ? `${formatCount(t.declined)} · ${formatCount(t.declinedGuests)} guests` : undefined} hint={a.hasData ? `${pct(t.declineRate)} of reservations` : undefined} />
        <StatTile label="Unique guests" value={a.hasData ? formatCount(g.guests) : undefined} hint={a.hasData ? `${formatCount(g.repeat)} repeat guest(s) · ${pct(g.repeatShare)}` : undefined} />
        <StatTile label="Days with imported data" value={a.range ? `${t.daysCovered} of ${t.calendarDays}` : undefined} hint={a.range ? (t.missingLocationDays > 0 ? `${t.missingLocationDays} location-day(s) without data` : `Avg ${dec1(t.avgCoversPerDay)} guests per day`) : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          title={a.filters.grain === 'day' ? 'Daily reservations' : a.filters.grain === 'week' ? 'Weekly guests' : 'Monthly guests'}
          description="By reservation date · guests of completed reservations · days without imported data are marked, never zero"
          className="xl:col-span-2"
        >
          {!a.hasData ? (
            <div className="flex min-h-64 flex-col justify-center">
              <EmptyState icon={ChartLine} title="No Plate reservations in this selection" compact />
            </div>
          ) : a.filters.grain === 'day' ? (
            <PlateDailyChart daily={a.daily} />
          ) : (
            <PlatePeriodChart periods={a.periods} grain={a.filters.grain} />
          )}
        </Panel>

        <Panel title="Reservation status" description="Every status found in the imported files">
          {a.mix.status.length === 0 ? (
            <EmptyState icon={CalendarCheck} title="No reservations in this selection" compact />
          ) : (
            <div className="space-y-4">
              <CompactList title="By status" rows={a.mix.status.map((r) => ({ key: r.key, label: r.label, value: `${formatCount(r.bookings)} · ${pct(r.share)}`, sub: `${formatCount(r.covers)} guests · ${r.outcome}` }))} />
              <Alert level="info">Walk-ins and no-shows are not in the Plate export, so they are not shown.</Alert>
            </div>
          )}
        </Panel>

        <Panel
          title="Period comparison"
          description={c ? `${c.current.start} → ${c.current.end} (${c.current.calendarDays} days) vs ${c.baseline.start} → ${c.baseline.end} (${c.baseline.calendarDays} days)` : 'Choose a comparison in the filters above'}
          className="xl:col-span-2"
        >
          {c && c.baseline.daysCovered === 0 ? (
            <EmptyState icon={CalendarRange} title="No Plate data imported for the comparison period" description={`${c.baseline.start} → ${c.baseline.end} has no imported Plate export. Import that period, or pick a custom comparison range.`} compact />
          ) : c ? (
            <>
              {(c.baselineIncomplete || c.currentIncomplete) && (
                <Alert level="warning" className="mb-3">
                  {c.baselineIncomplete ? `The comparison period has data on ${c.baseline.daysCovered} of ${c.baseline.calendarDays} day(s). ` : ''}
                  {c.currentIncomplete ? `The selected period has data on ${c.current.daysCovered} of ${c.current.calendarDays} day(s). ` : ''}
                  Changes are not like for like.
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
              <p className="mt-2 text-xs text-slate-500">Green = better: more guests and reservations; fewer cancellations and declines.</p>
            </>
          ) : (
            <EmptyState icon={CalendarRange} title={a.range ? 'No comparison selected' : 'No Plate data in this selection'} description="Set “Compare with” to the previous period or a custom range." compact />
          )}
        </Panel>

        <Panel title="Repeat guests" description="Identified by phone number (stored only as a one-way code) · completed reservations">
          {!a.hasData || g.guests === 0 ? (
            <EmptyState icon={Users} title="No identified guests in this selection" compact />
          ) : (
            <div className="space-y-4">
              <CompactList
                title="Guests in the selection"
                rows={[
                  { key: 'u', label: 'Unique guests', value: formatCount(g.guests) },
                  { key: 'r', label: 'Repeat guests (2+ visits, all imported months)', value: formatCount(g.repeat), sub: pct(g.repeatShare) },
                  { key: 'ri', label: '2+ visits within the selected period', value: formatCount(g.repeatInRange) },
                  { key: 'ret', label: 'Returning (visited before the period)', value: formatCount(g.returning), sub: g.noHistoryBefore ? 'No earlier data imported' : undefined },
                  { key: 'f', label: 'First visit in the imported data', value: formatCount(g.firstTime) },
                  ...(g.multiLocation !== undefined ? [{ key: 'm', label: 'Visited 2+ locations', value: formatCount(g.multiLocation) }] : []),
                ]}
              />
              {g.unidentified > 0 && <p className="text-xs text-slate-500">{g.unidentified} completed reservation(s) without a phone or email are not counted.</p>}
            </div>
          )}
        </Panel>

        {a.locations.length > 1 && (
          <Panel title="Daily guests by location" description="Completed reservations · gaps = no imported data" className="xl:col-span-3">
            {a.hasData ? <PlateLocationLinesChart daily={a.daily} locations={a.locations} /> : <EmptyState icon={ChartLine} title="No Plate reservations in this selection" compact />}
          </Panel>
        )}

        <Panel title="Location performance" description="Hamra is one combined reservation location for Ginger & Co and Pertutti" className="xl:col-span-3">
          <DataTable
            columns={[
              {
                key: 'l',
                header: 'Location',
                render: (r) => (
                  <span className="flex items-center gap-2 font-medium text-slate-800">
                    <span className="inline-block size-2.5 rounded-full" style={{ background: plateLocationColor(r.info) }} aria-hidden="true" />
                    {r.info.label}
                    {(r.daysCovered === 0 || r.missingDays > 0) && locationStatus(r)}
                  </span>
                ),
              },
              { key: 'cov', header: 'Guests', align: 'right', render: (r) => (r.daysCovered > 0 ? formatCount(r.metrics.covers) : '—') },
              { key: 'sh', header: 'Share', align: 'right', render: (r) => (r.daysCovered > 0 ? pct(r.share) : '—') },
              { key: 'comp', header: 'Completed', align: 'right', render: (r) => formatCount(r.metrics.completed) },
              { key: 'all', header: 'Bookings', align: 'right', render: (r) => formatCount(r.metrics.bookings) },
              { key: 'avg', header: 'Avg party', align: 'right', render: (r) => dec1(r.metrics.avgPartySize) },
              { key: 'can', header: 'Cancelled', align: 'right', render: (r) => formatCount(r.metrics.cancelled) },
              { key: 'dec', header: 'Declined', align: 'right', render: (r) => formatCount(r.metrics.declined) },
              { key: 'g', header: 'Unique', align: 'right', render: (r) => formatCount(r.metrics.uniqueGuests) },
              { key: 'b', header: 'Busiest day', render: (r) => (r.busiest ? `${r.busiest.date} (${r.busiest.covers})` : '—') },
            ]}
            rows={a.locationRows}
            rowKey={(r) => r.info.id}
            empty={null}
          />
        </Panel>

        <Panel title="Busiest days of the week" description="Guests of completed reservations · average per day with data">
          {a.hasData ? (
            <>
              <PlateBars labelWidth={90} measure="Guests" rows={a.weekdays.map((w) => ({ key: w.key, label: w.label, value: w.covers, share: w.share }))} />
              <p className="mt-2 text-xs text-slate-500">Average guests per day: {a.weekdays.map((w) => `${w.label.slice(0, 3)} ${dec1(w.avgCovers)}`).join(' · ')}</p>
            </>
          ) : (
            <EmptyState icon={CalendarCheck} title="No data" compact />
          )}
        </Panel>

        <Panel title="Busiest reservation times" description="Completed reservations by booked time slot (no arrival time in the export)">
          {a.timeSlots.length > 0 ? (
            <PlateBars labelWidth={70} measure="Guests" rows={a.timeSlots.map((r) => ({ key: r.key, label: r.label, value: r.covers, share: totalShare(r.covers, t.covers) }))} />
          ) : (
            <EmptyState icon={CalendarCheck} title="No completed reservations" compact />
          )}
        </Panel>

        <Panel title="Party sizes" description="Completed reservations by number of guests">
          {a.partySizes.length > 0 ? (
            <PlateBars labelWidth={70} measure="Reservations" rows={a.partySizes.map((r) => ({ key: r.key, label: r.label, value: r.completed, share: r.share, color: SERIES[0] }))} />
          ) : (
            <EmptyState icon={CalendarCheck} title="No completed reservations" compact />
          )}
        </Panel>

        <Panel title="Booking lead time" description={`How far ahead reservations were made · all statuses · ${formatCount(a.leadTime.known)} with a “Booked At” time`}>
          {a.leadTime.known > 0 ? (
            <>
              <PlateBars labelWidth={150} measure="Reservations" rows={a.leadTime.rows.map((r) => ({ key: r.key, label: r.label, value: r.bookings, share: r.share, color: SERIES[2] }))} />
              <p className="mt-2 text-xs text-slate-500">
                Average {dec1(a.leadTime.average)} day(s) · median {dec1(a.leadTime.median)} day(s) ahead.
              </p>
            </>
          ) : (
            <EmptyState icon={CalendarCheck} title="No booking times in this selection" compact />
          )}
        </Panel>

        <Panel title="Booking source and seating" description="All reservations in the selection">
          <div className="space-y-4">
            <CompactList title="Source" rows={mixRows(a.mix.source)} />
            <CompactList title="Section" rows={mixRows(a.mix.section)} />
            <CompactList title="Booking type" rows={mixRows(a.mix.bookingType)} />
          </div>
        </Panel>

        <Panel title="Occasions and requests" description="As entered on the booking">
          <div className="space-y-4">
            <CompactList title="Occasion" rows={mixRows(a.mix.occasion)} />
            <CompactList
              title="Booking details (counts only — content is not stored)"
              rows={[
                { key: 'd', label: 'With dietary notes', value: formatCount(a.extras.dietaryNotes) },
                { key: 's', label: 'With special requests', value: formatCount(a.extras.specialRequests) },
                { key: 'm', label: 'Modified after booking', value: formatCount(a.extras.modified) },
              ]}
            />
          </div>
        </Panel>

        <Panel title={`${{ day: 'Daily', week: 'Weekly', month: 'Monthly' }[a.filters.grain]} reservations`} description="Guests change versus the previous period · partial = some days without data" className="xl:col-span-2">
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
                { key: 'g', header: 'Guests', align: 'right', render: (p) => (p.daysCovered > 0 ? formatCount(p.metrics.covers) : '—') },
                { key: 'c', header: 'Completed', align: 'right', render: (p) => (p.daysCovered > 0 ? formatCount(p.metrics.completed) : '—') },
                { key: 'b', header: 'Reservations', align: 'right', render: (p) => (p.daysCovered > 0 ? formatCount(p.metrics.bookings) : '—') },
                { key: 'x', header: 'Cancelled / declined', align: 'right', render: (p) => (p.daysCovered > 0 ? `${p.metrics.cancelled} / ${p.metrics.declined}` : '—') },
                { key: 'ch', header: 'Change', align: 'right', render: (p) => <Change value={p.change} /> },
              ]}
              rows={a.periods}
              rowKey={(p) => p.key}
              empty={<EmptyState icon={CalendarRange} title="No dates in this selection" compact />}
            />
          </div>
        </Panel>

        <Panel title="Most frequent guests" description="Completed visits · anonymised codes only — no names or phone numbers">
          <DataTable
            columns={[
              { key: 'l', header: 'Guest', render: (r) => <span className="font-mono text-xs text-slate-800">{r.label}</span> },
              { key: 'v', header: 'Visits (all)', align: 'right', render: (r) => formatCount(r.visitsAllTime) },
              { key: 'p', header: 'In period', align: 'right', render: (r) => formatCount(r.visitsInRange) },
            ]}
            rows={g.top.slice(0, 10)}
            rowKey={(r) => r.label}
            empty={<EmptyState icon={Users} title="No repeat guests in this selection" compact />}
          />
        </Panel>

        <QualityPanel items={a.quality} className="xl:col-span-3" />

        <PlateHistoryPanel className="xl:col-span-3" locationIds={a.locations.map((l) => l.id)} reconciliation={a.reconciliation} />
      </div>
      <p className="mt-4 text-xs text-slate-400">{PLATE_RULES.privacy}.</p>
    </>
  )
}

function totalShare(v: number, total: number) {
  return total > 0 ? v / total : undefined
}
