import type { Workbook } from 'exceljs'
import { BRAND, SERIES } from '@/components/charts/chartTheme'
import { BRANDS } from '@/config/brands'
import { FOODY_CURRENCY, FOODY_RULES } from '@/config/foody'
import type { FoodyAnalytics, FoodyComparison } from '@/foody/analytics'
import { addChart } from './charts'
import { FMT, PALETTE, TAB, finishSheet, kpiCards, moneyFormat, note, prettyDate, section, setWidths, sheetHeader, table, type CellStyle, type CellValue, type KpiCard, type Span } from './theme'

/**
 * Foody Excel report (Ginger & Co Cyprus, EUR) — a separate workbook from the Weevi and Toters
 * reports, in the same theme with native charts. It only presents figures already computed by the
 * Foody analytics for the selected filters. Foody amounts are never converted or combined.
 */

export interface FoodyReportOptions {
  title: string
  generatedAt: Date
}

const span = (from: number, to: number): Span => ({ from, to })
const EUR = moneyFormat(FOODY_CURRENCY)
const PTS = '+0.0" pts";-0.0" pts";0.0" pts"'
const STRIP = (hex: string) => hex.replace('#', '').toUpperCase()
const eurOf = () => FOODY_CURRENCY

const levelStyle = (level: string): CellStyle =>
  level === 'ERROR'
    ? { fill: PALETTE.negativeSoft, color: PALETTE.negative, bold: true }
    : level === 'WARNING'
      ? { fill: PALETTE.warningSoft, color: PALETTE.warning, bold: true }
      : { fill: PALETTE.infoSoft, color: PALETTE.info, bold: true }

export function describeFoodyFilters(a: FoodyAnalytics): string {
  const brand = a.filters.brandId === 'all' ? 'All brands' : BRANDS[a.filters.brandId].name
  const branch = a.filters.branch === 'all' ? 'All Foody branches' : (a.branches[0]?.label ?? a.filters.branch)
  const grain = { day: 'Daily', week: 'Weekly', month: 'Monthly' }[a.filters.grain]
  return `${brand} · ${branch} · ${grain} view`
}

const rangeText = (a: FoodyAnalytics) => (a.range ? `${a.range.start} to ${a.range.end}` : 'No Foody data in this selection')
const statusText = { complete: 'Complete', partial: 'Partial — some branches missing', missing: 'No data imported' } as const
const compareText = (c: FoodyComparison | undefined) =>
  c ? `${c.current.start} to ${c.current.end} vs ${c.baseline.start} to ${c.baseline.end} (${c.mode === 'previous' ? 'previous period of the same length' : 'custom comparison period'})` : 'No comparison selected'

export const FOODY_SHEETS = ['Foody Executive Summary', 'Foody Daily Sales', 'Foody Period Comparison', 'Foody Branch Performance', 'Foody Orders & Cancellations', 'Foody Top Items', 'Foody Data Quality'] as const

/** Comparison rows: label, current, baseline, change, number format, change format. */
function comparisonTable(c: FoodyComparison): { rows: CellValue[][]; formats: string[]; changeFormats: string[] } {
  const a = c.current.metrics
  const b = c.baseline.metrics
  const list: [string, number | undefined, number | undefined, number | undefined, string, string][] = [
    ['Net sales', a.net, b.net, c.change.net, EUR, FMT.signedPct],
    ['Gross sales', a.gross, b.gross, c.change.gross, EUR, FMT.signedPct],
    ['Discounts', a.discount, b.discount, c.change.discount, EUR, FMT.signedPct],
    ['Vouchers', a.voucher, b.voucher, c.change.voucher, EUR, FMT.signedPct],
    ['Valid orders', a.validOrders, b.validOrders, c.change.validOrders, FMT.int, FMT.signedPct],
    ['Average order value', a.aov, b.aov, c.change.aov, EUR, FMT.signedPct],
    ['Orders with discount / voucher', a.promoOrders, b.promoOrders, c.change.promoOrders, FMT.int, FMT.signedPct],
    ['Discount + voucher share of gross', a.promoRate, b.promoRate, c.pointChange.promoRate === undefined ? undefined : c.pointChange.promoRate * 100, FMT.pct, PTS],
    ['Cancelled orders', a.cancelledOrders, b.cancelledOrders, c.change.cancelledOrders, FMT.int, FMT.signedPct],
    ['Cancellation rate', a.cancellationRate, b.cancellationRate, c.pointChange.cancellationRate === undefined ? undefined : c.pointChange.cancellationRate * 100, FMT.pct, PTS],
    ['Orders with a complaint', a.complaints, b.complaints, c.change.complaints, FMT.int, FMT.signedPct],
  ]
  return { rows: list.map(([l, x, y, z]) => [l, x, y, z]), formats: list.map((r) => r[4]), changeFormats: list.map((r) => r[5]) }
}

export async function buildFoodyWorkbook(a: FoodyAnalytics, options: FoodyReportOptions): Promise<Workbook> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Ginger & Co Analytics'
  wb.created = options.generatedAt
  const subtitle = `${describeFoodyFilters(a)} · ${rangeText(a)} · Amounts in EUR`
  const rulesNote = `${FOODY_RULES.gross}. ${FOODY_RULES.net}. ${FOODY_RULES.aov}. ${FOODY_RULES.cancelled}.`
  const separateNote = 'Foody (Cyprus, EUR) is reported separately and is never converted or added to Weevi or Toters (Lebanon, USD) figures.'
  const t = a.totals
  const c = a.comparison

  const summary = wb.addWorksheet(FOODY_SHEETS[0])
  const daily = wb.addWorksheet(FOODY_SHEETS[1])
  const compare = wb.addWorksheet(FOODY_SHEETS[2])
  const branches = wb.addWorksheet(FOODY_SHEETS[3])
  const ordersSheet = wb.addWorksheet(FOODY_SHEETS[4])
  const itemsSheet = wb.addWorksheet(FOODY_SHEETS[5])
  const quality = wb.addWorksheet(FOODY_SHEETS[6])

  // ── Daily Sales ─────────────────────────────────────────────────────────
  const multi = a.branches.length > 1
  const branchCols = multi ? a.branches : []
  const dailyCols = 9 + branchCols.length + 1
  setWidths(daily, [16, 16, 16, 14, 14, 10, 14, 11, 12, ...branchCols.map(() => 18), 30])
  let row = sheetHeader(daily, 'Foody daily sales', subtitle, span(1, Math.max(dailyCols, 10)))
  row = note(daily, row, 'Blank cells = no imported Foody data for that day (never zero). A day inside an imported file without orders is a real zero. Net sales = Subtotal − Discount − Voucher (valid orders only).', span(1, Math.max(dailyCols, 10)))
  const dHeader = row + 1
  const dt = table(
    daily,
    dHeader,
    [
      { header: 'Date', kind: 'day' },
      { header: 'Net sales (EUR)', kind: 'money' },
      { header: 'Gross sales (EUR)', kind: 'money' },
      { header: 'Discounts (EUR)', kind: 'money' },
      { header: 'Vouchers (EUR)', kind: 'money' },
      { header: 'Valid orders', kind: 'int' },
      { header: 'AOV (EUR)', kind: 'money' },
      { header: 'Cancelled', kind: 'int' },
      { header: 'Promo orders', kind: 'int' },
      ...branchCols.map((b) => ({ header: `${b.label} net (EUR)`, kind: 'money' as const })),
      { header: 'Data status' },
    ],
    a.daily.map((d) => {
      const promo = d.net === null ? null : a.orders.filter((o) => o.date === d.date && o.outcome === 'valid' && (o.discount !== 0 || o.voucher !== 0)).length
      return [d.date, d.net, d.gross, d.discount, d.voucher, d.orders, d.orders ? (d.net as number) / d.orders : null, d.cancelled, promo, ...branchCols.map((b) => d.byBranch[b.key]), statusText[d.status]]
    }),
    {
      filter: true,
      currencyOf: eurOf,
      cellStyle: (col, v) => (col === 9 + branchCols.length && v !== statusText.complete ? { color: v === statusText.missing ? PALETTE.negative : PALETTE.warning, bold: true } : undefined),
    },
  )
  const dailyRange = a.daily.length > 0 ? { firstRow: dt.firstRow, lastRow: dt.lastRow } : undefined
  let dRow = dt.nextRow
  if (a.daily.length > 0) {
    dRow = table(daily, dt.lastRow + 1, [{ header: 'Total (selection)' }, { header: '', kind: 'money' }, { header: '', kind: 'money' }, { header: '', kind: 'money' }, { header: '', kind: 'money' }, { header: '', kind: 'int' }, { header: '', kind: 'money' }, { header: '', kind: 'int' }, { header: '', kind: 'int' }], [], { totals: true }).nextRow
    const tr = daily.getRow(dt.lastRow + 1)
    const set = (col: number, v: number | undefined, fmt: string) => {
      tr.getCell(col).value = v ?? null
      tr.getCell(col).numFmt = fmt
    }
    set(2, t.net, EUR)
    set(3, t.gross, EUR)
    set(4, t.discount, EUR)
    set(5, t.voucher, EUR)
    set(6, t.validOrders, FMT.int)
    set(7, t.aov, EUR)
    set(8, t.cancelledOrders, FMT.int)
    set(9, t.promoOrders, FMT.int)
  }
  if (a.periods.length > 0 && a.filters.grain !== 'day') {
    dRow = section(daily, dRow, a.filters.grain === 'week' ? 'Weekly totals (Monday to Sunday)' : 'Monthly totals', span(1, 10))
    dRow = table(
      daily,
      dRow,
      [{ header: 'Period', kind: 'strong', span: 2 }, { header: 'Net sales', kind: 'money' }, { header: 'Gross sales', kind: 'money' }, { header: 'Valid orders', kind: 'int' }, { header: 'AOV', kind: 'money' }, { header: 'Change (net)', kind: 'signedPct' }, { header: 'Days with data', kind: 'int' }, { header: 'Note' }],
      a.periods.map((p) => [p.start === p.end ? p.start : `${p.start} to ${p.end}`, p.daysCovered > 0 ? p.metrics.net : undefined, p.daysCovered > 0 ? p.metrics.gross : undefined, p.metrics.validOrders, p.metrics.aov, p.change, p.daysCovered, p.partial ? `Partial (${p.daysCovered}/${p.calendarDays} days)` : '']),
      { currencyOf: eurOf, cellStyle: (col, v) => (col === 5 && typeof v === 'number' && v !== 0 ? { color: v > 0 ? PALETTE.positive : PALETTE.negative } : col === 7 && v ? { color: PALETTE.warning } : undefined) },
    ).nextRow
  }
  if (dailyRange && a.daily.length >= 2) {
    addChart(wb, {
      sheet: FOODY_SHEETS[1],
      type: 'line',
      title: 'Daily Foody net and gross sales (EUR)',
      from: { col: 1, row: dRow },
      to: { col: 11, row: dRow + 20 },
      categories: { sheet: FOODY_SHEETS[1], col: 1, ...dailyRange, values: a.daily.map((d) => d.date), dates: true },
      series: [
        { name: 'Net sales (EUR)', range: { sheet: FOODY_SHEETS[1], col: 2, ...dailyRange }, values: a.daily.map((d) => d.net), color: STRIP(BRAND) },
        { name: 'Gross sales (EUR)', range: { sheet: FOODY_SHEETS[1], col: 3, ...dailyRange }, values: a.daily.map((d) => d.gross), color: STRIP(SERIES[0]) },
      ],
      valueFormat: '#,##0',
    })
    dRow += 21
  }
  finishSheet(daily, { tab: TAB.analysis, lastCol: Math.max(dailyCols, 10), lastRow: dRow, freezeRow: dHeader, printTitleRow: dHeader })

  // ── Period Comparison ──────────────────────────────────────────────────
  setWidths(compare, [36, 20, 20, 14])
  row = sheetHeader(compare, 'Foody period comparison', subtitle, span(1, 4))
  if (!c) {
    row = note(compare, row, 'No comparison period was selected on the dashboard (Compare with: none), or there is no Foody data in the selected range.', span(1, 4), 'warning')
    finishSheet(compare, { tab: TAB.analysis, lastCol: 4, lastRow: row, orientation: 'portrait' })
  } else {
    row = note(compare, row, `Selected: ${prettyDate(c.current.start)} – ${prettyDate(c.current.end)} (${c.current.calendarDays} days, ${c.current.daysCovered} with data) · Comparison: ${prettyDate(c.baseline.start)} – ${prettyDate(c.baseline.end)} (${c.baseline.calendarDays} days, ${c.baseline.daysCovered} with data).`, span(1, 4))
    if (c.baselineIncomplete || c.currentIncomplete) row = note(compare, row, 'At least one period has days without imported Foody data — the changes are not like for like.', span(1, 4), 'warning')
    const cmp = comparisonTable(c)
    const cHeader = row + 1
    const ct = table(compare, cHeader, [{ header: 'Metric', kind: 'strong' }, { header: 'Selected period', kind: 'number' }, { header: 'Comparison period', kind: 'number' }, { header: 'Change', kind: 'signedPct' }], cmp.rows, {
      cellStyle: (col, v, _r, i) => {
        if (col === 1 || col === 2) return { numFmt: cmp.formats[i] }
        if (col === 3) {
          const lowerIsBetter = i >= 8
          const good = typeof v === 'number' && v !== 0 ? (lowerIsBetter ? v < 0 : v > 0) : undefined
          const neutral = i === 2 || i === 3 || i === 6 || i === 7
          return { numFmt: cmp.changeFormats[i], color: good === undefined || neutral ? undefined : good ? PALETTE.positive : PALETTE.negative }
        }
        return undefined
      },
    })
    row = note(compare, ct.nextRow - 1, 'Change = (selected − comparison) ÷ comparison. Rates show the difference in percentage points. Green = better (higher sales, orders and AOV; fewer cancellations and complaints); discount and voucher changes are not judged.', span(1, 4)) + 1
    addChart(wb, {
      sheet: FOODY_SHEETS[2],
      type: 'column',
      title: 'Net and gross sales: selected vs comparison period (EUR)',
      from: { col: 1, row },
      to: { col: 5, row: row + 16 },
      categories: { sheet: FOODY_SHEETS[2], col: 1, firstRow: ct.firstRow, lastRow: ct.firstRow + 1, values: cmp.rows.slice(0, 2).map((r) => String(r[0])) },
      series: [
        { name: 'Selected period', range: { sheet: FOODY_SHEETS[2], col: 2, firstRow: ct.firstRow, lastRow: ct.firstRow + 1 }, values: cmp.rows.slice(0, 2).map((r) => r[1] as number), color: STRIP(BRAND) },
        { name: 'Comparison period', range: { sheet: FOODY_SHEETS[2], col: 3, firstRow: ct.firstRow, lastRow: ct.firstRow + 1 }, values: cmp.rows.slice(0, 2).map((r) => r[2] as number), color: STRIP(SERIES[0]) },
      ],
      valueFormat: '#,##0',
      dataLabels: true,
    })
    row += 17
    finishSheet(compare, { tab: TAB.analysis, lastCol: 4, lastRow: row, freezeRow: cHeader, orientation: 'portrait' })
  }

  // ── Branch Performance ─────────────────────────────────────────────────
  setWidths(branches, [28, 13, 16, 16, 9, 16, 15, 15, 10, 14, 10, 10, 10, 16, 15])
  row = sheetHeader(branches, 'Foody branch performance', subtitle, span(1, 15))
  const bHeader = row
  const bt = table(
    branches,
    bHeader,
    [
      { header: 'Branch', kind: 'strong' },
      { header: 'Store ID', kind: 'center' },
      { header: 'Status' },
      { header: 'Net sales', kind: 'money' },
      { header: 'Share', kind: 'pct' },
      { header: 'Gross sales', kind: 'money' },
      { header: 'Discounts', kind: 'money' },
      { header: 'Vouchers', kind: 'money' },
      { header: 'Valid orders', kind: 'int' },
      { header: 'AOV', kind: 'money' },
      { header: 'Cancelled', kind: 'int' },
      { header: 'Days with data', kind: 'int' },
      { header: 'Missing days', kind: 'int' },
      { header: 'Best day', kind: 'day' },
      { header: 'Best day net', kind: 'money' },
    ],
    a.branchRows.map((r) => {
      const has = r.daysCovered > 0
      return [r.info.label, r.info.storeId, !has ? 'No data imported' : r.missingDays > 0 ? 'Partial data' : 'Complete', has ? r.metrics.net : undefined, r.share, has ? r.metrics.gross : undefined, has ? r.metrics.discount : undefined, has ? r.metrics.voucher : undefined, r.metrics.validOrders, r.metrics.aov, r.metrics.cancelledOrders, r.daysCovered, r.missingDays, r.best?.date, r.best?.net]
    }),
    { filter: true, currencyOf: eurOf, cellStyle: (col, v) => (col === 2 && v !== 'Complete' ? { color: PALETTE.warning, bold: true } : undefined) },
  )
  let bRow = bt.nextRow
  if (a.branchRows.length > 0) {
    bRow = table(branches, bt.lastRow + 1, [{ header: 'Total (selected branches)', span: 3 }, { header: '', kind: 'money' }, { header: '', kind: 'pct' }, { header: '', kind: 'money' }, { header: '', kind: 'money' }, { header: '', kind: 'money' }, { header: '', kind: 'int' }, { header: '', kind: 'money' }, { header: '', kind: 'int' }], [], { totals: true }).nextRow
    const tr = branches.getRow(bt.lastRow + 1)
    const set = (col: number, v: number | undefined | null, fmt: string) => {
      tr.getCell(col).value = v ?? null
      tr.getCell(col).numFmt = fmt
    }
    set(4, t.net, EUR)
    set(5, a.hasData ? 1 : null, FMT.pct)
    set(6, t.gross, EUR)
    set(7, t.discount, EUR)
    set(8, t.voucher, EUR)
    set(9, t.validOrders, FMT.int)
    set(10, t.aov, EUR)
    set(11, t.cancelledOrders, FMT.int)
  }
  bRow = note(branches, bRow - 1, 'Branches are identified by the Foody Store ID (never the file name). Add new Cyprus store IDs to the Foody store registry before importing their files.', span(1, 15)) + 1
  if (a.branchRows.filter((r) => r.daysCovered > 0).length >= 2) {
    const r = { firstRow: bt.firstRow, lastRow: bt.lastRow }
    addChart(wb, {
      sheet: FOODY_SHEETS[3],
      type: 'bar',
      title: 'Foody net sales by branch (EUR)',
      from: { col: 1, row: bRow },
      to: { col: 9, row: bRow + Math.max(10, a.branchRows.length * 3 + 4) },
      categories: { sheet: FOODY_SHEETS[3], col: 1, ...r, values: a.branchRows.map((x) => x.info.label) },
      series: [{ name: 'Net sales (EUR)', range: { sheet: FOODY_SHEETS[3], col: 4, ...r }, values: a.branchRows.map((x) => x.metrics.net) }],
      valueFormat: '#,##0',
      dataLabels: true,
    })
    bRow += Math.max(10, a.branchRows.length * 3 + 4) + 1
  }
  finishSheet(branches, { tab: TAB.analysis, lastCol: 15, lastRow: bRow, freezeRow: bHeader, printTitleRow: bHeader })

  // ── Orders & Cancellations ─────────────────────────────────────────────
  setWidths(ordersSheet, [20, 16, 18, 30, 14, 14, 14])
  row = sheetHeader(ordersSheet, 'Foody orders & cancellations', subtitle, span(1, 7))
  const mixTable = (title: string, rows: FoodyAnalytics['mix']['deliveryType']) => {
    row = section(ordersSheet, row, title, span(1, 7))
    row = table(ordersSheet, row, [{ header: 'Type', kind: 'strong', span: 2 }, { header: 'Valid orders', kind: 'int' }, { header: 'Share of orders', kind: 'pct' }, { header: 'Net sales', kind: 'money' }], rows.map((r) => [r.label, r.orders, r.share, r.net]), { currencyOf: eurOf }).nextRow
  }
  mixTable('Delivery type', a.mix.deliveryType)
  mixTable('Payment type', a.mix.paymentType)
  mixTable('Payment method', a.mix.paymentMethod)
  if (a.mix.pro.length > 0) mixTable('Pro orders', a.mix.pro)
  row = section(ordersSheet, row, 'Cancellations by reason (excluded from sales)', span(1, 7))
  row = table(ordersSheet, row, [{ header: 'Reason', kind: 'wrap', span: 3 }, { header: 'Orders', kind: 'int' }, { header: 'Subtotal', kind: 'money' }], a.cancellations.byReason.map((r) => [r.label, r.orders, r.subtotal]), { currencyOf: eurOf }).nextRow
  row = section(ordersSheet, row, 'Cancellations by owner', span(1, 7))
  row = table(ordersSheet, row, [{ header: 'Cancelled by', kind: 'strong', span: 3 }, { header: 'Orders', kind: 'int' }, { header: 'Subtotal', kind: 'money' }], a.cancellations.byOwner.map((r) => [r.label, r.orders, r.subtotal]), { currencyOf: eurOf }).nextRow
  const detail = [...a.cancellations.orders, ...a.complaints.orders.filter((o) => o.outcome !== 'cancelled')]
  row = section(ordersSheet, row, 'Cancelled and complaint orders', span(1, 7))
  row = table(
    ordersSheet,
    row,
    [{ header: 'Date / time', kind: 'center' }, { header: 'Order ID', kind: 'center' }, { header: 'Status' }, { header: 'Reason', kind: 'wrap' }, { header: 'Cancelled by' }, { header: 'Subtotal', kind: 'money' }, { header: 'Net in sales', kind: 'money' }],
    detail.map((o) => [o.receivedAt ?? `${o.cancelledAt ?? o.date} *`, o.orderId, o.status, o.outcome === 'cancelled' ? o.cancellationReason : (o.complaintReason ?? 'Complaint'), o.cancellationOwner, o.subtotal, o.outcome === 'valid' ? o.subtotal - o.discount - o.voucher : 'Excluded']),
    { currencyOf: eurOf },
  ).nextRow
  if (detail.some((o) => !o.receivedAt)) row = note(ordersSheet, row - 1, '* Cancelled before the restaurant received it: dated by “Cancelled at”.', span(1, 7)) + 1
  finishSheet(ordersSheet, { tab: TAB.analysis, lastCol: 7, lastRow: row })

  // ── Top Items ──────────────────────────────────────────────────────────
  setWidths(itemsSheet, [8, 44, 14, 20])
  row = sheetHeader(itemsSheet, 'Foody top items', subtitle, span(1, 4))
  row = note(itemsSheet, row, `Ranked by quantity in valid orders, read from the “Order items” text (${a.items.ordersWithItems} orders). The export has no item prices, so no item revenue is shown. Modifiers in […] are not counted.`, span(1, 4))
  const iHeader = row + 1
  row = table(itemsSheet, iHeader, [{ header: 'Rank', kind: 'int' }, { header: 'Item', kind: 'strong' }, { header: 'Quantity', kind: 'int' }, { header: 'Orders containing it', kind: 'int' }], a.items.rows.map((r, i) => [i + 1, r.name, r.quantity, r.orders]), { filter: true }).nextRow
  if (a.items.unparsed > 0) row = note(itemsSheet, row - 1, `${a.items.unparsed} item text fragment(s) could not be read as “quantity + item” and are not ranked.`, span(1, 4), 'warning') + 1
  finishSheet(itemsSheet, { tab: TAB.analysis, lastCol: 4, lastRow: row, freezeRow: iHeader, printTitleRow: iHeader })

  // ── Data Quality ───────────────────────────────────────────────────────
  setWidths(quality, [18, 28, 22, 12, 14, 14, 14, 14, 12, 12, 12, 14])
  row = sheetHeader(quality, 'Foody data quality', subtitle, span(1, 12))
  row = section(quality, row, 'Calculation rules', span(1, 12))
  row = table(quality, row, [{ header: 'Rule', span: 2, kind: 'strong' }, { header: 'Definition', span: 8, kind: 'wrap' }], [
    ['Gross sales', FOODY_RULES.gross],
    ['Net sales (primary KPI)', FOODY_RULES.net],
    ['Average order value', FOODY_RULES.aov],
    ['Valid orders', FOODY_RULES.valid],
    ['Cancelled orders', FOODY_RULES.cancelled],
    ['Fees', FOODY_RULES.fees],
    ['Commission / payout', 'Not in the export — not calculated or assumed.'],
    ['Currency', 'EUR as exported — no conversion. Never combined with Weevi or Toters (USD).'],
    ['Duplicates', 'One record per Foody order ID: overlapping or repeated files never add an order twice.'],
  ]).nextRow
  row = section(quality, row, 'Validation: stored orders vs each file’s own totals', span(1, 12))
  row = table(
    quality,
    row,
    [
      { header: 'Source file', kind: 'wrap', span: 2 },
      { header: 'Result', kind: 'center' },
      { header: 'Valid orders (file)', kind: 'int' },
      { header: 'Valid orders (stored)', kind: 'int' },
      { header: 'Gross (file)', kind: 'money' },
      { header: 'Gross (stored)', kind: 'money' },
      { header: 'Net (file)', kind: 'money' },
      { header: 'Net (stored)', kind: 'money' },
      { header: 'Cancelled (file)', kind: 'int' },
      { header: 'Cancelled (stored)', kind: 'int' },
    ],
    a.reconciliation.map((r) => [r.fileName, r.matches ? 'MATCHES' : 'DIFFERS', r.control.validOrders, r.stored.validOrders, r.control.gross, r.stored.gross, r.control.net, r.stored.net, r.control.cancelledOrders, r.stored.cancelledOrders]),
    { currencyOf: eurOf, cellStyle: (col, v) => (col === 1 ? (v === 'MATCHES' ? { color: PALETTE.positive, bold: true } : { color: PALETTE.warning, bold: true }) : undefined) },
  ).nextRow
  row = section(quality, row, 'Checks for this selection', span(1, 12))
  row = table(quality, row, [{ header: 'Level', kind: 'center' }, { header: 'Detail', span: 11, kind: 'wrap' }], a.quality.map((q) => [q.level.toUpperCase(), q.message]), {
    banded: false,
    cellStyle: (col, v) => (col === 0 ? levelStyle(String(v)) : undefined),
  }).nextRow
  row = section(quality, row, 'Import history (branches in this selection)', span(1, 12))
  row = table(
    quality,
    row,
    [
      { header: 'Imported', kind: 'center' },
      { header: 'Source file', kind: 'wrap' },
      { header: 'Branch' },
      { header: 'Store ID', kind: 'center' },
      { header: 'Order dates', span: 2 },
      { header: 'Status / overlaps', span: 2 },
      { header: 'Valid rows', kind: 'int' },
      { header: 'Not imported', kind: 'int' },
      { header: 'Added', kind: 'int' },
      { header: 'Replaced', kind: 'int' },
    ],
    a.allImports.map((i) => [
      new Date(i.importedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      i.fileName,
      i.branches.map((b) => `${BRANDS[b.brandId].name} — ${b.branch}`).join(', '),
      i.storeIds.join(', '),
      `${i.periodStart} to ${i.periodEnd}`,
      i.included === false ? 'EXCLUDED from analysis' : { new: 'New orders only', replace: 'Replaced changed orders', keep: 'Kept stored values' }[i.resolution],
      i.validRows,
      i.invalidRows.length,
      i.ordersAdded,
      i.ordersReplaced,
    ]),
    { cellStyle: (col, v) => (col === 5 && String(v).startsWith('EXCLUDED') ? { color: PALETTE.warning, bold: true } : undefined) },
  ).nextRow
  const invalid = a.imports.flatMap((i) => i.invalidRows.map((r) => [i.fileName, r.row, r.orderId ?? '', r.date ?? '', r.reason]))
  if (invalid.length > 0) {
    row = section(quality, row, 'Rows not imported', span(1, 12))
    row = table(quality, row, [{ header: 'Source file', span: 2, kind: 'wrap' }, { header: 'Row', kind: 'int' }, { header: 'Order ID', kind: 'center' }, { header: 'Date', kind: 'center' }, { header: 'Reason', span: 6, kind: 'wrap' }], invalid).nextRow
  }
  const replaced = a.imports.flatMap((i) => i.replaced.map((r) => [i.fileName, r.orderId, r.previousStatus, r.previousNet]))
  if (replaced.length > 0) {
    row = section(quality, row, 'Replaced orders (audit trail)', span(1, 12))
    row = table(quality, row, [{ header: 'Replacing file', span: 2, kind: 'wrap' }, { header: 'Order ID', kind: 'center' }, { header: 'Previous status', span: 2 }, { header: 'Previous net', kind: 'money', span: 2 }], replaced, { currencyOf: eurOf }).nextRow
  }
  finishSheet(quality, { tab: TAB.quality, lastCol: 12, lastRow: row })

  // ── Executive Summary ──────────────────────────────────────────────────
  setWidths(summary, [2.5, 17, 17, 17, 17, 17, 17, 2.5])
  const body = span(2, 7)
  row = sheetHeader(summary, options.title, `${subtitle} · Generated ${options.generatedAt.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, span(1, 8))
  row = section(summary, row, 'Key metrics (Foody only, EUR)', body)
  const cards = [span(2, 3), span(4, 5), span(6, 7)]
  const changeSub = (key: keyof FoodyComparison['change'], fallback: string, lowerIsBetter = false): Pick<KpiCard, 'sub' | 'subTone'> => {
    const v = c && !c.baselineIncomplete ? c.change[key] : undefined
    if (v === undefined) return { sub: fallback }
    const good = lowerIsBetter ? v < 0 : v > 0
    return { sub: `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}% vs comparison period`, subTone: v === 0 ? 'muted' : good ? 'positive' : 'negative' }
  }
  row = kpiCards(
    summary,
    row,
    [
      { label: 'Net sales (EUR)', value: a.hasData ? t.net : undefined, format: EUR, ...changeSub('net', rangeText(a)) },
      { label: 'Gross sales (EUR)', value: a.hasData ? t.gross : undefined, format: EUR, ...changeSub('gross', 'Subtotal before discounts and vouchers') },
      { label: 'Average order value (EUR)', value: t.aov, format: EUR, ...changeSub('aov', 'Net sales ÷ valid orders') },
    ],
    cards,
  )
  row = kpiCards(
    summary,
    row,
    [
      { label: 'Valid orders', value: a.hasData ? t.validOrders : undefined, format: FMT.int, ...changeSub('validOrders', 'Delivered orders') },
      { label: 'Discounts (EUR)', value: a.hasData ? t.discount : undefined, format: EUR, sub: `${t.promoOrders} order(s) with discount or voucher` },
      { label: 'Vouchers (EUR)', value: a.hasData ? t.voucher : undefined, format: EUR, sub: t.promoRate !== undefined ? `Discounts + vouchers = ${(t.promoRate * 100).toFixed(1)}% of gross` : '' },
    ],
    cards,
  )
  row = kpiCards(
    summary,
    row,
    [
      { label: `Cancelled orders: ${t.cancelledOrders}`, value: a.hasData ? t.cancelledSubtotal : undefined, format: EUR, sub: 'Subtotal of cancelled orders — not included in sales' },
      { label: 'Orders with a complaint', value: a.hasData ? t.complaints : undefined, format: FMT.int, sub: 'Valid orders flagged in the export' },
      { label: 'Days with imported data', value: a.range ? t.daysCovered : undefined, format: FMT.int, sub: a.range ? `of ${t.calendarDays} calendar day(s)` : '' },
    ],
    cards,
  )
  row = note(summary, row, rulesNote, body)
  row = note(summary, row, `Comparison: ${compareText(c)}${c?.baselineIncomplete ? ' — the comparison period has days without imported data, so changes are not shown on the cards.' : '.'}`, body)
  row = note(summary, row, separateNote, body) + 1

  if (c) {
    const cmp = comparisonTable(c)
    row = section(summary, row, 'Campaign / period comparison', body)
    row = table(summary, row, [{ header: 'Metric', span: 3, kind: 'strong' }, { header: 'Selected', kind: 'number' }, { header: 'Comparison', kind: 'number' }, { header: 'Change', kind: 'signedPct' }], cmp.rows.slice(0, 6), {
      startCol: 2,
      cellStyle: (col, v, _r, i) => (col === 1 || col === 2 ? { numFmt: cmp.formats[i] } : col === 3 ? { numFmt: cmp.changeFormats[i], color: typeof v === 'number' && v !== 0 && i !== 2 && i !== 3 ? (v > 0 ? PALETTE.positive : PALETTE.negative) : undefined } : undefined),
    }).nextRow
  }
  if (a.branchRows.length > 0) {
    row = section(summary, row, 'Net sales by branch', body)
    row = table(
      summary,
      row,
      [{ header: 'Branch', span: 2, kind: 'strong' }, { header: 'Net sales (EUR)', kind: 'money', span: 2 }, { header: 'Share', kind: 'pct' }, { header: 'Valid orders', kind: 'int' }],
      a.branchRows.map((r) => [r.info.label, r.daysCovered > 0 ? r.metrics.net : 'No data imported', r.share, r.metrics.validOrders]),
      { startCol: 2, currencyOf: eurOf, cellStyle: (col, v) => (col === 1 && typeof v === 'string' ? { color: PALETTE.muted } : undefined) },
    ).nextRow
  }
  if (a.extremes) {
    row = section(summary, row, 'Sales highlights (net sales, complete days)', body)
    row = table(summary, row, [{ header: 'Measure', span: 3, kind: 'strong' }, { header: 'Date', kind: 'day', span: 2 }, { header: 'Net sales (EUR)', kind: 'money' }], [
      ['Highest Foody sales day', a.extremes.highest.date, a.extremes.highest.net],
      ['Lowest Foody sales day', a.extremes.lowest.date, a.extremes.lowest.net],
    ], { startCol: 2, currencyOf: eurOf, cellStyle: (col, _v, _r, i) => (col === 0 ? { color: i === 0 ? PALETTE.positive : PALETTE.negative } : undefined) }).nextRow
  }
  if (dailyRange && a.daily.length >= 2) {
    row = section(summary, row, 'Daily Foody net sales (EUR)', body)
    addChart(wb, {
      sheet: FOODY_SHEETS[0],
      type: 'line',
      title: 'Daily Foody net sales (EUR)',
      from: { col: 2, row },
      to: { col: 8, row: row + 16 },
      categories: { sheet: FOODY_SHEETS[1], col: 1, ...dailyRange, values: a.daily.map((d) => d.date), dates: true },
      series: [{ name: 'Net sales (EUR)', range: { sheet: FOODY_SHEETS[1], col: 2, ...dailyRange }, values: a.daily.map((d) => d.net), color: STRIP(BRAND) }],
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
    ['Filters', describeFoodyFilters(a)],
    ['Date range', a.range ? `${prettyDate(a.range.start)} – ${prettyDate(a.range.end)}` : rangeText(a)],
    ['Comparison', compareText(c)],
    ['Source', 'Foody “orderDetails” Excel exports (one row per order)'],
    ['Branch identification', 'Foody Store ID (never the file name)'],
    ['Currency', 'EUR — no conversion'],
  ], { startCol: 2 }).nextRow
  finishSheet(summary, { tab: TAB.summary, lastCol: 8, lastRow: row, orientation: 'portrait' })

  return wb
}
