import type { Alignment, Borders, Cell, Fill, Font, Worksheet } from 'exceljs'

/**
 * Excel design system for the analytical report. Every sheet is styled through these helpers so
 * the workbook reads as one system. Colours follow the dashboard tokens (slate neutrals with a
 * single blue accent, see src/index.css); swap them here when official brand colours exist.
 * Nothing in this file calculates figures — it only presents values it is given.
 */

export const PALETTE = {
  ink: '0F172A',
  header: '1E293B',
  text: '1E293B',
  body: '334155',
  muted: '64748B',
  faint: '94A3B8',
  subtitle: 'CBD5E1',
  border: 'E2E8F0',
  rule: 'CBD5E1',
  band: 'F8FAFC',
  card: 'F8FAFC',
  white: 'FFFFFF',
  accent: '2B5FD9',
  accentDark: '1E40AF',
  accentSoft: 'EEF3FD',
  accentBar: '8AA9EC',
  positive: '047857',
  positiveSoft: 'E7F6EF',
  negative: 'B42318',
  negativeSoft: 'FDECEA',
  warning: 'B45309',
  warningSoft: 'FEF5E7',
  info: '1D4ED8',
  infoSoft: 'EAF1FE',
} as const

/** Worksheet tab colours by role. */
export const TAB = {
  summary: PALETTE.ink,
  analysis: PALETTE.accent,
  customers: '0E7490',
  quality: PALETTE.warning,
  data: PALETTE.muted,
} as const

export const FONT_NAME = 'Calibri'

export const FMT = {
  money: '#,##0.00',
  int: '#,##0',
  pct: '0.0%',
  signedPct: '+0.0%;-0.0%;0.0%',
  dec2: '0.00',
  number: '#,##0.##',
  date: 'dd mmm yyyy',
  day: 'ddd dd mmm yyyy',
} as const

/** Money format carrying the ISO currency code, e.g. "USD 1,234.00". The value itself is unchanged. */
export function moneyFormat(currency?: string | null): string {
  return currency && /^[A-Z]{3}$/.test(currency) ? `"${currency} "#,##0.00` : FMT.money
}

/** Whole-unit money format for large KPI figures. */
export function moneyFormatWhole(currency?: string | null): string {
  return currency && /^[A-Z]{3}$/.test(currency) ? `"${currency} "#,##0` : FMT.int
}

const argb = (hex: string) => `FF${hex}`
export const solid = (hex: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } })
export const font = (o: { size?: number; bold?: boolean; italic?: boolean; color?: string } = {}): Partial<Font> => ({
  name: FONT_NAME,
  size: o.size ?? 10,
  bold: o.bold ?? false,
  italic: o.italic ?? false,
  color: { argb: argb(o.color ?? PALETTE.body) },
})
const line = (hex: string, style: 'thin' | 'medium' | 'thick' | 'double' | 'hair' = 'thin') => ({ style, color: { argb: argb(hex) } })

export function columnLetter(col: number): string {
  let s = ''
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

/** "YYYY-MM-DD" → a UTC Date so Excel stores a real date; any other value is returned unchanged. */
export function asDate<T>(value: T): T | Date {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d))
  }
  return value
}

/** Human-readable form of an ISO date ("2026-10-01" → "1 Oct 2026"); other text is returned as is. */
export function prettyDate(value: string | undefined | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value ?? ''
  const d = asDate(value) as Date
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function setWidths(sheet: Worksheet, widths: number[], startCol = 1) {
  widths.forEach((w, i) => (sheet.getColumn(startCol + i).width = w))
}

function mergedWidth(sheet: Worksheet, from: number, to: number) {
  let w = 0
  for (let c = from; c <= to; c++) w += sheet.getColumn(c).width ?? 9
  return w
}

/** Approximate row height for wrapped text across columns [from, to]. */
export function wrappedHeight(sheet: Worksheet, text: string, from: number, to: number, opts: { size?: number; min?: number } = {}) {
  const size = opts.size ?? 10
  const charsPerLine = Math.max(8, mergedWidth(sheet, from, to) * (10 / size) * 1.2 - 2)
  const lines = String(text)
    .split('\n')
    .reduce((n, p) => n + Math.max(1, Math.ceil(p.length / charsPerLine)), 0)
  return Math.max(opts.min ?? 18, Math.ceil(lines * size * 1.32 + 6))
}

function mergeRow(sheet: Worksheet, row: number, from: number, to: number) {
  if (to > from) sheet.mergeCells(row, from, row, to)
}

export interface Span {
  from: number
  to: number
}

/** Dark title band used at the top of every data sheet. Returns the first free row. */
export function sheetHeader(sheet: Worksheet, title: string, subtitle: string, span: Span): number {
  const { from, to } = span
  const paint = (r: number) => {
    for (let c = from; c <= to; c++) sheet.getCell(r, c).fill = solid(PALETTE.ink)
  }
  paint(1)
  paint(2)
  mergeRow(sheet, 1, from, to)
  mergeRow(sheet, 2, from, to)
  const t = sheet.getCell(1, from)
  t.value = title
  t.font = font({ size: 16, bold: true, color: PALETTE.white })
  t.alignment = { vertical: 'bottom', indent: 1 }
  sheet.getRow(1).height = 30
  const s = sheet.getCell(2, from)
  s.value = subtitle
  s.font = font({ size: 9.5, color: PALETTE.subtitle })
  s.alignment = { vertical: 'top', indent: 1 }
  sheet.getRow(2).height = 20
  for (let c = from; c <= to; c++) sheet.getCell(3, c).fill = solid(PALETTE.accent)
  sheet.getRow(3).height = 3.5
  sheet.getRow(4).height = 10
  return 5
}

/** Section heading with an accent rule underneath. Returns the next row. */
export function section(sheet: Worksheet, row: number, title: string, span: Span): number {
  for (let c = span.from; c <= span.to; c++) sheet.getCell(row, c).border = { bottom: line(PALETTE.accent, 'medium') }
  const cell = sheet.getCell(row, span.from)
  cell.value = title
  cell.font = font({ size: 11.5, bold: true, color: PALETTE.ink })
  cell.alignment = { vertical: 'bottom' }
  sheet.getRow(row).height = 22
  sheet.getRow(row + 1).height = 6
  return row + 2
}

/** Muted explanatory line, merged and wrapped across the span. Returns the next row. */
export function note(sheet: Worksheet, row: number, text: string, span: Span, tone: 'muted' | 'warning' = 'muted'): number {
  mergeRow(sheet, row, span.from, span.to)
  const cell = sheet.getCell(row, span.from)
  cell.value = text
  cell.font = font({ size: 9.5, italic: tone === 'muted', color: tone === 'warning' ? PALETTE.warning : PALETTE.muted })
  cell.alignment = { wrapText: true, vertical: 'top' }
  sheet.getRow(row).height = wrappedHeight(sheet, text, span.from, span.to, { size: 9.5, min: 15 })
  return row + 1
}

export type CellKind = 'text' | 'strong' | 'wrap' | 'int' | 'money' | 'pct' | 'signedPct' | 'dec2' | 'number' | 'date' | 'day' | 'center'
export type CellValue = string | number | Date | null | undefined

export interface Column {
  header: string
  kind?: CellKind
  /** Number of sheet columns this table column covers (merged). Default 1. */
  span?: number
}

export interface CellStyle {
  fill?: string
  color?: string
  bold?: boolean
  numFmt?: string
}

export interface TableOptions {
  startCol?: number
  /** Currency used for money columns; defaults to the value of a "Currency" column in the row. */
  currencyOf?: (row: CellValue[], index: number) => string | undefined
  /** Per-row overrides (e.g. highlight a top-10 row or a totals row). */
  rowStyle?: (row: CellValue[], index: number) => CellStyle | undefined
  /** Per-cell overrides (e.g. status badges). */
  cellStyle?: (column: number, value: CellValue, row: CellValue[], index: number) => CellStyle | undefined
  /** Add an Excel AutoFilter (sort and filter) on the header row. One per sheet. */
  filter?: boolean
  banded?: boolean
  /** Style rows as a totals block (bold, accent rule above). */
  totals?: boolean
}

export interface TableResult {
  headerRow: number
  firstRow: number
  lastRow: number
  /** First free row after the table plus one blank spacer row. */
  nextRow: number
  /** Sheet column of a table column (by index). */
  col: (index: number) => number
  firstCol: number
  lastCol: number
}

const NUMERIC: CellKind[] = ['int', 'money', 'pct', 'signedPct', 'dec2', 'number']

function formatFor(kind: CellKind | undefined, currency: string | undefined): string | undefined {
  switch (kind) {
    case 'int':
      return FMT.int
    case 'money':
      return moneyFormat(currency)
    case 'pct':
      return FMT.pct
    case 'signedPct':
      return FMT.signedPct
    case 'dec2':
      return FMT.dec2
    case 'number':
      return FMT.number
    case 'date':
      return FMT.date
    case 'day':
      return FMT.day
    default:
      return undefined
  }
}

function alignmentFor(kind: CellKind | undefined): Partial<Alignment> {
  if (kind && NUMERIC.includes(kind)) return { horizontal: 'right', vertical: 'middle' }
  if (kind === 'center' || kind === 'date' || kind === 'day') return { horizontal: 'center', vertical: 'middle' }
  if (kind === 'wrap') return { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 }
  return { horizontal: 'left', vertical: 'middle', indent: 1 }
}

/** A styled table: dark header, light banded rows, hairline borders, kind-aware formats. */
export function table(sheet: Worksheet, startRow: number, columns: Column[], rows: CellValue[][], opts: TableOptions = {}): TableResult {
  const startCol = opts.startCol ?? 1
  const positions: number[] = []
  let c = startCol
  for (const col of columns) {
    positions.push(c)
    c += col.span ?? 1
  }
  const lastCol = c - 1
  const end = (i: number) => positions[i] + (columns[i].span ?? 1) - 1
  const currencyIndex = columns.findIndex((col) => col.header === 'Currency')
  const banded = opts.banded ?? true

  const header = sheet.getRow(startRow)
  header.height = 24
  columns.forEach((col, i) => {
    mergeRow(sheet, startRow, positions[i], end(i))
    for (let k = positions[i]; k <= end(i); k++) {
      const cell = sheet.getCell(startRow, k)
      cell.fill = solid(opts.totals ? PALETTE.accentSoft : PALETTE.header)
      cell.border = opts.totals ? { top: line(PALETTE.accent, 'medium'), bottom: line(PALETTE.rule) } : { bottom: line(PALETTE.ink) }
    }
    const cell = sheet.getCell(startRow, positions[i])
    cell.value = col.header
    cell.font = font({ size: 10, bold: true, color: opts.totals ? PALETTE.accentDark : PALETTE.white })
    cell.alignment = { ...alignmentFor(col.kind === 'wrap' ? 'text' : col.kind), vertical: 'middle', wrapText: true }
  })

  rows.forEach((values, r) => {
    const rowNumber = startRow + 1 + r
    const rowStyle = opts.rowStyle?.(values, r)
    const currency = opts.currencyOf?.(values, r) ?? (currencyIndex >= 0 ? (values[currencyIndex] as string | undefined) ?? undefined : undefined)
    let height = 18
    columns.forEach((col, i) => {
      mergeRow(sheet, rowNumber, positions[i], end(i))
      const raw = values[i]
      const v = col.kind === 'date' || col.kind === 'day' ? asDate(raw) : raw
      const cellStyle = opts.cellStyle?.(i, raw, values, r)
      const fill = cellStyle?.fill ?? rowStyle?.fill ?? (banded && r % 2 === 1 ? PALETTE.band : undefined)
      for (let k = positions[i]; k <= end(i); k++) {
        const cell = sheet.getCell(rowNumber, k)
        if (fill) cell.fill = solid(fill)
        cell.border = { bottom: line(PALETTE.border, 'hair') }
      }
      const cell = sheet.getCell(rowNumber, positions[i])
      cell.value = v ?? null
      const fmt = cellStyle?.numFmt ?? rowStyle?.numFmt ?? formatFor(col.kind, currency)
      if (fmt && (typeof v === 'number' || v instanceof Date)) cell.numFmt = fmt
      cell.font = font({
        bold: cellStyle?.bold ?? rowStyle?.bold ?? (opts.totals || col.kind === 'strong'),
        color: cellStyle?.color ?? rowStyle?.color ?? (col.kind === 'strong' ? PALETTE.text : PALETTE.body),
      })
      cell.alignment = alignmentFor(col.kind)
      if (col.kind === 'wrap' && typeof v === 'string') height = Math.max(height, wrappedHeight(sheet, v, positions[i], end(i)))
    })
    sheet.getRow(rowNumber).height = height
  })

  const lastRow = startRow + rows.length
  if (opts.filter && rows.length > 0) sheet.autoFilter = { from: { row: startRow, column: startCol }, to: { row: lastRow, column: lastCol } }
  return { headerRow: startRow, firstRow: startRow + 1, lastRow, nextRow: lastRow + 2, col: (i) => positions[i], firstCol: startCol, lastCol }
}

export interface KpiCard {
  label: string
  value: number | undefined
  format: string
  sub?: string
  subTone?: 'positive' | 'negative' | 'muted'
}

/** A row of KPI cards. Each card covers [from, to] sheet columns. Returns the next row. */
export function kpiCards(sheet: Worksheet, row: number, cards: KpiCard[], spans: Span[]): number {
  sheet.getRow(row).height = 22
  sheet.getRow(row + 1).height = 38
  sheet.getRow(row + 2).height = 20
  cards.forEach((card, i) => {
    const { from, to } = spans[i]
    for (let r = row; r <= row + 2; r++) {
      mergeRow(sheet, r, from, to)
      for (let c = from; c <= to; c++) {
        const cell = sheet.getCell(r, c)
        cell.fill = solid(PALETTE.card)
        const b: Partial<Borders> = {}
        if (r === row) b.top = line(PALETTE.accent, 'thick')
        if (r === row + 2) b.bottom = line(PALETTE.border)
        if (c === from) b.left = line(PALETTE.white, 'thick')
        if (c === to) b.right = line(PALETTE.white, 'thick')
        cell.border = b
      }
    }
    const label = sheet.getCell(row, from)
    label.value = card.label.toUpperCase()
    label.font = font({ size: 9, bold: true, color: PALETTE.muted })
    label.alignment = { vertical: 'bottom', indent: 1 }
    const value = sheet.getCell(row + 1, from) as Cell
    if (card.value === undefined) {
      value.value = 'Not available'
      value.font = font({ size: 13, color: PALETTE.faint })
    } else {
      value.value = card.value
      value.numFmt = card.format
      value.font = font({ size: 22, bold: true, color: PALETTE.ink })
    }
    value.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    const sub = sheet.getCell(row + 2, from)
    sub.value = card.sub ?? ''
    sub.font = font({ size: 9, bold: card.subTone === 'positive' || card.subTone === 'negative', color: card.subTone === 'positive' ? PALETTE.positive : card.subTone === 'negative' ? PALETTE.negative : PALETTE.muted })
    sub.alignment = { vertical: 'top', indent: 1, shrinkToFit: true }
  })
  return row + 4
}

/** Gridlines off, frozen header, print setup, footer and tab colour. */
export function finishSheet(
  sheet: Worksheet,
  o: { tab: string; lastCol: number; lastRow?: number; freezeRow?: number; freezeCol?: number; printTitleRow?: number; orientation?: 'portrait' | 'landscape' },
) {
  sheet.properties.tabColor = { argb: argb(o.tab) }
  sheet.views = [
    {
      state: o.freezeRow || o.freezeCol ? 'frozen' : 'normal',
      ySplit: o.freezeRow ?? 0,
      xSplit: o.freezeCol ?? 0,
      showGridLines: false,
      zoomScale: 100,
    },
  ]
  const lastRow = Math.max(o.lastRow ?? 0, sheet.rowCount)
  sheet.pageSetup = {
    ...sheet.pageSetup,
    paperSize: 9,
    orientation: o.orientation ?? 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.55, bottom: 0.6, header: 0.25, footer: 0.3 },
    printArea: `A1:${columnLetter(o.lastCol)}${lastRow}`,
    ...(o.printTitleRow ? { printTitlesRow: `${o.printTitleRow}:${o.printTitleRow}` } : {}),
  }
  sheet.headerFooter = {
    oddFooter: '&L&8&K64748BGinger && Co Analytics&C&8&K64748B&A&R&8&K64748BPage &P of &N',
  }
}
