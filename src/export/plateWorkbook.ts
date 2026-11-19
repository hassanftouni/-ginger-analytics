import type { Workbook } from 'exceljs'
import { BRAND, SERIES } from '@/components/charts/chartTheme'
import { PLATE_RULES } from '@/config/plate'
import { plateLocationLabel, type PlateAnalytics, type PlateComparison, type PlateCountRow } from '@/plate/analytics'
import { addChart } from './charts'
import { FMT, PALETTE, TAB, finishSheet, kpiCards, note, prettyDate, section, setWidths, sheetHeader, table, type CellStyle, type CellValue, type KpiCard, type Span } from './theme'

/**
 * Plate reservations Excel report — a separate workbook from the Weevi, Toters and Foody reports,
 * in the same theme with native charts. It only presents figures already computed by the Plate
 * analytics for the selected filters. No guest names, phone numbers or emails are written.
 */

export interface PlateReportOptions {
  title: string
  generatedAt: Date
}

const span = (from: number, to: number): Span => ({ from, to })
const PTS = '+0.0" pts";-0.0" pts";0.0" pts"'
const DEC1 = '0.0'
const STRIP = (hex: string) => hex.replace('#', '').toUpperCase()

const levelStyle = (level: string): CellStyle =>
  level === 'ERROR'
    ? { fill: PALETTE.negativeSoft, color: PALETTE.negative, bold: true }
    : level === 'WARNING'
      ? { fill: PALETTE.warningSoft, color: PALETTE.warning, bold: true }
      : { fill: PALETTE.infoSoft, color: PALETTE.info, bold: true }

export function describePlateFilters(a: PlateAnalytics): string {
  const loc = a.filters.location === 'all' ? 'All Plate locations' : plateLocationLabel(a.filters.location)
  const grain = { day: 'Daily', week: 'Weekly', month: 'Monthly' }[a.filters.grain]
  return `${loc} · ${grain} view`
}

const rangeText = (a: PlateAnalytics) => (a.range ? `${a.range.start} to ${a.range.end}` : 'No Plate data in this selection')
const statusText = { complete: 'Complete', partial: 'Partial — some locations missing', missing: 'No data imported' } as const
const compareText = (c: PlateComparison | undefined) =>
  c ? `${c.current.start} to ${c.current.end} vs ${c.baseline.start} to ${c.baseline.end} (${c.mode === 'previous' ? 'previous period of the same length' : 'custom comparison period'})` : 'No comparison selected'

export const PLATE_SHEETS = ['Plate Executive Summary', 'Plate Daily Reservations', 'Plate Period Comparison', 'Plate Locations', 'Plate Booking Patterns', 'Plate Sources & Guests', 'Plate Data Quality'] as const

/** label, current, baseline, change, value format, change format, lowerIsBetter */
function comparisonTable(c: PlateComparison) {
  const a = c.current.metrics
  const b = c.baseline.metrics
  const list: [string, number | undefined, number | undefined, number | undefined, string, string, boolean][] = [
    ['Guests (covers)', a.covers, b.covers, c.change.covers, FMT.int, FMT.signedPct, false],
    ['Completed reservations', a.completed, b.completed, c.change.completed, FMT.int, FMT.signedPct, false],
    ['Total reservations', a.bookings, b.bookings, c.change.bookings, FMT.int, FMT.signedPct, false],
    ['Average party size', a.avgPartySize, b.avgPartySize, c.change.avgPartySize, DEC1, FMT.signedPct, false],
    ['Unique guests', a.uniqueGuests, b.uniqueGuests, c.change.uniqueGuests, FMT.int, FMT.signedPct, false],
    ['Cancelled reservations', a.cancelled, b.cancelled, c.change.cancelled, FMT.int, FMT.signedPct, true],
    ['Cancellation rate', a.cancellationRate, b.cancellationRate, c.pointChange.cancellationRate === undefined ? undefined : c.pointChange.cancellationRate * 100, FMT.pct, PTS, true],
    ['Declined reservations', a.declined, b.declined, c.change.declined, FMT.int, FMT.signedPct, true],
    ['Decline rate', a.declineRate, b.declineRate, c.pointChange.declineRate === undefined ? undefined : c.pointChange.declineRate * 100, FMT.pct, PTS, true],
  ]
  return { rows: list.map(([l, x, y, z]) => [l, x, y, z] as CellValue[]), formats: list.map((r) => r[4]), changeFormats: list.map((r) => r[5]), lower: list.map((r) => r[6]) }
}

export async function buildPlateWorkbook(a: PlateAnalytics, options: PlateReportOptions): Promise<Workbook> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Ginger & Co Analytics'
  wb.created = options.generatedAt
  const subtitle = `${describePlateFilters(a)} · ${rangeText(a)} · by reservation date`
  const t = a.totals
  const c = a.comparison
  const g = a.guests

  const summary = wb.addWorksheet(PLATE_SHEETS[0])
  const daily = wb.addWorksheet(PLATE_SHEETS[1])
  const compare = wb.addWorksheet(PLATE_SHEETS[2])
  const locSheet = wb.addWorksheet(PLATE_SHEETS[3])
  const patterns = wb.addWorksheet(PLATE_SHEETS[4])
  const sources = wb.addWorksheet(PLATE_SHEETS[5])
  const quality = wb.addWorksheet(PLATE_SHEETS[6])

  // ── Daily Reservations ─────────────────────────────────────────────────
  const multi = a.locations.length > 1
  const locCols = multi ? a.locations : []
  const dailyCols = 7 + locCols.length + 1
  setWidths(daily, [16, 12, 13, 13, 12, 11, 11, ...locCols.map(() => 18), 30])
  let row = sheetHeader(daily, 'Plate daily reservations', subtitle, span(1, Math.max(dailyCols, 9)))
  row = note(daily, row, 'Blank cells = no imported Plate export for that day (never zero). A day inside an imported export without reservations is a real zero. Guests = party size of completed reservations.', span(1, Math.max(dailyCols, 9)))
  const dHeader = row + 1
  const dt = table(
    daily,
    dHeader,
    [
      { header: 'Date', kind: 'day' },
      { header: 'Guests', kind: 'int' },
      { header: 'Completed', kind: 'int' },
      { header: 'Reservations', kind: 'int' },
      { header: 'Cancelled', kind: 'int' },
      { header: 'Declined', kind: 'int' },
      { header: 'Avg party', kind: 'number' },
      ...locCols.map((l) => ({ header: `${l.label} guests`, kind: 'int' as const })),
      { header: 'Data status' },
    ],
    a.daily.map((d) => [d.date, d.covers, d.completed, d.bookings, d.cancelled, d.declined, d.completed ? (d.covers as number) / d.completed : null, ...locCols.map((l) => d.byLocation[l.id]), statusText[d.status]]),
    {
      filter: true,
      cellStyle: (col, v) => (col === 6 ? { numFmt: DEC1 } : col === 7 + locCols.length && v !== statusText.complete ? { color: v === statusText.missing ? PALETTE.negative : PALETTE.warning, bold: true } : undefined),
    },
  )
  const dailyRange = a.daily.length > 0 ? { firstRow: dt.firstRow, lastRow: dt.lastRow } : undefined
  let dRow = dt.nextRow
  if (a.daily.length > 0) {
    dRow = table(daily, dt.lastRow + 1, [{ header: 'Total (selection)' }, { header: '', kind: 'int' }, { header: '', kind: 'int' }, { header: '', kind: 'int' }, { header: '', kind: 'int' }, { header: '', kind: 'int' }, { header: '', kind: 'number' }], [], { totals: true }).nextRow
    const tr = daily.getRow(dt.lastRow + 1)
    ;[t.covers, t.completed, t.bookings, t.cancelled, t.declined].forEach((v, i) => {
      tr.getCell(2 + i).value = v
      tr.getCell(2 + i).numFmt = FMT.int
    })
    tr.getCell(7).value = t.avgPartySize ?? null
    tr.getCell(7).numFmt = DEC1
  }
  if (a.periods.length > 0 && a.filters.grain !== 'day') {
    dRow = section(daily, dRow, a.filters.grain === 'week' ? 'Weekly totals (Monday to Sunday)' : 'Monthly totals', span(1, 9))
    dRow = table(
      daily,
      dRow,
      [{ header: 'Period', kind: 'strong', span: 2 }, { header: 'Guests', kind: 'int' }, { header: 'Completed', kind: 'int' }, { header: 'Reservations', kind: 'int' }, { header: 'Cancelled', kind: 'int' }, { header: 'Declined', kind: 'int' }, { header: 'Change (guests)', kind: 'signedPct' }, { header: 'Note' }],
      a.periods.map((p) => [p.start === p.end ? p.start : `${p.start} to ${p.end}`, p.daysCovered > 0 ? p.metrics.covers : undefined, p.metrics.completed, p.metrics.bookings, p.metrics.cancelled, p.metrics.declined, p.change, p.partial ? `Partial (${p.daysCovered}/${p.calendarDays} days)` : '']),
      { cellStyle: (col, v) => (col === 6 && typeof v === 'number' && v !== 0 ? { color: v > 0 ? PALETTE.positive : PALETTE.negative } : undefined) },
    ).nextRow
  }
  if (dailyRange && a.daily.length >= 2) {
    addChart(wb, {
      sheet: PLATE_SHEETS[1],
      type: 'line',
      title: 'Daily guests and completed reservations',
      from: { col: 1, row: dRow },
      to: { col: 10, row: dRow + 20 },
      categories: { sheet: PLATE_SHEETS[1], col: 1, ...dailyRange, values: a.daily.map((d) => d.date), dates: true },
      series: [
        { name: 'Guests', range: { sheet: PLATE_SHEETS[1], col: 2, ...dailyRange }, values: a.daily.map((d) => d.covers), color: STRIP(BRAND) },
        { name: 'Completed reservations', range: { sheet: PLATE_SHEETS[1], col: 3, ...dailyRange }, values: a.daily.map((d) => d.completed), color: STRIP(SERIES[0]) },
      ],
      valueFormat: '#,##0',
    })
    dRow += 21
  }
  finishSheet(daily, { tab: TAB.analysis, lastCol: Math.max(dailyCols, 9), lastRow: dRow, freezeRow: dHeader, printTitleRow: dHeader })

  // ── Period Comparison ──────────────────────────────────────────────────
  setWidths(compare, [34, 20, 20, 14])
  row = sheetHeader(compare, 'Plate period comparison', subtitle, span(1, 4))
  if (!c) {
    row = note(compare, row, 'No comparison period was selected on the dashboard (Compare with: none), or there is no Plate data in the selected range.', span(1, 4), 'warning')
    finishSheet(compare, { tab: TAB.analysis, lastCol: 4, lastRow: row, orientation: 'portrait' })
  } else {
    row = note(compare, row, `Selected: ${prettyDate(c.current.start)} – ${prettyDate(c.current.end)} (${c.current.calendarDays} days, ${c.current.daysCovered} with data) · Comparison: ${prettyDate(c.baseline.start)} – ${prettyDate(c.baseline.end)} (${c.baseline.calendarDays} days, ${c.baseline.daysCovered} with data).`, span(1, 4))
    if (c.baselineIncomplete || c.currentIncomplete) row = note(compare, row, 'At least one period has days without imported Plate data — the changes are not like for like.', span(1, 4), 'warning')
    const cmp = comparisonTable(c)
    const cHeader = row + 1
    const ct = table(compare, cHeader, [{ header: 'Metric', kind: 'strong' }, { header: 'Selected period', kind: 'number' }, { header: 'Comparison period', kind: 'number' }, { header: 'Change', kind: 'signedPct' }], cmp.rows, {
      cellStyle: (col, v, _r, i) => {
        if (col === 1 || col === 2) return { numFmt: cmp.formats[i] }
        if (col === 3) {
          const good = typeof v === 'number' && v !== 0 ? (cmp.lower[i] ? v < 0 : v > 0) : undefined
          return { numFmt: cmp.changeFormats[i], color: good === undefined ? undefined : good ? PALETTE.positive : PALETTE.negative }
        }
        return undefined
      },
    })
    row = note(compare, ct.nextRow - 1, 'Change = (selected − comparison) ÷ comparison. Rates show the difference in percentage points. Green = better (more guests and reservations; fewer cancellations and declines).', span(1, 4)) + 1
    addChart(wb, {
      sheet: PLATE_SHEETS[2],
      type: 'column',
      title: 'Guests and completed reservations: selected vs comparison',
      from: { col: 1, row },
      to: { col: 5, row: row + 16 },
      categories: { sheet: PLATE_SHEETS[2], col: 1, firstRow: ct.firstRow, lastRow: ct.firstRow + 1, values: cmp.rows.slice(0, 2).map((r) => String(r[0])) },
      series: [
        { name: 'Selected period', range: { sheet: PLATE_SHEETS[2], col: 2, firstRow: ct.firstRow, lastRow: ct.firstRow + 1 }, values: cmp.rows.slice(0, 2).map((r) => r[1] as number), color: STRIP(BRAND) },
        { name: 'Comparison period', range: { sheet: PLATE_SHEETS[2], col: 3, firstRow: ct.firstRow, lastRow: ct.firstRow + 1 }, values: cmp.rows.slice(0, 2).map((r) => r[2] as number), color: STRIP(SERIES[0]) },
      ],
      valueFormat: '#,##0',
      dataLabels: true,
    })
    row += 17
    finishSheet(compare, { tab: TAB.analysis, lastCol: 4, lastRow: row, freezeRow: cHeader, orientation: 'portrait' })
  }

  // ── Locations ──────────────────────────────────────────────────────────
  setWidths(locSheet, [32, 16, 10, 9, 11, 13, 11, 11, 11, 12, 11, 11, 16, 12])
  row = sheetHeader(locSheet, 'Plate locations', subtitle, span(1, 14))
  const lHeader = row
  const lt = table(
    locSheet,
    lHeader,
    [
      { header: 'Location', kind: 'strong' },
      { header: 'Status' },
      { header: 'Guests', kind: 'int' },
      { header: 'Share', kind: 'pct' },
      { header: 'Completed', kind: 'int' },
      { header: 'Reservations', kind: 'int' },
      { header: 'Avg party', kind: 'number' },
      { header: 'Cancelled', kind: 'int' },
      { header: 'Declined', kind: 'int' },
      { header: 'Unique guests', kind: 'int' },
      { header: 'Days with data', kind: 'int' },
      { header: 'Missing days', kind: 'int' },
      { header: 'Busiest day', kind: 'day' },
      { header: 'Guests that day', kind: 'int' },
    ],
    a.locationRows.map((r) => {
      const has = r.daysCovered > 0
      return [r.info.label, !has ? 'No data imported' : r.missingDays > 0 ? 'Partial data' : 'Complete', has ? r.metrics.covers : undefined, r.share, r.metrics.completed, r.metrics.bookings, r.metrics.avgPartySize, r.metrics.cancelled, r.metrics.declined, r.metrics.uniqueGuests, r.daysCovered, r.missingDays, r.busiest?.date, r.busiest?.covers]
    }),
    { filter: true, cellStyle: (col, v) => (col === 1 && v !== 'Complete' ? { color: PALETTE.warning, bold: true } : col === 6 ? { numFmt: DEC1 } : undefined) },
  )
  let lRow = lt.nextRow
  lRow = note(locSheet, lRow - 1, 'Hamra is one combined reservation location for Ginger & Co and Pertutti (one Plate account). Locations come from the export file name, confirmed on import.', span(1, 14)) + 1
  if (a.locationRows.filter((r) => r.daysCovered > 0).length >= 2) {
    const r = { firstRow: lt.firstRow, lastRow: lt.lastRow }
    const h = Math.max(10, a.locationRows.length * 3 + 4)
    addChart(wb, {
      sheet: PLATE_SHEETS[3],
      type: 'bar',
      title: 'Guests by location',
      from: { col: 1, row: lRow },
      to: { col: 8, row: lRow + h },
      categories: { sheet: PLATE_SHEETS[3], col: 1, ...r, values: a.locationRows.map((x) => x.info.label) },
      series: [{ name: 'Guests', range: { sheet: PLATE_SHEETS[3], col: 3, ...r }, values: a.locationRows.map((x) => x.metrics.covers) }],
      valueFormat: '#,##0',
      dataLabels: true,
    })
    lRow += h + 1
  }
  finishSheet(locSheet, { tab: TAB.analysis, lastCol: 14, lastRow: lRow, freezeRow: lHeader, printTitleRow: lHeader })

  // ── Booking Patterns ───────────────────────────────────────────────────
  setWidths(patterns, [30, 14, 14, 14, 14, 16])
  row = sheetHeader(patterns, 'Plate booking patterns', subtitle, span(1, 6))
  row = section(patterns, row, 'Busiest days of the week (completed reservations)', span(1, 6))
  const wt = table(
    patterns,
    row,
    [{ header: 'Weekday', kind: 'strong' }, { header: 'Guests', kind: 'int' }, { header: 'Share of guests', kind: 'pct' }, { header: 'Completed', kind: 'int' }, { header: 'Days with data', kind: 'int' }, { header: 'Avg guests / day', kind: 'number' }],
    a.weekdays.map((w) => [w.label, w.covers, w.share, w.completed, w.days, w.avgCovers]),
    { cellStyle: (col) => (col === 5 ? { numFmt: DEC1 } : undefined) },
  )
  row = wt.nextRow
  const chartAt = (title: string, firstRow: number, lastRow: number, labels: string[], values: number[], color: string) => {
    if (labels.length < 2) return
    addChart(wb, {
      sheet: PLATE_SHEETS[4],
      type: 'column',
      title,
      from: { col: 1, row },
      to: { col: 7, row: row + 15 },
      categories: { sheet: PLATE_SHEETS[4], col: 1, firstRow, lastRow, values: labels },
      series: [{ name: 'Guests', range: { sheet: PLATE_SHEETS[4], col: 2, firstRow, lastRow }, values, color }],
      valueFormat: '#,##0',
      dataLabels: true,
    })
    row += 16
  }
  if (a.hasData) chartAt('Guests by day of the week', wt.firstRow, wt.lastRow, a.weekdays.map((w) => w.label), a.weekdays.map((w) => w.covers), STRIP(BRAND))
  row = section(patterns, row, 'Busiest reservation times (booked time slot, completed reservations)', span(1, 6))
  const tt = table(patterns, row, [{ header: 'Time slot', kind: 'strong' }, { header: 'Guests', kind: 'int' }, { header: 'Completed', kind: 'int' }, { header: 'Share of completed', kind: 'pct' }], a.timeSlots.map((r) => [r.label, r.covers, r.completed, r.share]))
  row = tt.nextRow
  if (a.timeSlots.length > 0) chartAt('Guests by reservation time', tt.firstRow, tt.lastRow, a.timeSlots.map((r) => r.label), a.timeSlots.map((r) => r.covers), STRIP(SERIES[0]))
  row = section(patterns, row, 'Party sizes (completed reservations)', span(1, 6))
  row = table(patterns, row, [{ header: 'Party size', kind: 'strong' }, { header: 'Reservations', kind: 'int' }, { header: 'Share', kind: 'pct' }, { header: 'Guests', kind: 'int' }], a.partySizes.map((r) => [r.label, r.completed, r.share, r.covers])).nextRow
  row = section(patterns, row, 'Booking lead time (reservation date − booked date, all statuses)', span(1, 6))
  row = table(patterns, row, [{ header: 'Booked', kind: 'strong' }, { header: 'Reservations', kind: 'int' }, { header: 'Share', kind: 'pct' }, { header: 'Completed', kind: 'int' }, { header: 'Guests', kind: 'int' }], a.leadTime.rows.map((r) => [r.label, r.bookings, r.share, r.completed, r.covers])).nextRow
  row = note(patterns, row - 1, `Average lead time ${a.leadTime.average === undefined ? '—' : a.leadTime.average.toFixed(1)} day(s), median ${a.leadTime.median === undefined ? '—' : a.leadTime.median.toFixed(1)} day(s), from ${a.leadTime.known} reservation(s) with a “Booked At” time.`, span(1, 6)) + 1
  finishSheet(patterns, { tab: TAB.analysis, lastCol: 6, lastRow: row, orientation: 'portrait' })

  // ── Sources & Guests ───────────────────────────────────────────────────
  setWidths(sources, [34, 14, 12, 14, 12, 14])
  row = sheetHeader(sources, 'Plate sources & guests', subtitle, span(1, 6))
  const mixTable = (title: string, rows: PlateCountRow[]) => {
    row = section(sources, row, title, span(1, 6))
    row = table(sources, row, [{ header: 'Value', kind: 'strong' }, { header: 'Reservations', kind: 'int' }, { header: 'Share', kind: 'pct' }, { header: 'Completed', kind: 'int' }, { header: 'Guests', kind: 'int' }], rows.map((r) => [r.label, r.bookings, r.share, r.completed, r.covers])).nextRow
  }
  row = section(sources, row, 'Reservation status (every status in the imported files)', span(1, 6))
  row = table(sources, row, [{ header: 'Status', kind: 'strong' }, { header: 'Reservations', kind: 'int' }, { header: 'Share', kind: 'pct' }, { header: 'Guests', kind: 'int' }, { header: 'Meaning', span: 2 }], a.mix.status.map((r) => [r.label, r.bookings, r.share, r.covers, r.outcome])).nextRow
  row = note(sources, row - 1, `${PLATE_RULES.notInExport}.`, span(1, 6)) + 1
  mixTable('Booking source', a.mix.source)
  mixTable('Section', a.mix.section)
  mixTable('Booking type', a.mix.bookingType)
  mixTable('Occasion', a.mix.occasion)
  row = section(sources, row, 'Guests (identified by phone number, stored only as a one-way code)', span(1, 6))
  row = table(sources, row, [{ header: 'Measure', kind: 'strong', span: 4 }, { header: 'Guests', kind: 'int' }, { header: 'Share', kind: 'pct' }], [
    ['Unique guests with a completed reservation', g.guests, undefined],
    ['Repeat guests (2+ completed reservations, all imported months)', g.repeat, g.repeatShare],
    ['Guests with 2+ visits within the selected period', g.repeatInRange, g.guests > 0 ? g.repeatInRange / g.guests : undefined],
    [`Returning guests (visited before the period)${g.noHistoryBefore ? ' — no earlier data imported' : ''}`, g.returning, g.guests > 0 ? g.returning / g.guests : undefined],
    ['First visit in the imported data', g.firstTime, g.guests > 0 ? g.firstTime / g.guests : undefined],
    ...(g.multiLocation !== undefined ? [['Guests who visited 2+ locations', g.multiLocation, g.guests > 0 ? g.multiLocation / g.guests : undefined] as CellValue[]] : []),
    ['Completed reservations without phone or email (not counted)', g.unidentified, undefined],
  ]).nextRow
  if (g.top.length > 0) {
    row = section(sources, row, 'Most frequent guests (anonymised codes — no personal data)', span(1, 6))
    row = table(sources, row, [{ header: 'Guest code', kind: 'center' }, { header: 'Visits (all months)', kind: 'int' }, { header: 'Visits in period', kind: 'int' }, { header: 'Guests in period', kind: 'int' }, { header: 'Locations', kind: 'int' }, { header: 'Last visit', kind: 'day' }], g.top.map((r) => [r.label, r.visitsAllTime, r.visitsInRange, r.coversInRange, r.locations, r.lastVisit])).nextRow
  }
  row = section(sources, row, 'Booking details (counts only — content is not stored)', span(1, 6))
  row = table(sources, row, [{ header: 'Detail', kind: 'strong', span: 4 }, { header: 'Reservations', kind: 'int' }], [
    ['With dietary notes', a.extras.dietaryNotes],
    ['With special requests', a.extras.specialRequests],
    ['Modified after booking', a.extras.modified],
  ]).nextRow
  finishSheet(sources, { tab: TAB.customers, lastCol: 6, lastRow: row, orientation: 'portrait' })

  // ── Data Quality ───────────────────────────────────────────────────────
  setWidths(quality, [18, 30, 22, 13, 13, 13, 13, 13, 13, 12, 12])
  row = sheetHeader(quality, 'Plate data quality', subtitle, span(1, 11))
  row = section(quality, row, 'Calculation rules', span(1, 11))
  row = table(quality, row, [{ header: 'Rule', span: 2, kind: 'strong' }, { header: 'Definition', span: 9, kind: 'wrap' }], [
    ['Reporting date', PLATE_RULES.date],
    ['Completed', PLATE_RULES.completed],
    ['Guests (covers)', PLATE_RULES.covers],
    ['Cancelled', PLATE_RULES.cancelled],
    ['Declined', PLATE_RULES.declined],
    ['Repeat guests', PLATE_RULES.repeat],
    ['Lead time', PLATE_RULES.lead],
    ['Walk-ins / no-shows', PLATE_RULES.notInExport],
    ['Privacy', PLATE_RULES.privacy],
    ['Duplicates', 'One record per Plate Booking ID: overlapping or repeated files never add a booking twice.'],
    ['Separate module', 'Reservations are never combined with Weevi, Toters or Foody sales.'],
  ]).nextRow
  row = section(quality, row, 'Validation: stored bookings vs each file’s own totals', span(1, 11))
  row = table(
    quality,
    row,
    [
      { header: 'Source file', kind: 'wrap', span: 2 },
      { header: 'Result', kind: 'center' },
      { header: 'Bookings (file)', kind: 'int' },
      { header: 'Bookings (stored)', kind: 'int' },
      { header: 'Completed (file)', kind: 'int' },
      { header: 'Completed (stored)', kind: 'int' },
      { header: 'Guests (file)', kind: 'int' },
      { header: 'Guests (stored)', kind: 'int' },
      { header: 'Cancelled (file / stored)', kind: 'center' },
    ],
    a.reconciliation.map((r) => [r.fileName, r.matches ? 'MATCHES' : 'DIFFERS', r.control.bookings, r.stored.bookings, r.control.completed, r.stored.completed, r.control.covers, r.stored.covers, `${r.control.cancelled} / ${r.stored.cancelled}`]),
    { cellStyle: (col, v) => (col === 1 ? (v === 'MATCHES' ? { color: PALETTE.positive, bold: true } : { color: PALETTE.warning, bold: true }) : undefined) },
  ).nextRow
  row = section(quality, row, 'Checks for this selection', span(1, 11))
  row = table(quality, row, [{ header: 'Level', kind: 'center' }, { header: 'Detail', span: 10, kind: 'wrap' }], a.quality.map((q) => [q.level.toUpperCase(), q.message]), {
    banded: false,
    cellStyle: (col, v) => (col === 0 ? levelStyle(String(v)) : undefined),
  }).nextRow
  row = section(quality, row, 'Import history (locations in this selection)', span(1, 11))
  row = table(
    quality,
    row,
    [
      { header: 'Imported', kind: 'center' },
      { header: 'Source file', kind: 'wrap' },
      { header: 'Location' },
      { header: 'Period covered', span: 2 },
      { header: 'Status / overlaps', span: 2 },
      { header: 'Valid rows', kind: 'int' },
      { header: 'Not imported', kind: 'int' },
      { header: 'Added', kind: 'int' },
      { header: 'Replaced', kind: 'int' },
    ],
    a.allImports.map((i) => [
      new Date(i.importedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      i.fileName,
      plateLocationLabel(i.locationId),
      `${i.periodStart} to ${i.periodEnd}`,
      i.included === false ? 'EXCLUDED from analysis' : { new: 'New bookings only', replace: 'Replaced changed bookings', keep: 'Kept stored values' }[i.resolution],
      i.validRows,
      i.invalidRows.length,
      i.bookingsAdded,
      i.bookingsReplaced,
    ]),
    { cellStyle: (col, v) => (col === 4 && String(v).startsWith('EXCLUDED') ? { color: PALETTE.warning, bold: true } : undefined) },
  ).nextRow
  const invalid = a.imports.flatMap((i) => i.invalidRows.map((r) => [i.fileName, r.row, r.date ?? '', r.reason]))
  if (invalid.length > 0) {
    row = section(quality, row, 'Rows not imported', span(1, 11))
    row = table(quality, row, [{ header: 'Source file', span: 2, kind: 'wrap' }, { header: 'Row', kind: 'int' }, { header: 'Date', kind: 'center' }, { header: 'Reason', span: 7, kind: 'wrap' }], invalid).nextRow
  }
  finishSheet(quality, { tab: TAB.quality, lastCol: 11, lastRow: row })

  // ── Executive Summary ──────────────────────────────────────────────────
  setWidths(summary, [2.5, 17, 17, 17, 17, 17, 17, 2.5])
  const body = span(2, 7)
  row = sheetHeader(summary, options.title, `${subtitle} · Generated ${options.generatedAt.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, span(1, 8))
  row = section(summary, row, 'Key metrics (Plate reservations only)', body)
  const cards = [span(2, 3), span(4, 5), span(6, 7)]
  const changeSub = (key: keyof PlateComparison['change'], fallback: string, lowerIsBetter = false): Pick<KpiCard, 'sub' | 'subTone'> => {
    const v = c && !c.baselineIncomplete ? c.change[key] : undefined
    if (v === undefined) return { sub: fallback }
    const good = lowerIsBetter ? v < 0 : v > 0
    return { sub: `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}% vs comparison period`, subTone: v === 0 ? 'muted' : good ? 'positive' : 'negative' }
  }
  const has = (v: number | undefined) => (a.hasData ? v : undefined)
  row = kpiCards(
    summary,
    row,
    [
      { label: 'Guests (covers)', value: has(t.covers), format: FMT.int, ...changeSub('covers', rangeText(a)) },
      { label: 'Completed reservations', value: has(t.completed), format: FMT.int, ...changeSub('completed', 'Status “Completed”') },
      { label: 'Total reservations', value: has(t.bookings), format: FMT.int, ...changeSub('bookings', 'All statuses') },
    ],
    cards,
  )
  row = kpiCards(
    summary,
    row,
    [
      { label: 'Average party size', value: has(t.avgPartySize), format: DEC1, ...changeSub('avgPartySize', 'Guests per completed reservation') },
      { label: `Cancelled: ${t.cancelled} reservation(s)`, value: has(t.cancellationRate), format: FMT.pct, sub: `${t.cancelledGuests} guest(s) · cancelled by the guest` },
      { label: `Declined: ${t.declined} reservation(s)`, value: has(t.declineRate), format: FMT.pct, sub: `${t.declinedGuests} guest(s) · declined by the restaurant` },
    ],
    cards,
  )
  row = kpiCards(
    summary,
    row,
    [
      { label: 'Unique guests', value: has(g.guests), format: FMT.int, ...changeSub('uniqueGuests', 'Identified by phone number') },
      { label: 'Repeat guests', value: has(g.repeat), format: FMT.int, sub: g.repeatShare !== undefined ? `${(g.repeatShare * 100).toFixed(1)}% of guests · 2+ visits, all months` : '' },
      { label: 'Days with imported data', value: a.range ? t.daysCovered : undefined, format: FMT.int, sub: a.range ? `of ${t.calendarDays} calendar day(s)` : '' },
    ],
    cards,
  )
  row = note(summary, row, `${PLATE_RULES.date}. ${PLATE_RULES.covers}. ${PLATE_RULES.declined}.`, body)
  row = note(summary, row, `${PLATE_RULES.notInExport}.`, body)
  row = note(summary, row, `Comparison: ${compareText(c)}${c?.baselineIncomplete ? ' — the comparison period has days without imported data, so changes are not shown on the cards.' : '.'}`, body) + 1

  if (a.locationRows.length > 0) {
    row = section(summary, row, 'Guests by location', body)
    row = table(
      summary,
      row,
      [{ header: 'Location', span: 2, kind: 'strong' }, { header: 'Guests', kind: 'int' }, { header: 'Share', kind: 'pct' }, { header: 'Completed', kind: 'int' }, { header: 'Reservations', kind: 'int' }],
      a.locationRows.map((r) => [r.info.label, r.daysCovered > 0 ? r.metrics.covers : 'No data imported', r.share, r.metrics.completed, r.metrics.bookings]),
      { startCol: 2, cellStyle: (col, v) => (col === 1 && typeof v === 'string' ? { color: PALETTE.muted } : undefined) },
    ).nextRow
  }
  if (a.hasData) {
    const topDay = [...a.weekdays].sort((x, y) => y.covers - x.covers)[0]
    const topSlot = [...a.timeSlots].sort((x, y) => y.covers - x.covers)[0]
    const topSource = a.mix.source[0]
    row = section(summary, row, 'Highlights', body)
    row = table(summary, row, [{ header: 'Measure', span: 3, kind: 'strong' }, { header: 'Value', span: 3, kind: 'wrap' }], [
      ['Busiest date', a.busiestDay ? `${prettyDate(a.busiestDay.date)} · ${a.busiestDay.covers} guests` : '—'],
      ['Busiest day of the week', topDay && topDay.covers > 0 ? `${topDay.label} · ${topDay.covers} guests` : '—'],
      ['Busiest reservation time', topSlot ? `${topSlot.label} · ${topSlot.covers} guests` : '—'],
      ['Main booking source', topSource ? `${topSource.label} · ${topSource.bookings} reservation(s)` : '—'],
      ['Median booking lead time', a.leadTime.median === undefined ? '—' : `${a.leadTime.median.toFixed(1)} day(s)`],
    ], { startCol: 2 }).nextRow
  }
  if (dailyRange && a.daily.length >= 2) {
    row = section(summary, row, 'Daily guests', body)
    addChart(wb, {
      sheet: PLATE_SHEETS[0],
      type: 'line',
      title: 'Daily guests (completed reservations)',
      from: { col: 2, row },
      to: { col: 8, row: row + 16 },
      categories: { sheet: PLATE_SHEETS[1], col: 1, ...dailyRange, values: a.daily.map((d) => d.date), dates: true },
      series: [{ name: 'Guests', range: { sheet: PLATE_SHEETS[1], col: 2, ...dailyRange }, values: a.daily.map((d) => d.covers), color: STRIP(BRAND) }],
      valueFormat: '#,##0',
    })
    row += 17
  }
  const warnings = a.quality.filter((q) => q.level !== 'info')
  if (warnings.length > 0) {
    row = section(summary, row, 'Important warnings', body)
    row = table(summary, row, [{ header: 'Level', kind: 'center' }, { header: 'Warning', span: 5, kind: 'wrap' }], warnings.map((w) => [w.level.toUpperCase(), w.message]), {
      startCol: 2,
      banded: false,
      cellStyle: (col, v) => (col === 0 ? levelStyle(String(v)) : undefined),
    }).nextRow
  }
  row = section(summary, row, 'Reporting scope', body)
  row = table(summary, row, [{ header: 'Item', span: 2, kind: 'strong' }, { header: 'Value', span: 4, kind: 'wrap' }], [
    ['Filters', describePlateFilters(a)],
    ['Date range', a.range ? `${prettyDate(a.range.start)} – ${prettyDate(a.range.end)}` : rangeText(a)],
    ['Imports in analysis', `${a.imports.length} Plate export(s)`],
    ['Privacy', 'No guest names, phone numbers or emails are included in this report.'],
  ], { startCol: 2 }).nextRow
  finishSheet(summary, { tab: TAB.summary, lastCol: 8, lastRow: row, orientation: 'portrait' })

  return wb
}
