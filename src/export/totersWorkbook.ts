import type { Workbook } from 'exceljs'
import { SERIES } from '@/components/charts/chartTheme'
import { BRANDS } from '@/config/brands'
import { TOTERS_CONVERSION } from '@/config/toters'
import type { TotersAnalytics } from '@/toters/analytics'
import { addChart } from './charts'
import { FMT, PALETTE, TAB, finishSheet, kpiCards, moneyFormat, moneyFormatWhole, note, prettyDate, section, setWidths, sheetHeader, table, type CellStyle, type CellValue, type Span } from './theme'

/**
 * Toters Excel report — a separate workbook from the Weevi analytical report. It uses the same
 * theme and native charts, and only presents figures already computed by the Toters analytics
 * for the selected filters. Toters revenue is never combined with Weevi revenue.
 */

export interface TotersReportOptions {
  title: string
  generatedAt: Date
}

const span = (from: number, to: number): Span => ({ from, to })
const USD = moneyFormat('USD')
/** LBP amounts run to billions: whole units keep them readable (full precision stays in the cell). */
const LBP = moneyFormatWhole('LBP')
const STRIP = (hex: string) => hex.replace('#', '').toUpperCase()

const levelStyle = (level: string): CellStyle =>
  level === 'ERROR'
    ? { fill: PALETTE.negativeSoft, color: PALETTE.negative, bold: true }
    : level === 'WARNING'
      ? { fill: PALETTE.warningSoft, color: PALETTE.warning, bold: true }
      : { fill: PALETTE.infoSoft, color: PALETTE.info, bold: true }

export function describeTotersFilters(a: TotersAnalytics): string {
  const brand = a.filters.brandId === 'all' ? 'All brands' : BRANDS[a.filters.brandId].name
  const branch = a.filters.branch === 'all' ? 'All available branches' : (a.branches[0]?.label ?? a.filters.branch)
  const grain = { day: 'Daily', week: 'Weekly', month: 'Monthly' }[a.filters.grain]
  return `${brand} · ${branch} · ${grain} view`
}

const rangeText = (a: TotersAnalytics) => (a.range ? `${a.range.start} to ${a.range.end}` : 'No Toters data in this selection')
const statusText = { complete: 'Complete', partial: 'Partial — some branches missing', missing: 'No data imported' } as const

export const TOTERS_SHEETS = ['Toters Executive Summary', 'Toters Daily Sales', 'Toters Branch Performance', 'Toters Brand Comparison', 'Toters Data Quality'] as const

export async function buildTotersWorkbook(a: TotersAnalytics, options: TotersReportOptions): Promise<Workbook> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Ginger & Co Analytics'
  wb.created = options.generatedAt
  const subtitle = `${describeTotersFilters(a)} · ${rangeText(a)} · Revenue in USD`
  const conversionNote = `Currency conversion: ${TOTERS_CONVERSION.description}. Original Toters amounts are kept for auditing; figures are rounded only for display.`

  // Sheet layout is decided up front so charts on the summary can reference the data sheets.
  const summary = wb.addWorksheet(TOTERS_SHEETS[0])
  const daily = wb.addWorksheet(TOTERS_SHEETS[1])
  const branches = wb.addWorksheet(TOTERS_SHEETS[2])
  const brands = wb.addWorksheet(TOTERS_SHEETS[3])
  const quality = wb.addWorksheet(TOTERS_SHEETS[4])

  // ── Daily Sales ─────────────────────────────────────────────────────────
  const nB = a.branches.length
  const dailyCols = 2 + nB + 2
  setWidths(daily, [16, 16, ...a.branches.map(() => 18), 30, 40])
  let row = sheetHeader(daily, 'Toters daily sales', subtitle, span(1, Math.max(dailyCols, 8)))
  row = note(daily, row, 'Blank branch cells = no imported data for that day (never zero). A day marked partial is missing at least one selected branch.', span(1, Math.max(dailyCols, 8)))
  const dHeader = row + 1
  const dt = table(
    daily,
    dHeader,
    [{ header: 'Date', kind: 'day' }, { header: 'Total revenue (USD)', kind: 'money' }, ...a.branches.map((b) => ({ header: `${b.label} (USD)`, kind: 'money' as const })), { header: 'Data status' }, { header: 'Branches without data', kind: 'wrap' }],
    a.daily.map((d) => [d.date, d.totalUsd, ...a.branches.map((b) => d.byBranch[b.key]), statusText[d.status], [...d.missingBranches.map((x) => `${x} (missing)`), ...d.invalidBranches.map((x) => `${x} (invalid)`)].join(', ')]),
    {
      filter: true,
      currencyOf: () => 'USD',
      cellStyle: (col, v) => (col === nB + 2 && v !== statusText.complete ? { color: v === statusText.missing ? PALETTE.negative : PALETTE.warning, bold: true } : undefined),
    },
  )
  const dailyRange = a.daily.length > 0 ? { firstRow: dt.firstRow, lastRow: dt.lastRow } : undefined
  let dRow = dt.nextRow
  if (a.periods.length > 0 && a.filters.grain !== 'day') {
    dRow = section(daily, dRow, a.filters.grain === 'week' ? 'Weekly totals (Monday to Sunday)' : 'Monthly totals', span(1, 8))
    dRow = table(
      daily,
      dRow,
      [{ header: 'Period', kind: 'strong', span: 2 }, { header: 'Revenue (USD)', kind: 'money' }, { header: 'Change', kind: 'signedPct' }, { header: 'Days with data', kind: 'int' }, { header: 'Calendar days', kind: 'int' }, { header: 'Note' }],
      a.periods.map((p) => [p.start === p.end ? p.start : `${p.start} to ${p.end}`, p.revenueUsd, p.change, p.daysWithData, p.calendarDays, p.partial ? 'Partial period' : '']),
      { currencyOf: () => 'USD', cellStyle: (col, v) => (col === 2 && typeof v === 'number' && v !== 0 ? { color: v > 0 ? PALETTE.positive : PALETTE.negative } : col === 5 && v ? { color: PALETTE.warning } : undefined) },
    ).nextRow
  }
  if (dailyRange && a.daily.length >= 2 && nB > 0) {
    addChart(wb, {
      sheet: TOTERS_SHEETS[1],
      type: 'line',
      title: 'Daily Toters revenue by branch (USD)',
      from: { col: 1, row: dRow },
      to: { col: Math.max(dailyCols, 8) + 1, row: dRow + 20 },
      categories: { sheet: TOTERS_SHEETS[1], col: 1, ...dailyRange, values: a.daily.map((d) => d.date), dates: true },
      series: a.branches.map((b, i) => ({ name: b.label, range: { sheet: TOTERS_SHEETS[1], col: 3 + i, ...dailyRange }, values: a.daily.map((d) => d.byBranch[b.key]), color: STRIP(SERIES[b.index % SERIES.length]) })),
      valueFormat: '#,##0',
    })
    dRow += 21
  }
  finishSheet(daily, { tab: TAB.analysis, lastCol: Math.max(dailyCols, 8), lastRow: dRow, freezeRow: dHeader, printTitleRow: dHeader })

  // ── Branch Performance ─────────────────────────────────────────────────
  setWidths(branches, [26, 10, 15, 16, 21, 16, 9, 10, 9, 9, 9, 16, 16, 15])
  row = sheetHeader(branches, 'Toters branch performance', subtitle, span(1, 14))
  const bHeader = row
  const bt = table(
    branches,
    bHeader,
    [
      { header: 'Branch', kind: 'strong' },
      { header: 'Store ID', kind: 'center' },
      { header: 'Status' },
      { header: 'Toters CSV total', kind: 'number' },
      { header: 'Revenue (LBP)', kind: 'money' },
      { header: 'Revenue (USD)', kind: 'money' },
      { header: 'Share', kind: 'pct' },
      { header: 'Days with data', kind: 'int' },
      { header: 'Zero days', kind: 'int' },
      { header: 'Missing days', kind: 'int' },
      { header: 'Invalid days', kind: 'int' },
      { header: 'Avg per day (USD)', kind: 'money' },
      { header: 'Best day', kind: 'day' },
      { header: 'Best day (USD)', kind: 'money' },
    ],
    a.branchRows.map((r) => [
      r.info.label,
      r.info.storeId,
      r.daysWithData === 0 ? 'No data imported' : r.missingDays + r.invalidDays > 0 ? 'Partial data' : 'Complete',
      r.daysWithData > 0 ? r.csvTotal : undefined,
      r.daysWithData > 0 ? r.revenueLbp : undefined,
      r.daysWithData > 0 ? r.revenueUsd : undefined,
      r.share,
      r.daysWithData,
      r.zeroDays,
      r.missingDays,
      r.invalidDays,
      r.averageDailyUsd,
      r.best?.date,
      r.best?.revenueUsd,
    ]),
    {
      filter: true,
      currencyOf: () => 'USD',
      cellStyle: (col, v) => (col === 4 && typeof v === 'number' ? { numFmt: LBP } : col === 2 && v !== 'Complete' ? { color: PALETTE.warning, bold: true } : undefined),
    },
  )
  let bRow = bt.nextRow
  if (a.branchRows.length > 0) {
    bRow = table(branches, bt.lastRow + 1, [{ header: 'Total (selected branches)', span: 3 }, { header: '', kind: 'number' }, { header: '', kind: 'money' }, { header: '', kind: 'money' }, { header: '', kind: 'pct' }, { header: '', kind: 'int' }], [], { totals: true }).nextRow
    const t = branches.getRow(bt.lastRow + 1)
    t.getCell(4).value = a.totals.csvTotal
    t.getCell(4).numFmt = FMT.number
    t.getCell(5).value = a.totals.revenueLbp
    t.getCell(5).numFmt = LBP
    t.getCell(6).value = a.totals.revenueUsd
    t.getCell(6).numFmt = USD
    t.getCell(7).value = a.hasData ? 1 : null
    t.getCell(7).numFmt = FMT.pct
    t.getCell(8).value = a.totals.branchDaysWithData
    t.getCell(8).numFmt = FMT.int
  }
  if (a.unavailable.length > 0) {
    bRow = section(branches, bRow, 'Branches without a Toters channel', span(1, 14))
    bRow = table(branches, bRow, [{ header: 'Branch', kind: 'strong', span: 2 }, { header: 'Status', span: 2 }, { header: 'Reason', span: 4 }], a.unavailable.map((u) => [u.label, 'Not available', u.reason]), {
      cellStyle: (col) => (col === 1 ? { color: PALETTE.muted, bold: true } : undefined),
    }).nextRow
    bRow = note(branches, bRow - 1, 'Not available branches are not imported branches with zero sales: they are excluded from Toters totals, shares and availability.', span(1, 14)) + 1
  }
  const withData = a.branchRows.filter((r) => r.daysWithData > 0)
  if (withData.length >= 2) {
    const r = { firstRow: bt.firstRow, lastRow: bt.lastRow }
    addChart(wb, {
      sheet: TOTERS_SHEETS[2],
      type: 'bar',
      title: 'Toters revenue by branch (USD)',
      from: { col: 1, row: bRow },
      to: { col: 9, row: bRow + Math.max(10, a.branchRows.length * 3 + 4) },
      categories: { sheet: TOTERS_SHEETS[2], col: 1, ...r, values: a.branchRows.map((x) => x.info.label) },
      series: [{ name: 'Revenue (USD)', range: { sheet: TOTERS_SHEETS[2], col: 6, ...r }, values: a.branchRows.map((x) => x.revenueUsd) }],
      valueFormat: '#,##0',
      dataLabels: true,
    })
    bRow += Math.max(10, a.branchRows.length * 3 + 4) + 1
  }
  finishSheet(branches, { tab: TAB.analysis, lastCol: 14, lastRow: bRow, freezeRow: bHeader, printTitleRow: bHeader })

  // ── Brand Comparison ───────────────────────────────────────────────────
  setWidths(brands, [22, 18, 10, 21, 18, 16, 18])
  row = sheetHeader(brands, 'Toters brand comparison', subtitle, span(1, 7))
  const brHeader = row
  const brt = table(
    brands,
    brHeader,
    [{ header: 'Brand', kind: 'strong' }, { header: 'Revenue (USD)', kind: 'money' }, { header: 'Share', kind: 'pct' }, { header: 'Revenue (LBP)', kind: 'money' }, { header: 'Toters CSV total', kind: 'number' }, { header: 'Toters branches', kind: 'int' }, { header: 'Branches with data', kind: 'int' }],
    a.brandRows.map((b) => [b.name, b.revenueUsd, b.share, b.revenueLbp, b.csvTotal, b.branches, b.branchesWithData]),
    { currencyOf: () => 'USD', cellStyle: (col, v) => (col === 3 && typeof v === 'number' ? { numFmt: LBP } : undefined) },
  )
  let brRow = note(brands, brt.nextRow - 1, 'Brand revenue is the sum of its Toters branch rows. Toters combined-total rows (store_id 0) are used only for reconciliation and are never added.', span(1, 7)) + 1
  if (a.brandRows.length >= 2 && a.hasData) {
    const r = { firstRow: brt.firstRow, lastRow: brt.lastRow }
    addChart(wb, {
      sheet: TOTERS_SHEETS[3],
      type: 'bar',
      title: 'Toters revenue by brand (USD)',
      from: { col: 1, row: brRow },
      to: { col: 8, row: brRow + 10 },
      categories: { sheet: TOTERS_SHEETS[3], col: 1, ...r, values: a.brandRows.map((x) => x.name) },
      series: [{ name: 'Revenue (USD)', range: { sheet: TOTERS_SHEETS[3], col: 2, ...r }, values: a.brandRows.map((x) => x.revenueUsd) }],
      valueFormat: '#,##0',
      dataLabels: true,
    })
    brRow += 11
  }
  finishSheet(brands, { tab: TAB.analysis, lastCol: 7, lastRow: brRow, freezeRow: brHeader, printTitleRow: brHeader })

  // ── Data Quality ───────────────────────────────────────────────────────
  setWidths(quality, [18, 26, 26, 10, 11, 24, 18, 9, 9, 9, 9, 9, 12, 30])
  row = sheetHeader(quality, 'Toters data quality', subtitle, span(1, 14))
  row = section(quality, row, 'Currency conversion', span(1, 14))
  row = table(quality, row, [{ header: 'Rule', span: 3, kind: 'strong' }, { header: 'Value', span: 6 }], [
    ['Revenue LBP', `Toters CSV total × ${TOTERS_CONVERSION.lbpMultiplier.toLocaleString('en-US')}`],
    ['Revenue USD', `Revenue LBP ÷ ${TOTERS_CONVERSION.lbpPerUsd.toLocaleString('en-US')} (fixed rate)`],
    ['Formula', TOTERS_CONVERSION.formula],
    ['Applies to', 'Every Toters amount (Ginger & Co and Pertutti). Never applied to Weevi.'],
    ['Precision', 'Calculated at full precision from the original CSV value; rounded only for display.'],
  ]).nextRow
  row = section(quality, row, 'Checks for this selection', span(1, 14))
  row = table(quality, row, [{ header: 'Level', kind: 'center' }, { header: 'Detail', span: 13, kind: 'wrap' }], a.quality.map((q) => [q.level.toUpperCase(), q.message]), {
    banded: false,
    cellStyle: (col, v) => (col === 0 ? levelStyle(String(v)) : undefined),
  }).nextRow
  row = section(quality, row, 'Import history (branches in this selection)', span(1, 14))
  const imp: CellValue[][] = a.allImports.map((i) => [
    new Date(i.importedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    i.fileName,
    `${BRANDS[i.brandId].name} — ${i.branch}`,
    i.storeId,
    i.storeIdSource === 'file' ? 'Store ID' : 'Manual',
    `${i.periodStart} to ${i.periodEnd}`,
    i.included === false ? 'EXCLUDED from analysis' : { new: 'New days only', replace: 'Replaced overlaps', keep: 'Kept existing' }[i.resolution],
    i.validRows,
    i.invalidRows.length,
    i.daysAdded,
    i.daysReplaced,
    i.daysKept,
    i.reconciliation ? `${i.reconciliation.matchedDays}/${i.reconciliation.days} days` : '—',
    i.conversion.formula,
  ])
  row = table(
    quality,
    row,
    [
      { header: 'Imported', kind: 'center' },
      { header: 'Source file', kind: 'wrap' },
      { header: 'Branch' },
      { header: 'Store ID', kind: 'center' },
      { header: 'Branch from' },
      { header: 'Reporting period' },
      { header: 'Status / overlaps' },
      { header: 'Valid rows', kind: 'int' },
      { header: 'Invalid rows', kind: 'int' },
      { header: 'Days added', kind: 'int' },
      { header: 'Replaced', kind: 'int' },
      { header: 'Kept', kind: 'int' },
      { header: 'Reconciled', kind: 'center' },
      { header: 'Conversion rule', kind: 'wrap' },
    ],
    imp,
    { cellStyle: (col, v) => (col === 6 && String(v).startsWith('EXCLUDED') ? { color: PALETTE.warning, bold: true } : undefined) },
  ).nextRow
  const invalid = a.imports.flatMap((i) => i.invalidRows.map((r) => [i.fileName, `${BRANDS[i.brandId].name} — ${i.branch}`, r.row, r.date ?? '', r.reason]))
  if (invalid.length > 0) {
    row = section(quality, row, 'Invalid records (not imported)', span(1, 14))
    row = table(quality, row, [{ header: 'Source file', span: 2, kind: 'wrap' }, { header: 'Branch' }, { header: 'Row', kind: 'int' }, { header: 'Date', kind: 'center' }, { header: 'Reason', span: 6, kind: 'wrap' }], invalid).nextRow
  }
  const replaced = a.imports.flatMap((i) => i.replaced.map((r) => [i.fileName, `${BRANDS[i.brandId].name} — ${i.branch}`, r.date, r.previousCsvTotal]))
  if (replaced.length > 0) {
    row = section(quality, row, 'Replaced values (audit trail)', span(1, 14))
    row = table(quality, row, [{ header: 'Replacing file', span: 2, kind: 'wrap' }, { header: 'Branch' }, { header: 'Date', kind: 'center' }, { header: 'Previous CSV total', kind: 'number', span: 2 }], replaced).nextRow
  }
  finishSheet(quality, { tab: TAB.quality, lastCol: 14, lastRow: row })

  // ── Executive Summary ──────────────────────────────────────────────────
  setWidths(summary, [2.5, 17, 17, 17, 17, 17, 17, 2.5])
  const body = span(2, 7)
  row = sheetHeader(summary, options.title, `${subtitle} · Generated ${options.generatedAt.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, span(1, 8))
  row = section(summary, row, 'Key metrics (Toters only)', body)
  const cards = [span(2, 3), span(4, 5), span(6, 7)]
  const t = a.totals
  row = kpiCards(
    summary,
    row,
    [
      { label: 'Total Toters revenue (USD)', value: a.hasData ? t.revenueUsd : undefined, format: USD, sub: rangeText(a) },
      { label: 'Average daily revenue (USD)', value: t.averageDailyUsd, format: USD, sub: 'Total ÷ days with imported data' },
      { label: 'Days with imported data', value: a.range ? t.daysWithData : undefined, format: FMT.int, sub: a.range ? `of ${t.calendarDays} calendar day(s)` : '' },
    ],
    cards,
  )
  row = kpiCards(
    summary,
    row,
    [
      { label: 'Active Toters branches', value: a.branches.length > 0 ? t.branchesWithData : undefined, format: FMT.int, sub: `of ${a.branches.length} available in this selection` },
      { label: 'Highest revenue branch (USD)', value: a.highestBranch?.revenueUsd, format: USD, sub: a.highestBranch?.info.label ?? '' },
      { label: 'Branch-days without data', value: a.range ? t.missingDays + t.invalidDays : undefined, format: FMT.int, sub: a.range ? `${t.missingDays} missing · ${t.invalidDays} invalid · ${t.zeroDays} actual zero` : '' },
    ],
    cards,
  )
  row = note(summary, row, 'Order counts are not part of the Toters revenue export, so orders and average order value are not reported.', body)
  row = note(summary, row, conversionNote, body)
  row = note(summary, row, 'Toters revenue is reported separately and is never added to Weevi (app) revenue.', body) + 1

  if (a.brandRows.length > 0) {
    row = section(summary, row, 'Revenue by brand', body)
    row = table(summary, row, [{ header: 'Brand', span: 3, kind: 'strong' }, { header: 'Revenue (USD)', kind: 'money', span: 2 }, { header: 'Share', kind: 'pct' }], a.brandRows.map((b) => [b.name, b.revenueUsd, b.share]), { startCol: 2, currencyOf: () => 'USD' }).nextRow
  }
  if (a.branchRows.length > 0 || a.unavailable.length > 0) {
    row = section(summary, row, 'Revenue by branch', body)
    row = table(
      summary,
      row,
      [{ header: 'Branch', span: 2, kind: 'strong' }, { header: 'Revenue (USD)', kind: 'money', span: 2 }, { header: 'Share', kind: 'pct' }, { header: 'Days with data', kind: 'int' }],
      [...a.branchRows.map((r) => [r.info.label, r.daysWithData > 0 ? r.revenueUsd : 'No data imported', r.share, r.daysWithData]), ...a.unavailable.map((u) => [u.label, 'Not available', undefined, undefined])],
      { startCol: 2, currencyOf: () => 'USD', cellStyle: (col, v) => (col === 1 && typeof v === 'string' ? { color: PALETTE.muted } : undefined) },
    ).nextRow
  }
  if (a.extremes) {
    row = section(summary, row, 'Sales highlights (days with all selected branches)', body)
    row = table(summary, row, [{ header: 'Measure', span: 3, kind: 'strong' }, { header: 'Date', kind: 'day', span: 2 }, { header: 'Revenue (USD)', kind: 'money' }], [
      ['Highest Toters revenue day', a.extremes.highest.date, a.extremes.highest.revenueUsd],
      ['Lowest Toters revenue day', a.extremes.lowest.date, a.extremes.lowest.revenueUsd],
    ], { startCol: 2, currencyOf: () => 'USD', cellStyle: (col, _v, _r, i) => (col === 0 ? { color: i === 0 ? PALETTE.positive : PALETTE.negative } : undefined) }).nextRow
  }
  if (dailyRange && a.daily.length >= 2) {
    row = section(summary, row, 'Daily Toters revenue (USD)', body)
    addChart(wb, {
      sheet: TOTERS_SHEETS[0],
      type: 'line',
      title: 'Daily Toters revenue (USD)',
      from: { col: 2, row },
      to: { col: 8, row: row + 16 },
      categories: { sheet: TOTERS_SHEETS[1], col: 1, ...dailyRange, values: a.daily.map((d) => d.date), dates: true },
      series: [{ name: 'Total revenue (USD)', range: { sheet: TOTERS_SHEETS[1], col: 2, ...dailyRange }, values: a.daily.map((d) => d.totalUsd) }],
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
    ['Filters', describeTotersFilters(a)],
    ['Date range', a.range ? `${prettyDate(a.range.start)} – ${prettyDate(a.range.end)}` : rangeText(a)],
    ['Source', 'Toters daily revenue exports (store_id, period, total)'],
    ['Branch identification', 'Toters store ID (never the file name)'],
    ['Currency', conversionNote],
  ], { startCol: 2 }).nextRow
  finishSheet(summary, { tab: TAB.summary, lastCol: 8, lastRow: row, orientation: 'portrait' })

  return wb
}
