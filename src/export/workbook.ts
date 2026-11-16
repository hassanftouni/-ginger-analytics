import type { Workbook, Worksheet } from 'exceljs'
import { BRANDS, PLATFORMS } from '@/config/brands'
import { CATEGORIES, FIELDS, type StandardField } from '@/config/categories'
import type { AnalyticsResult, GroupRow, PeriodRow, QualityItem } from '@/types/analytics'
import type { ReportingSettings } from '@/types/settings'
import { describeFilters, describeOrderBasis } from './describe'
import { getExportFormat } from '@/config/exportFormats'
import { anonymiseCustomer } from '@/utils/hash'
import { addChart, workbookToBuffer, type ChartSpec } from './charts'
import {
  FMT,
  PALETTE,
  TAB,
  asDate,
  finishSheet,
  font,
  kpiCards,
  moneyFormat,
  note,
  prettyDate,
  section,
  setWidths,
  sheetHeader,
  solid,
  table,
  type CellStyle,
  type CellValue,
  type Column,
  type Span,
} from './theme'

/**
 * Builds the analytical Excel report from computed results. Sheets are only added when the
 * supporting data exists. Every monetary column is paired with a Currency column and
 * currencies are never summed together. All styling comes from ./theme and all charts from
 * ./charts; this file only decides what goes where — it does not calculate new figures.
 */

export { workbookToBuffer } from './charts'

const span = (from: number, to: number): Span => ({ from, to })
const pctChange = (v: number | undefined) => (v === undefined ? undefined : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`)
const toneOf = (v: number | undefined): CellStyle | undefined =>
  typeof v === 'number' && v !== 0 ? { color: v > 0 ? PALETTE.positive : PALETTE.negative } : undefined

/** Rows for `currency` must be contiguous for a chart to reference them as one range. */
function contiguous(indexes: number[]) {
  return indexes.length > 0 && indexes.every((v, i) => i === 0 || v === indexes[i - 1] + 1)
}

const dailyCurrencies = (r: AnalyticsResult) => [...new Set(r.daily.map((d) => d.currency))]
/** Daily trend is charted when one currency is present (rows are sorted by date, then currency). */
const dailyChartable = (r: AnalyticsResult) => r.daily.length >= 2 && dailyCurrencies(r).length === 1

function branchIndexes(r: AnalyticsResult, currency: string) {
  return r.branches.rows.map((row, i) => (row.currency === currency ? i : -1)).filter((i) => i >= 0)
}
/** Branch comparison is charted per currency when two or more branches have figures. */
const branchChartCurrencies = (r: AnalyticsResult) =>
  [...new Set(r.branches.rows.map((b) => b.currency))].filter((c) => {
    const idx = branchIndexes(r, c)
    return idx.length >= 2 && contiguous(idx)
  })

interface Ranges {
  daily?: { firstRow: number; lastRow: number }
  branch: Map<string, { firstRow: number; lastRow: number }>
}

const levelStyle = (level: string): CellStyle =>
  level === 'ERROR'
    ? { fill: PALETTE.negativeSoft, color: PALETTE.negative, bold: true }
    : level === 'WARNING'
      ? { fill: PALETTE.warningSoft, color: PALETTE.warning, bold: true }
      : { fill: PALETTE.infoSoft, color: PALETTE.info, bold: true }

const rowTint = (level: string): CellStyle | undefined =>
  level === 'ERROR' ? { fill: PALETTE.negativeSoft } : level === 'WARNING' ? { fill: PALETTE.warningSoft } : undefined

function qualityCounts(items: QualityItem[]) {
  const n = (l: QualityItem['level']) => items.filter((q) => q.level === l).length
  const parts = [
    n('error') ? `${n('error')} error${n('error') === 1 ? '' : 's'}` : '',
    n('warning') ? `${n('warning')} warning${n('warning') === 1 ? '' : 's'}` : '',
    n('info') ? `${n('info')} note${n('info') === 1 ? '' : 's'} for information` : '',
  ].filter(Boolean)
  return parts.join(' · ')
}

const GROUP_COLUMNS = (label: string): Column[] => [
  { header: label, kind: 'strong' },
  { header: 'Currency', kind: 'center' },
  { header: 'Revenue', kind: 'money' },
  { header: 'Orders', kind: 'int' },
  { header: 'Avg order value', kind: 'money' },
  { header: 'Share of currency revenue', kind: 'pct' },
]

const groupRows = (rows: GroupRow[]) => rows.map((r) => [r.label, r.currency, r.revenue, r.orders, r.averageOrderValue, r.share])

function shareBars(sheet: Worksheet, col: string, firstRow: number, lastRow: number) {
  if (lastRow < firstRow) return
  sheet.addConditionalFormatting({
    ref: `${col}${firstRow}:${col}${lastRow}`,
    rules: [{ type: 'dataBar', priority: 1, gradient: false, cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: `FF${PALETTE.accentBar}` } } as never],
  })
}

/** Branch sheet: one row per reporting branch (a group replaces its members), with status and notes. */
function branchSheet(wb: Workbook, result: AnalyticsResult, subtitle: string, ranges: Ranges) {
  const b = result.branches
  const sheet = wb.addWorksheet('Branch Performance')
  setWidths(sheet, [26, 10, 15, 11, 15, 16, 16, 54])
  const full = span(1, 8)
  const view = result.filters.branchView === 'combined' ? 'Combined — reporting groups (e.g. Hamra + Discount) replace their members' : 'Separate branches'
  let row = sheetHeader(sheet, 'Branch performance', subtitle, full)
  row = note(sheet, row, `Branch view: ${view}. Source: ${b.basis}.`, full)
  row = note(sheet, row, 'Each branch appears once. Branch figures come from separate sources; their sum is not the brand total.', full)
  if (b.checkedRange) row = note(sheet, row, `Completeness checked against ${b.checkedRange.start} to ${b.checkedRange.end}. Missing figures are never assumed.`, full)
  const headerRow = row + 1
  const t = table(
    sheet,
    headerRow,
    [...GROUP_COLUMNS('Branch'), { header: 'Status', kind: 'center' }, { header: 'Notes', kind: 'wrap' }],
    [
      ...b.rows.map((r) => [r.label, r.currency, r.revenue, r.orders, r.averageOrderValue, r.share, r.status === 'incomplete' ? 'Incomplete data' : 'Complete', r.notes?.join(' · ')]),
      ...(b.missing ?? []).map((m) => [m.label, null, null, null, null, null, 'Incomplete data', m.reason]),
    ],
    {
      filter: true,
      cellStyle: (col, v) => {
        if (col === 0) return { color: PALETTE.ink }
        if (col === 6) return v === 'Complete' ? { color: PALETTE.positive, bold: true } : { color: PALETTE.warning, bold: true, fill: PALETTE.warningSoft }
        return undefined
      },
    },
  )
  for (let r = t.firstRow; r <= t.lastRow; r++) sheet.getCell(r, 1).font = font({ size: 11, bold: true, color: PALETTE.ink })
  shareBars(sheet, 'F', t.firstRow, t.firstRow + b.rows.length - 1)
  for (const c of [...new Set(b.rows.map((r) => r.currency))]) {
    const idx = branchIndexes(result, c)
    if (contiguous(idx)) ranges.branch.set(c, { firstRow: t.firstRow + idx[0], lastRow: t.firstRow + idx[idx.length - 1] })
  }
  row = t.nextRow

  for (const c of [...new Set(b.rows.map((r) => r.currency))]) {
    const rows = b.rows.filter((r) => r.currency === c)
    const revenue = rows.reduce((s, r) => s + r.revenue, 0)
    const orders = rows.every((r) => r.orders !== undefined) ? rows.reduce((s, r) => s + (r.orders ?? 0), 0) : undefined
    const brand = result.totals.byCurrency.find((t) => t.currency === c)
    row = table(
      sheet,
      row,
      [{ header: `Totals (${c})`, span: 2, kind: 'strong' }, { header: 'Revenue', kind: 'money' }, { header: 'Orders', kind: 'int' }, { header: 'AOV', kind: 'money' }],
      [
        ['Listed branches (each counted once)', revenue, orders, orders ? revenue / orders : undefined],
        ...(brand ? [['Brand total from sales exports', brand.revenue, brand.orders, brand.averageOrderValue]] : []),
      ],
      { totals: true, currencyOf: () => c, banded: false, rowStyle: (_, i) => (i === 1 ? { fill: PALETTE.accentSoft, color: PALETTE.ink } : undefined) },
    ).nextRow
  }

  for (const c of branchChartCurrencies(result)) {
    const r = ranges.branch.get(c)
    if (!r) continue
    const rows = b.rows.filter((x) => x.currency === c)
    row = section(sheet, row, `Revenue by branch (${c})`, span(1, 6))
    const height = Math.max(9, rows.length * 2 + 4)
    addChart(wb, branchChart(sheet.name, c, rows, r, { col: 1, row }, { col: 7, row: row + height }))
    row += height + 1
  }
  finishSheet(sheet, { tab: TAB.analysis, lastCol: 8, lastRow: row, freezeRow: headerRow, printTitleRow: headerRow })
}

function branchChart(sheet: string, currency: string, rows: GroupRow[], r: { firstRow: number; lastRow: number }, from: ChartSpec['from'], to: ChartSpec['to']): ChartSpec {
  return {
    sheet,
    type: 'bar',
    title: `Revenue by branch (${currency})`,
    from,
    to,
    categories: { sheet: 'Branch Performance', col: 1, ...r, values: rows.map((x) => x.label) },
    series: [{ name: `Revenue (${currency})`, range: { sheet: 'Branch Performance', col: 3, ...r }, values: rows.map((x) => x.revenue) }],
    valueFormat: '#,##0',
  }
}

function groupSheet(wb: Workbook, name: string, title: string, label: string, rows: GroupRow[], basis: string, subtitle: string) {
  const sheet = wb.addWorksheet(name)
  setWidths(sheet, [30, 10, 15, 11, 15, 16, 3, 10, 10, 10, 10, 10, 10, 10, 10])
  const currencies = [...new Set(rows.map((r) => r.currency))].filter((c) => {
    const idx = rows.map((r, i) => (r.currency === c ? i : -1)).filter((i) => i >= 0)
    return idx.length >= 2 && contiguous(idx)
  })
  const lastCol = currencies.length > 0 ? 15 : 6
  const full = span(1, Math.max(lastCol, 8))
  let row = sheetHeader(sheet, title, subtitle, full)
  row = note(sheet, row, `Source: ${basis}. Shares are calculated within each currency.`, full)
  const headerRow = row + 1
  const t = table(sheet, headerRow, GROUP_COLUMNS(label), groupRows(rows), { filter: true })
  shareBars(sheet, 'F', t.firstRow, t.lastRow)
  // Charts only when they compare two or more rows in one currency.
  let chartRow = headerRow
  for (const c of currencies) {
    const idx = rows.map((r, i) => (r.currency === c ? i : -1)).filter((i) => i >= 0)
    const range = { firstRow: t.firstRow + idx[0], lastRow: t.firstRow + idx[idx.length - 1] }
    const subset = rows.filter((r) => r.currency === c)
    addChart(wb, {
      sheet: name,
      type: 'column',
      title: `Revenue by ${label.toLowerCase()} (${c})`,
      from: { col: 8, row: chartRow },
      to: { col: 16, row: chartRow + 16 },
      categories: { sheet: name, col: 1, ...range, values: subset.map((r) => r.label) },
      series: [{ name: `Revenue (${c})`, range: { sheet: name, col: 3, ...range }, values: subset.map((r) => r.revenue) }],
      valueFormat: '#,##0',
    })
    chartRow += 17
  }
  finishSheet(sheet, { tab: TAB.analysis, lastCol: full.to, lastRow: Math.max(t.lastRow, chartRow), freezeRow: headerRow, printTitleRow: headerRow })
}

export interface ReportOptions {
  title: string
  generatedAt: Date
  settings: ReportingSettings
  /** Customer names are personal data; off by default (anonymised IDs are used). */
  includeCustomerNames?: boolean
}

interface PendingChart {
  kind: 'daily' | 'branch'
  currency: string
  from: ChartSpec['from']
  to: ChartSpec['to']
}

/** Executive Summary — management dashboard. Charts reference the Daily Sales and Branch sheets. */
function executiveSummary(wb: Workbook, result: AnalyticsResult, options: ReportOptions, range: string): PendingChart[] {
  const s = wb.addWorksheet('Executive Summary')
  setWidths(s, [2.5, 17, 17, 17, 17, 17, 17, 2.5])
  const body = span(2, 7)
  const pending: PendingChart[] = []

  // Branded header band
  const brands = [...new Set(result.datasetsInScope.map((d) => d.metadata.brandId))].map((id) => BRANDS[id].name)
  const company = brands.length > 0 ? brands.join(' & ') : 'No brand in scope'
  const period = result.dateRange ? `${prettyDate(result.dateRange.start)} – ${prettyDate(result.dateRange.end)}` : range
  const generated = options.generatedAt.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const bandRows: [number, number][] = [
    [1, 10],
    [2, 34],
    [3, 20],
    [4, 18],
    [5, 10],
  ]
  for (const [r, h] of bandRows) {
    s.getRow(r).height = h
    for (let c = 1; c <= 8; c++) s.getCell(r, c).fill = solid(PALETTE.ink)
  }
  for (const r of [2, 3, 4]) s.mergeCells(r, 2, r, 7)
  s.getCell(2, 2).value = options.title
  s.getCell(2, 2).font = font({ size: 20, bold: true, color: PALETTE.white })
  s.getCell(2, 2).alignment = { vertical: 'middle' }
  s.getCell(3, 2).value = `${company}  ·  Reporting period: ${period}`
  s.getCell(3, 2).font = font({ size: 11, color: PALETTE.subtitle })
  s.getCell(3, 2).alignment = { vertical: 'middle' }
  s.getCell(4, 2).value = `Generated ${generated}  ·  Calculated locally from imported exports`
  s.getCell(4, 2).font = font({ size: 9, color: PALETTE.faint })
  s.getCell(4, 2).alignment = { vertical: 'middle' }
  for (let c = 1; c <= 8; c++) s.getCell(6, c).fill = solid(PALETTE.accent)
  s.getRow(6).height = 4
  s.getRow(7).height = 12
  let row = 8

  // KPI cards
  row = section(s, row, 'Key metrics', body)
  if (result.totals.byCurrency.length === 0) {
    row = note(s, row, 'No sales totals are available in this scope.', body) + 1
  }
  const cardSpans = [span(2, 3), span(4, 5), span(6, 7)]
  const single = result.totals.byCurrency.length === 1
  for (const c of result.totals.byCurrency) {
    const cmp = result.comparison?.hasPreviousData ? result.comparison : undefined
    const revChange = cmp?.revenue.find((r) => r.currency === c.currency)?.change
    const ordChange = single ? cmp?.orders.change : undefined
    row = kpiCards(
      s,
      row,
      [
        {
          label: `Total revenue (${c.currency})`,
          value: c.revenue,
          format: moneyFormat(c.currency),
          sub: revChange !== undefined ? `${pctChange(revChange)} vs previous period` : `Sales exports · ${range}`,
          subTone: revChange === undefined || revChange === 0 ? 'muted' : revChange > 0 ? 'positive' : 'negative',
        },
        {
          label: single ? 'Total orders' : `Orders (${c.currency})`,
          value: c.orders,
          format: FMT.int,
          sub: ordChange !== undefined ? `${pctChange(ordChange)} vs previous period` : describeOrderBasis(result.totals.orderBasis),
          subTone: ordChange === undefined || ordChange === 0 ? 'muted' : ordChange > 0 ? 'positive' : 'negative',
        },
        { label: `Average order value (${c.currency})`, value: c.averageOrderValue, format: moneyFormat(c.currency), sub: 'Revenue ÷ orders (weighted)' },
      ],
      cardSpans,
    )
  }
  if (result.totals.byCurrency.length > 0) {
    if (result.totals.orders !== undefined) row = note(s, row, `Total orders across all currencies: ${result.totals.orders.toLocaleString('en-US')}.`, body)
    if (result.totals.converted) row = note(s, row, `Combined revenue: ${result.totals.converted.currency} ${result.totals.converted.revenue.toFixed(2)} — ${result.totals.converted.note}.`, body)
    row++
  }

  if (result.comparison?.hasPreviousData) {
    const c = result.comparison
    row = section(s, row, `Comparison: ${c.current.start} – ${c.current.end} vs ${c.previous.start} – ${c.previous.end}`, body)
    row = table(
      s,
      row,
      [
        { header: 'Metric', span: 3, kind: 'strong' },
        { header: 'Current period', kind: 'money' },
        { header: 'Previous period', kind: 'money' },
        { header: 'Change', kind: 'signedPct' },
      ],
      [...c.revenue.map((r) => [`Revenue (${r.currency})`, r.current, r.previous, r.change]), ['Orders', c.orders.current, c.orders.previous, c.orders.change]],
      {
        startCol: 2,
        currencyOf: (_, i) => c.revenue[i]?.currency,
        rowStyle: (_, i) => (i === c.revenue.length ? { numFmt: FMT.int } : undefined),
        cellStyle: (col, v) => (col === 3 ? { ...toneOf(v as number), numFmt: FMT.signedPct } : undefined),
      },
    ).nextRow
  }

  // Charts (space reserved here; series are bound to the source sheets once they exist)
  if (dailyChartable(result)) {
    const cur = dailyCurrencies(result)[0]
    row = section(s, row, `Daily revenue trend (${cur})`, body)
    pending.push({ kind: 'daily', currency: cur, from: { col: 2, row }, to: { col: 8, row: row + 16 } })
    row += 17
  }
  for (const c of branchChartCurrencies(result)) {
    const n = branchIndexes(result, c).length
    const h = Math.max(9, n * 2 + 4)
    row = section(s, row, `Revenue by branch (${c})`, body)
    pending.push({ kind: 'branch', currency: c, from: { col: 2, row }, to: { col: 8, row: row + h } })
    row += h + 1
  }

  if (result.extremes.length > 0) {
    row = section(s, row, 'Sales highlights', body)
    row = table(
      s,
      row,
      [
        { header: 'Measure', span: 3, kind: 'strong' },
        { header: 'Date', kind: 'day' },
        { header: 'Revenue', kind: 'money' },
        { header: 'Orders', kind: 'int' },
      ],
      result.extremes.flatMap((e) => [
        [`Highest sales day (${e.currency})`, e.highest.date, e.highest.revenue, e.highest.orders],
        [`Lowest sales day (${e.currency})`, e.lowest.date, e.lowest.revenue, e.lowest.orders],
      ]),
      {
        startCol: 2,
        currencyOf: (_, i) => result.extremes[Math.floor(i / 2)].currency,
        cellStyle: (col, _v, _r, i) => (col === 0 ? { color: i % 2 === 0 ? PALETTE.positive : PALETTE.negative } : undefined),
      },
    ).nextRow
  }

  const ca = result.customerActivity
  if (ca.daily.length > 0) {
    row = section(s, row, `Customer activity (${ca.range?.start} to ${ca.range?.end})`, body)
    row = table(s, row, [{ header: 'Measure', span: 4, kind: 'strong' }, { header: 'Total', span: 2, kind: 'int' }], [
      ['New registrations', ca.totals.newRegistrations],
      ['New customers', ca.totals.newCustomers],
      ['Returning customer-days (sum of daily counts)', ca.totals.returningCustomerDays],
    ], { startCol: 2 }).lastRow + 1
    row = note(s, row, 'Returning customer-days are not distinct customers, and customer activity is not an order count.', body) + 1
  }

  const productTotals: Record<string, number> = {}
  for (const p of result.products) for (const [c, v] of Object.entries(p.revenueByCurrency)) productTotals[c] = (productTotals[c] ?? 0) + v
  if (result.products.length > 0 || result.customers.count > 0) {
    row = section(s, row, 'Separate measures (not added to sales revenue)', body)
    row = table(s, row, [{ header: 'Measure', span: 3, kind: 'strong' }, { header: 'Value', span: 3 }], [
      ...(result.products.length > 0 ? [['Products in export', `${result.products.length} products, ${result.products.reduce((a, p) => a + p.quantity, 0).toLocaleString('en-US')} items sold`]] : []),
      ...Object.entries(productTotals).map(([c, v]) => [`Product amounts (${c})`, `${c} ${v.toLocaleString('en-US')}`]),
      ...(result.customers.count > 0 ? [['Customers in top-customers export', `${result.customers.count}`]] : []),
      ...Object.entries(result.customers.spendByCurrency).map(([c, v]) => [`Customer spend (${c})`, `${c} ${v.toLocaleString('en-US')}`]),
    ], { startCol: 2 }).nextRow
  }

  row = section(s, row, 'Key findings', body)
  if (result.insights.length === 0) {
    row = note(s, row, 'No findings could be calculated from the available data.', body) + 1
  } else {
    const tones = { positive: PALETTE.positive, negative: PALETTE.negative, warning: PALETTE.warning, neutral: PALETTE.ink }
    row = table(s, row, [{ header: 'Finding', span: 2, kind: 'strong' }, { header: 'Detail', span: 4, kind: 'wrap' }], result.insights.map((i) => [i.title, i.detail]), {
      startCol: 2,
      cellStyle: (col, _v, _r, i) => (col === 0 ? { color: tones[result.insights[i].tone] ?? PALETTE.ink } : undefined),
    }).nextRow
  }

  const warnings = result.quality.filter((q) => q.level !== 'info')
  if (warnings.length > 0) {
    row = section(s, row, 'Important warnings', body)
    row = table(s, row, [{ header: 'Level', kind: 'center' }, { header: 'Warning', span: 5, kind: 'wrap' }], warnings.map((w) => [w.level.toUpperCase(), w.message]), {
      startCol: 2,
      banded: false,
      cellStyle: (col, v) => (col === 0 ? levelStyle(String(v)) : undefined),
      rowStyle: (r) => rowTint(String(r[0])),
    }).nextRow
  }

  row = section(s, row, 'Reporting scope', body)
  row = table(s, row, [{ header: 'Item', span: 2, kind: 'strong' }, { header: 'Value', span: 4, kind: 'wrap' }], [
    ['Filters', describeFilters(result.filters)],
    ['Date range', range],
    ['Datasets used', result.datasetsInScope.length],
    ['Order count basis', describeOrderBasis(result.totals.orderBasis)],
    ['Branch view', result.filters.branchView === 'combined' ? 'Combined reporting groups (e.g. Hamra + Discount)' : 'Separate branches'],
    ...result.sourceBasis.map((b) => [`Totals source: ${BRANDS[b.brandId].name} · ${PLATFORMS[b.platformId].name} (${b.country})`, `${CATEGORIES[b.category].name} (${b.datasets} file(s))`]),
  ], { startCol: 2, cellStyle: (col, v) => (col === 1 && typeof v === 'number' ? { numFmt: FMT.int } : undefined) }).nextRow

  finishSheet(s, { tab: TAB.summary, lastCol: 8, lastRow: row, orientation: 'portrait' })
  return pending
}

export async function buildAnalyticalWorkbook(result: AnalyticsResult, options: ReportOptions): Promise<Workbook> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Ginger & Co Analytics'
  wb.created = options.generatedAt

  const range = result.dateRange ? `${result.dateRange.start} to ${result.dateRange.end}` : 'All available dates'
  const subtitle = `${describeFilters(result.filters)} · ${range}`
  const ranges: Ranges = { branch: new Map() }

  // 1. Executive Summary
  const pending = executiveSummary(wb, result, options, range)

  // 2. Daily Sales
  if (result.daily.length > 0) {
    const s = wb.addWorksheet('Daily Sales')
    setWidths(s, [22, 10, 15, 15, 15, 12, 14, 15, 16, 10, 10, 10, 10, 10])
    const chart = dailyChartable(result)
    const full = span(1, chart ? 14 : 9)
    let row = sheetHeader(s, 'Daily sales', subtitle, full)
    if (result.extremes.length > 0) row = note(s, row, 'Highlighted rows: highest sales day (green) and lowest sales day (red) for each currency.', span(1, 5))
    const headerRow = row + 1
    const t = table(
      s,
      headerRow,
      [
        { header: 'Date', kind: 'day' },
        { header: 'Currency', kind: 'center' },
        { header: 'Revenue', kind: 'money' },
        { header: 'Orders', kind: 'int' },
        { header: 'Avg order value', kind: 'money' },
      ],
      result.daily.map((d) => [d.date, d.currency, d.revenue, d.orders, d.orders ? d.revenue / d.orders : undefined]),
      { filter: true },
    )
    if (result.extremes.length > 0) {
      const at = (iso: string) => `DATE(${iso.slice(0, 4)},${Number(iso.slice(5, 7))},${Number(iso.slice(8, 10))})`
      const cond = (iso: string, cur: string) => `AND($A${t.firstRow}=${at(iso)},$B${t.firstRow}="${cur.replace(/"/g, '""')}")`
      s.addConditionalFormatting({
        ref: `A${t.firstRow}:E${t.lastRow}`,
        rules: result.extremes.flatMap((e, i) => [
          { type: 'expression', priority: 2 * i + 1, formulae: [cond(e.highest.date, e.currency)], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: `FF${PALETTE.positiveSoft}` } }, font: { bold: true, color: { argb: `FF${PALETTE.positive}` } } } },
          { type: 'expression', priority: 2 * i + 2, formulae: [cond(e.lowest.date, e.currency)], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: `FF${PALETTE.negativeSoft}` } }, font: { bold: true, color: { argb: `FF${PALETTE.negative}` } } } },
        ]),
      })
    }
    if (chart) {
      ranges.daily = { firstRow: t.firstRow, lastRow: t.lastRow }
      const cur = dailyCurrencies(result)[0]
      addChart(wb, dailyChart('Daily Sales', cur, result, ranges.daily, { col: 7, row: headerRow }, { col: 15, row: headerRow + 18 }))
    }

    const periodCols: Column[] = [
      { header: 'Period', kind: 'strong' },
      { header: 'Currency', kind: 'center' },
      { header: 'Days with data', kind: 'int' },
      { header: 'Revenue', kind: 'money' },
      { header: 'Revenue change', kind: 'signedPct' },
      { header: 'Orders', kind: 'int' },
      { header: 'Orders change', kind: 'signedPct' },
      { header: 'Avg order value', kind: 'money' },
      { header: 'Note' },
    ]
    const periodRows = (rows: PeriodRow[], weekly: boolean) =>
      rows.map((r) => [weekly ? `${r.start} to ${r.end}` : r.key, r.currency, r.days, r.revenue, r.revenueChange, r.orders, r.ordersChange, r.averageOrderValue, r.partial ? 'Partial period' : ''])
    const changeTone = (col: number, v: CellValue) => (col === 4 || col === 6 ? toneOf(v as number) : col === 8 && v ? { color: PALETTE.warning } : undefined)
    let next = Math.max(t.nextRow, chart ? headerRow + 20 : 0)
    next = section(s, next, 'Weekly comparison (Monday to Sunday)', span(1, 9))
    next = table(s, next, periodCols, periodRows(result.weekly, true), { cellStyle: changeTone }).nextRow
    next = section(s, next, 'Monthly comparison', span(1, 9))
    next = table(s, next, periodCols, periodRows(result.monthly, false), { cellStyle: changeTone }).nextRow
    next = note(s, next - 1, 'Average order value = revenue / orders (weighted). Daily rows are days, not individual orders.', span(1, 9))
    finishSheet(s, { tab: TAB.analysis, lastCol: full.to, lastRow: next, freezeRow: headerRow, printTitleRow: headerRow })
  }

  // 3. Branch Performance
  if (result.branches.rows.length > 0) branchSheet(wb, result, subtitle, ranges)

  // 4. Platform Performance
  if (result.platforms.rows.length > 0) groupSheet(wb, 'Platform Performance', 'Platform performance', 'Brand · Platform', result.platforms.rows, result.platforms.basis, subtitle)

  // 5. Product Rankings
  if (result.products.length > 0) {
    const s = wb.addWorksheet('Product Rankings')
    const productSets = result.datasetsInScope.filter((d) => d.metadata.category === 'products')
    const periods = [...new Set(productSets.map((d) => `${d.metadata.periodStart} to ${d.metadata.periodEnd}`))].join(', ')
    const currencies = [...new Set(result.products.flatMap((p) => Object.keys(p.revenueByCurrency)))].sort()
    const tableCols = 5 + currencies.length * 2
    setWidths(s, [8, 34, 11, 11, 12, ...currencies.flatMap(() => [15, 15])])
    const chartCol = tableCols + 2
    for (let c = tableCols + 1; c < chartCol + 8; c++) s.getColumn(c).width = c === tableCols + 1 ? 3 : 10
    const full = span(1, chartCol + 7)
    let row = sheetHeader(s, 'Product rankings', `${describeFilters(result.filters)} · product export period: ${periods || 'not set'}`, full)
    row = note(s, row, 'Source: product exports. Amounts are shown as exported and are not added to sales revenue. Top 10 by items sold are highlighted. "Share of product amount" is each product\'s part of the total product amount in that currency.', span(1, tableCols))
    const headerRow = row + 1
    const t = table(
      s,
      headerRow,
      [
        { header: 'Rank (items)', kind: 'center' },
        { header: 'Product', kind: 'strong' },
        { header: 'Product ID', kind: 'center' },
        { header: 'Items sold', kind: 'int' },
        { header: 'Share of items', kind: 'pct' },
        ...currencies.flatMap((c): Column[] => [
          { header: `Amount (${c})`, kind: 'money' },
          { header: `Share of product amount (${c})`, kind: 'pct' },
        ]),
      ],
      result.products.map((p, i) => [i + 1, p.product, p.productId, p.quantity, p.quantityShare, ...currencies.flatMap((c) => [p.revenueByCurrency[c], p.revenueShareByCurrency[c]])]),
      {
        filter: true,
        currencyOf: () => (currencies.length === 1 ? currencies[0] : undefined),
        rowStyle: (_, i) => (i < 10 ? { fill: PALETTE.accentSoft } : undefined),
        cellStyle: (col, _v, _r, i) => (col === 0 ? (i < 10 ? { bold: true, color: PALETTE.accentDark, numFmt: FMT.int } : { color: PALETTE.muted, numFmt: FMT.int }) : undefined),
      },
    )
    if (currencies.length > 1) {
      // Several currencies: each amount column carries its own currency code.
      currencies.forEach((c, k) => {
        const col = 6 + k * 2
        for (let r = t.firstRow; r <= t.lastRow; r++) if (typeof s.getCell(r, col).value === 'number') s.getCell(r, col).numFmt = moneyFormat(c)
      })
    }
    s.addConditionalFormatting({
      ref: `D${t.firstRow}:D${t.lastRow}`,
      rules: [{ type: 'dataBar', priority: 1, gradient: false, cfvo: [{ type: 'num', value: 0 }, { type: 'max' }], color: { argb: `FF${PALETTE.accentBar}` } } as never],
    })
    const top = result.products.slice(0, 10)
    if (top.length >= 2) {
      const r = { firstRow: t.firstRow, lastRow: t.firstRow + top.length - 1 }
      addChart(wb, {
        sheet: 'Product Rankings',
        type: 'bar',
        title: `Top ${top.length} products by items sold`,
        from: { col: chartCol, row: headerRow },
        to: { col: chartCol + 8, row: headerRow + 24 },
        categories: { sheet: 'Product Rankings', col: 2, ...r, values: top.map((p) => p.product) },
        series: [{ name: 'Items sold', range: { sheet: 'Product Rankings', col: 4, ...r }, values: top.map((p) => p.quantity) }],
        valueFormat: '#,##0',
      })
    }
    row = Math.max(t.nextRow, headerRow + 26)
    for (const c of currencies) {
      row = section(s, row, `Top 20 by amount (${c})`, span(1, 6))
      const byRevenue = [...result.products]
        .filter((p) => p.revenueByCurrency[c] !== undefined)
        .sort((a, b) => (b.revenueByCurrency[c] ?? 0) - (a.revenueByCurrency[c] ?? 0))
        .slice(0, 20)
      row = table(
        s,
        row,
        [
          { header: 'Rank (amount)', kind: 'center' },
          { header: 'Product', kind: 'strong' },
          { header: 'Product ID', kind: 'center' },
          { header: 'Items sold', kind: 'int' },
          { header: `Amount (${c})`, kind: 'money' },
          { header: 'Share of product amount', kind: 'pct' },
        ],
        byRevenue.map((p, i) => [i + 1, p.product, p.productId, p.quantity, p.revenueByCurrency[c], p.revenueShareByCurrency[c]]),
        { currencyOf: () => c, cellStyle: (col) => (col === 0 ? { bold: true, color: PALETTE.accentDark, numFmt: FMT.int } : undefined) },
      ).nextRow
    }
    finishSheet(s, { tab: TAB.analysis, lastCol: full.to, lastRow: row, freezeRow: headerRow, printTitleRow: headerRow })
  }

  // Customer Activity
  if (result.customerActivity.daily.length > 0) {
    const s = wb.addWorksheet('Customer Activity')
    const ca = result.customerActivity
    setWidths(s, [20, 18, 16, 22, 10, 10, 10, 10])
    const full = span(1, 8)
    let row = sheetHeader(s, 'Daily customer activity', `${describeFilters(result.filters)} · ${ca.range?.start} to ${ca.range?.end}`, full)
    row = note(s, row, 'Returning customers are daily counts: their total is not the number of distinct returning customers. Customer activity is not an order count.', full)
    const headerRow = row + 1
    const t = table(
      s,
      headerRow,
      [
        { header: 'Date', kind: 'day' },
        { header: 'New registrations', kind: 'int' },
        { header: 'New customers', kind: 'int' },
        { header: 'Returning customers', kind: 'int' },
      ],
      ca.daily.map((d) => [d.date, d.newRegistrations, d.newCustomers, d.returningCustomers]),
      { filter: true },
    )
    const totals = table(
      s,
      t.nextRow,
      [
        { header: 'Period total', kind: 'strong' },
        { header: 'New registrations', kind: 'int' },
        { header: 'New customers', kind: 'int' },
        { header: 'Returning customer-days', kind: 'int' },
      ],
      [['Total', ca.totals.newRegistrations, ca.totals.newCustomers, ca.totals.returningCustomerDays]],
      { totals: true },
    )
    finishSheet(s, { tab: TAB.customers, lastCol: 8, lastRow: totals.lastRow, freezeRow: headerRow, printTitleRow: headerRow, orientation: 'portrait' })
  }

  // Customer Insights
  if (result.customers.count > 0) {
    const s = wb.addWorksheet('Customer Insights')
    const cust = result.customers
    const names = options.includeCustomerNames === true
    const custSets = result.datasetsInScope.filter((d) => d.metadata.category === 'customers')
    const periods = [...new Set(custSets.map((d) => `${d.metadata.periodStart} to ${d.metadata.periodEnd}`))].join(', ')
    setWidths(s, [8, 26, 16, 10, 20, 20, 10, 10])
    const full = span(1, 8)
    let row = sheetHeader(s, 'Customer insights', `${describeFilters(result.filters)} · top-customers export period: ${periods || 'not set'}`, full)
    row = note(s, row, names ? 'Contains customer names (personal data), included at your request. Handle accordingly.' : 'Customers are shown as anonymised IDs. Names are not included.', full, names ? 'warning' : 'muted')
    row = note(s, row, 'Customer spend comes from the top-customers export and is not added to sales revenue.', full) + 1
    const label = (r: (typeof cust.rows)[number]) => (names && r.name ? r.name : r.anonId)
    row = table(s, row, [{ header: 'Measure', span: 2, kind: 'strong' }, { header: 'Value', span: 2, kind: 'int' }], [
      ['Customers', cust.count],
      ...Object.entries(cust.spendByCurrency).map(([c, v]) => [`Total spend (${c})`, `${c} ${v.toLocaleString('en-US')}`]),
      ...(cust.totalOrders !== undefined ? [['Total orders', cust.totalOrders]] : []),
    ]).nextRow
    const custCols = (c: string): Column[] => [
      { header: 'Rank', kind: 'center' },
      { header: names ? 'Customer' : 'Customer (anonymised)', kind: 'strong' },
      { header: `Spend (${c})`, kind: 'money' },
      { header: 'Orders', kind: 'int' },
      { header: 'Avg order (calculated)', kind: 'money' },
      { header: 'Avg order (as exported)', kind: 'money' },
    ]
    const rankStyle = (col: number): CellStyle | undefined => (col === 0 ? { bold: true, color: PALETTE.accentDark, numFmt: FMT.int } : undefined)
    for (const c of Object.keys(cust.spendByCurrency).sort()) {
      const rows = cust.rows.filter((r) => r.currency === c)
      row = section(s, row, `Top 20 customers by spending (${c})`, span(1, 6))
      row = table(s, row, custCols(c), rows.slice(0, 20).map((r, i) => [i + 1, label(r), r.spend, r.orders, r.averageOrderValue, r.exportedAverage]), { currencyOf: () => c, cellStyle: rankStyle }).nextRow
      row = section(s, row, `Top 20 customers by orders (${c})`, span(1, 6))
      const byOrders = [...rows].sort((a, b) => (b.orders ?? 0) - (a.orders ?? 0) || b.spend - a.spend).slice(0, 20)
      row = table(s, row, custCols(c), byOrders.map((r, i) => [i + 1, label(r), r.spend, r.orders, r.averageOrderValue, r.exportedAverage]), { currencyOf: () => c, cellStyle: rankStyle }).nextRow
    }
    for (const d of cust.spendDistribution) {
      row = section(s, row, `Spending distribution (${d.currency})`, span(1, 6))
      row = table(s, row, [{ header: 'Total spend', span: 2, kind: 'strong' }, { header: 'Customers', kind: 'int' }], d.buckets.map((b) => [b.label, b.count])).nextRow
    }
    if (cust.frequencyDistribution.length > 0) {
      row = section(s, row, 'Order frequency distribution', span(1, 6))
      row = table(s, row, [{ header: 'Orders placed', span: 2, kind: 'strong' }, { header: 'Customers', kind: 'int' }], cust.frequencyDistribution.map((b) => [b.label, b.count])).nextRow
    }
    finishSheet(s, { tab: TAB.customers, lastCol: 8, lastRow: row, orientation: 'portrait' })
  }

  // 6. Delivery & Pickup
  if (result.channels.rows.length > 0) groupSheet(wb, 'Delivery & Pickup', 'Sales by channel', 'Sales channel', result.channels.rows, result.channels.basis, subtitle)

  // 7. Customer Feedback
  if (result.ratings.count > 0) {
    const s = wb.addWorksheet('Customer Feedback')
    setWidths(s, [30, 16, 12, 10, 10, 10, 10, 10])
    const full = span(1, 8)
    let row = sheetHeader(s, 'Customer feedback', subtitle, full)
    row = table(s, row, [{ header: 'Measure', kind: 'strong' }, { header: 'Value', kind: 'dec2' }], [
      ['Ratings received', result.ratings.count],
      ['Average rating', result.ratings.average],
      ...(options.settings.lowRatingThreshold !== null ? [['Low-rating threshold (your setting)', options.settings.lowRatingThreshold]] : []),
    ], { rowStyle: (_, i) => (i === 0 ? { numFmt: FMT.int } : undefined) }).nextRow
    row = section(s, row, 'Rating distribution', span(1, 3))
    row = table(s, row, [{ header: 'Rating (rounded)', kind: 'center' }, { header: 'Count', kind: 'int' }], result.ratings.distribution.map((d) => [d.rating, d.count])).nextRow
    if (result.ratings.byBranch.length > 0) {
      row = section(s, row, 'By branch', span(1, 3))
      row = table(s, row, [{ header: 'Branch', kind: 'strong' }, { header: 'Average', kind: 'dec2' }, { header: 'Ratings', kind: 'int' }], result.ratings.byBranch.map((b) => [b.branch, b.average, b.count])).nextRow
    }
    row = section(s, row, 'By source', span(1, 3))
    row = table(
      s,
      row,
      [{ header: 'Brand · Platform', kind: 'strong' }, { header: 'Average', kind: 'dec2' }, { header: 'Ratings', kind: 'int' }],
      result.ratings.byPlatform.map((p) => [`${BRANDS[p.brandId].name} · ${PLATFORMS[p.platformId].name}`, p.average, p.count]),
    ).nextRow
    row = note(s, row - 1, 'Free-text comments are not included in this export.', full)
    finishSheet(s, { tab: TAB.customers, lastCol: 8, lastRow: row, orientation: 'portrait' })
  }

  // 8. Data Quality
  {
    const s = wb.addWorksheet('Data Quality')
    setWidths(s, [14, 34, 12, 16, 18, 14, 14, 14, 16, 24, 24, 26, 30])
    const full = span(1, 13)
    const text = span(1, 7)
    let row = sheetHeader(s, 'Data quality and method', subtitle, full)
    row = section(s, row, 'Notes', text)
    if (result.quality.length > 0) {
      row = note(s, row, `${qualityCounts(result.quality)}. Warnings are listed in full and are never adjusted away.`, text)
      row = table(s, row + 1, [{ header: 'Level', kind: 'center' }, { header: 'Note', span: 6, kind: 'wrap' }], result.quality.map((q) => [q.level.toUpperCase(), q.message]), {
        banded: false,
        cellStyle: (col, v) => (col === 0 ? levelStyle(String(v)) : undefined),
        rowStyle: (r) => rowTint(String(r[0])),
      }).nextRow
    } else {
      row = note(s, row, 'No data-quality issues were detected.', text) + 1
    }

    const p = options.settings
    row = section(s, row, 'Reporting policy (your settings)', text)
    row = table(s, row, [{ header: 'Rule', span: 2, kind: 'strong' }, { header: 'Setting', span: 5, kind: 'wrap' }], [
      ['Cancelled status values', p.cancelledStatuses.join(', ') || 'None configured'],
      ['Cancelled orders', p.cancelledTreatment === 'exclude' ? 'Excluded from totals' : 'Included in totals'],
      ['Refunded status values', p.refundedStatuses.join(', ') || 'None configured'],
      ['Refunded orders', p.refundedTreatment === 'exclude' ? 'Excluded from totals' : 'Included in totals'],
      ['Exchange rates', p.exchangeRates.map((r) => `1 ${r.from} = ${r.rate} ${r.to}`).join(', ') || 'None — currencies reported separately'],
      ['Low-rating threshold', p.lowRatingThreshold === null ? 'Not set' : String(p.lowRatingThreshold)],
      ['Double-counting rule', 'Per source, only the most detailed export type is added to totals (Orders, then Sales summary, then Delivery/pickup, then Branch performance). Duplicate Order IDs are counted once.'],
      ['Rows vs orders', `${result.totals.rowCount.toLocaleString('en-US')} rows contributed to totals; ${describeOrderBasis(result.totals.orderBasis).toLowerCase()}.`],
    ]).nextRow

    if (result.reconciliation.length > 0) {
      row = section(s, row, 'Reconciliation between exports (reported, not adjusted)', span(1, 11))
      row = table(
        s,
        row,
        [
          { header: 'Brand', kind: 'strong' },
          { header: 'Compared export', kind: 'wrap' },
          { header: 'Currency', kind: 'center' },
          { header: 'Export amount', kind: 'money' },
          { header: 'Daily sales revenue', kind: 'money' },
          { header: 'Difference', kind: 'money' },
          { header: 'Difference %', kind: 'signedPct' },
          { header: 'Export orders', kind: 'int' },
          { header: 'Daily sales orders', kind: 'int' },
          { header: 'Export period' },
          { header: 'Sales period' },
        ],
        result.reconciliation.map((r) => [
          BRANDS[r.brandId].name,
          `${r.source}: ${r.fileName}`,
          r.currency,
          r.otherAmount,
          r.salesRevenue,
          r.difference,
          r.ratio,
          r.otherOrders,
          r.salesOrders,
          r.period,
          r.salesPeriod,
        ]),
        { cellStyle: (col, v) => ((col === 5 || col === 6) && typeof v === 'number' && v !== 0 ? { color: PALETTE.warning, bold: true, fill: PALETTE.warningSoft } : undefined) },
      ).nextRow
    }

    row = section(s, row, 'Source files in scope', full)
    row = table(
      s,
      row,
      [
        { header: 'File', span: 2, kind: 'wrap' },
        { header: 'Sheet' },
        { header: 'Brand' },
        { header: 'Platform' },
        { header: 'Country' },
        { header: 'Report type', kind: 'wrap' },
        { header: 'Currency', kind: 'center' },
        { header: 'Period', kind: 'wrap' },
        { header: 'Rows imported', kind: 'int' },
        { header: 'Rows skipped', kind: 'int' },
        { header: 'Detected format', kind: 'wrap' },
        { header: 'Branch scope', kind: 'wrap' },
      ],
      result.datasetsInScope.map((d) => [
        d.source.fileName,
        d.source.sheetName,
        BRANDS[d.metadata.brandId].name,
        PLATFORMS[d.metadata.platformId].name,
        d.metadata.country,
        CATEGORIES[d.metadata.category].name,
        d.metadata.currency || '(per row)',
        `${d.stats.minDate ?? d.metadata.periodStart} → ${d.stats.maxDate ?? d.metadata.periodEnd}`,
        d.stats.importedRows,
        d.stats.skippedRows,
        getExportFormat(d.metadata.formatId)?.name ?? 'Manual mapping',
        d.mapping.branch
          ? 'From branch column'
          : d.metadata.branchScope?.mode === 'all'
            ? 'All selected branches (combined)'
            : d.metadata.branchScope
              ? d.metadata.branchScope.branches.join(', ')
              : '—',
      ]),
      { cellStyle: (col, v) => (col === 9 && typeof v === 'number' && v > 0 ? { color: PALETTE.warning, bold: true } : undefined) },
    ).nextRow
    finishSheet(s, { tab: TAB.quality, lastCol: 13, lastRow: row })
  }

  // 9. Cleaned Data
  if (result.records.length > 0) {
    const s = wb.addWorksheet('Cleaned Data')
    const fileNames = new Map(result.datasetsInScope.map((d) => [d.id, d.source.fileName]))
    const fields = (Object.keys(FIELDS) as StandardField[]).filter((f) => !FIELDS[f].sensitive && f !== 'currency' && result.records.some((r) => r[f] !== undefined))
    const hasCustomers = result.records.some((r) => r.customerId)
    const integerField = (f: StandardField) => result.records.every((r) => r[f] === undefined || Number.isInteger(r[f]))
    const kindOf = (f: StandardField): Column['kind'] => {
      if (FIELDS[f].type === 'date') return 'date'
      if (FIELDS[f].type !== 'number') return 'text'
      if (f === 'revenue' || f === 'averageOrderValue') return 'money'
      return integerField(f) ? 'int' : 'dec2'
    }
    const columns: Column[] = [
      { header: 'Brand' },
      { header: 'Platform' },
      { header: 'Country' },
      { header: 'Report type' },
      { header: 'Source file' },
      { header: 'Currency', kind: 'center' },
      ...(hasCustomers ? [{ header: 'Customer (anonymised)' }] : []),
      ...fields.map((f) => ({ header: FIELDS[f].label, kind: kindOf(f) })),
    ]
    const rows = result.records.map((r) => [
      BRANDS[r.brandId].name,
      PLATFORMS[r.platformId].name,
      r.country,
      CATEGORIES[r.category].name,
      fileNames.get(r.datasetId),
      r.currencyCode,
      ...(hasCustomers ? [r.customerId ? anonymiseCustomer(r.customerId) : undefined] : []),
      ...fields.map((f) => r[f]),
    ])
    // Widths from content (sampled), kept between 9 and 34 characters.
    setWidths(
      s,
      columns.map((c, i) => {
        if (c.kind === 'date') return 14
        let w = c.header.length + 4
        for (const r of rows.slice(0, 400)) {
          const v = r[i]
          const len = typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }).length + (c.kind === 'money' ? 6 : 2) : String(v ?? '').length + 2
          if (len > w) w = len
        }
        return Math.min(34, Math.max(10, w))
      }),
    )
    const full = span(1, Math.max(columns.length, 8))
    const row = sheetHeader(s, 'Cleaned data', `${subtitle} · after filters and reporting policy · personal / free-text fields omitted`, full)
    const headerRow = row
    const t = table(s, headerRow, columns, rows.map((r) => r.map((v) => asDate(v as CellValue))), { filter: true })
    finishSheet(s, { tab: TAB.data, lastCol: full.to, lastRow: t.lastRow, freezeRow: headerRow, printTitleRow: headerRow })
  }

  // Executive Summary charts, bound to the ranges written above.
  for (const p of pending) {
    if (p.kind === 'daily' && ranges.daily) addChart(wb, dailyChart('Executive Summary', p.currency, result, ranges.daily, p.from, p.to))
    if (p.kind === 'branch') {
      const r = ranges.branch.get(p.currency)
      if (r) addChart(wb, { ...branchChart('Executive Summary', p.currency, result.branches.rows.filter((x) => x.currency === p.currency), r, p.from, p.to) })
    }
  }

  return wb
}

function dailyChart(sheet: string, currency: string, result: AnalyticsResult, r: { firstRow: number; lastRow: number }, from: ChartSpec['from'], to: ChartSpec['to']): ChartSpec {
  return {
    sheet,
    type: 'line',
    title: `Daily revenue (${currency})`,
    from,
    to,
    categories: { sheet: 'Daily Sales', col: 1, ...r, values: result.daily.map((d) => d.date), dates: true },
    series: [{ name: `Revenue (${currency})`, range: { sheet: 'Daily Sales', col: 3, ...r }, values: result.daily.map((d) => d.revenue) }],
    valueFormat: '#,##0',
  }
}

export async function downloadWorkbook(wb: Workbook, fileName: string) {
  const buffer = await workbookToBuffer(wb)
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Sheets that will be included for a result — shown in the Report Generator before export. */
export function plannedSheets(result: AnalyticsResult): { name: string; included: boolean; reason?: string }[] {
  return [
    { name: 'Executive Summary', included: true },
    { name: 'Daily Sales', included: result.daily.length > 0, reason: 'Needs dated sales data' },
    { name: 'Branch Performance', included: result.branches.rows.length > 0, reason: 'Needs a branch field' },
    { name: 'Platform Performance', included: result.platforms.rows.length > 0, reason: 'Needs sales data' },
    { name: 'Product Rankings', included: result.products.length > 0, reason: 'Needs product exports' },
    { name: 'Customer Activity', included: result.customerActivity.daily.length > 0, reason: 'Needs daily customer activity exports' },
    { name: 'Customer Insights', included: result.customers.count > 0, reason: 'Needs top customers exports' },
    { name: 'Delivery & Pickup', included: result.channels.rows.length > 0, reason: 'Needs a sales channel field' },
    { name: 'Customer Feedback', included: result.ratings.count > 0, reason: 'Needs rating exports' },
    { name: 'Data Quality', included: true },
    { name: 'Cleaned Data', included: result.records.length > 0, reason: 'Needs imported rows in scope' },
  ]
}
