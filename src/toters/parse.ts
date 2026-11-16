/**
 * Toters daily revenue export (verified against the October 2026 exports):
 *
 *   store_id,period,total,ref,delivery_request
 *   96297,2026-10-01 00:00:00,77100,Ginger&Co, ALL
 *
 * One row per store and day. A file may hold one branch or several. `store_id = 0` rows are the
 * export's combined total of the branches in the file: they are used only to reconcile against
 * the branch rows and are never stored or added to totals (that would double-count revenue).
 *
 * `total` is converted with the fixed rule in config/toters.ts. There is no order count in this
 * export, so orders and AOV are never derived from it. The branch comes from `store_id` — never
 * from the file name.
 */
import { TOTERS_HEADERS, TOTERS_IDENTIFYING_HEADERS, TOTERS_REQUIRED_HEADERS, storeById, storeByBranch, type TotersStore } from '@/config/toters'
import type { CellValue, RawFile } from '@/types/data'
import type { Issue } from '@/types/dataset'
import { fnv1a } from '@/utils/hash'
import type { TotersInvalidRow, TotersReconciliation } from './types'

/** Store ID used by Toters for the combined total of all branches in the export. */
export const COMBINED_STORE_ID = '0'

/** Amounts are compared on the original CSV values; differences below this are rounding. */
const RECONCILE_TOLERANCE = 0.005

const norm = (s: string) => s.replace(/^﻿/, '').trim().toLowerCase()

export interface TotersDetection {
  sheetIndex: number
  /** 1-based header row. */
  headerRow: number
  /** Column index for each known header, when present. */
  columns: Partial<Record<keyof typeof TOTERS_HEADERS, number>>
}

/** Recognise a Toters export from its headers (first ten rows of each sheet). */
export function detectToters(raw: RawFile): TotersDetection | null {
  for (let sheetIndex = 0; sheetIndex < raw.sheets.length; sheetIndex++) {
    const cells = raw.sheets[sheetIndex].cells
    for (let r = 0; r < Math.min(cells.length, 10); r++) {
      const headers = (cells[r] ?? []).map((v) => (typeof v === 'string' ? norm(v) : ''))
      const has = (h: string) => headers.includes(h)
      if (!TOTERS_REQUIRED_HEADERS.every(has) || !TOTERS_IDENTIFYING_HEADERS.some(has)) continue
      const columns: TotersDetection['columns'] = {}
      for (const [key, header] of Object.entries(TOTERS_HEADERS) as [keyof typeof TOTERS_HEADERS, string][]) {
        const i = headers.indexOf(header)
        if (i >= 0) columns[key] = i
      }
      return { sheetIndex, headerRow: r + 1, columns }
    }
  }
  return null
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Strict date: "yyyy-mm-dd" optionally followed by a time, or an Excel date. Returns ISO date. */
export function parseTotersDate(value: CellValue): string | undefined {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
  }
  if (typeof value !== 'string') return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/.exec(value.trim())
  if (!m) return undefined
  const [y, mo, d] = [+m[1], +m[2], +m[3]]
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return undefined
  return `${y}-${pad(mo)}-${pad(d)}`
}

/** Strict number: plain decimal (e.g. "24135.989999999998", "-12.5"). Empty is "missing", not zero. */
export function parseTotersNumber(value: CellValue): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!/^-?\d+(\.\d+)?$/.test(text)) return undefined
  const n = Number(text)
  return Number.isFinite(n) ? n : undefined
}

const cellText = (v: CellValue | undefined): string | undefined => {
  if (v === null || v === undefined) return undefined
  const s = String(v).trim()
  return s === '' ? undefined : s
}

/** Store IDs may be read as text ("96297") or numbers (Excel); "96297.0" is the same store. */
const storeText = (v: CellValue | undefined): string | undefined => {
  const s = cellText(v)
  if (!s) return undefined
  return /^\d+\.0+$/.test(s) ? s.replace(/\.0+$/, '') : s
}

export interface TotersRow {
  row: number
  date: string
  csvTotal: number
}

/** Rows of one store within a file. `storeId` is undefined when the file has no store IDs. */
export interface TotersStoreRows {
  storeId?: string
  storeLabel?: string
  /** Valid rows, one per date, sorted by date. */
  rows: TotersRow[]
  invalid: TotersInvalidRow[]
  periodStart?: string
  periodEnd?: string
}

export interface TotersParseResult {
  fileName: string
  detection: TotersDetection
  hasStoreColumn: boolean
  /** Branch rows grouped by store (store_id = 0 excluded). */
  stores: TotersStoreRows[]
  /** Valid `store_id = 0` rows — combined totals, reconciliation only. */
  combined: TotersRow[]
  reconciliation?: TotersReconciliation
  deliveryScopes: string[]
  /** Rows that could not be attributed to any store (missing / unknown store ID, bad dates). */
  unattributed: TotersInvalidRow[]
  sourceRows: number
  periodStart?: string
  periodEnd?: string
  /** Problems with the file as a whole (errors block the import). */
  issues: Issue[]
}

interface Candidate extends TotersRow {
  storeId?: string
}

/** Collapse rows to one value per date; conflicting repeats become invalid rows. */
function oneRowPerDate(candidates: Candidate[], invalid: TotersInvalidRow[]): { rows: TotersRow[]; identicalRepeats: number } {
  const byDate = new Map<string, Candidate[]>()
  for (const r of candidates) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r])
  const rows: TotersRow[] = []
  let identicalRepeats = 0
  for (const [date, group] of byDate) {
    if (new Set(group.map((g) => g.csvTotal)).size === 1) {
      rows.push({ row: group[0].row, date, csvTotal: group[0].csvTotal })
      identicalRepeats += group.length - 1
    } else {
      for (const g of group) invalid.push({ row: g.row, date, reason: 'Conflicting duplicate rows for this date (not imported)' })
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date))
  return { rows, identicalRepeats }
}

/**
 * Compare each `store_id = 0` day with the sum of the branch rows for that day. A difference
 * means the file's branch rows do not add up to the export's own combined total.
 */
export function reconcileCombined(combined: TotersRow[], stores: TotersStoreRows[]): TotersReconciliation {
  const mismatches: TotersReconciliation['mismatches'] = []
  let combinedTotal = 0
  let branchTotal = 0
  for (const c of combined) {
    const branchSum = stores.reduce((a, s) => a + (s.rows.find((r) => r.date === c.date)?.csvTotal ?? 0), 0)
    const missingStores = stores.filter((s) => !s.rows.some((r) => r.date === c.date)).map((s) => s.storeId ?? '')
    combinedTotal += c.csvTotal
    branchTotal += branchSum
    if (Math.abs(branchSum - c.csvTotal) > RECONCILE_TOLERANCE || missingStores.length > 0) mismatches.push({ date: c.date, combinedCsvTotal: c.csvTotal, branchCsvTotal: branchSum, missingStores })
  }
  return { days: combined.length, matchedDays: combined.length - mismatches.length, combinedCsvTotal: combinedTotal, branchCsvTotal: branchTotal, mismatches }
}

/** Parse and validate a detected Toters export. Nothing is guessed or filled in. */
export function parseToters(raw: RawFile, detection: TotersDetection): TotersParseResult {
  const cells = raw.sheets[detection.sheetIndex].cells
  const c = detection.columns
  const issues: Issue[] = []
  const unattributed: TotersInvalidRow[] = []
  const byStore = new Map<string, { label?: string; candidates: Candidate[]; invalid: TotersInvalidRow[] }>()
  const scopes = new Set<string>()
  const unknown = new Set<string>()
  let sourceRows = 0

  const group = (key: string) => {
    if (!byStore.has(key)) byStore.set(key, { candidates: [], invalid: [] })
    return byStore.get(key)!
  }

  for (let i = detection.headerRow; i < cells.length; i++) {
    const values = cells[i] ?? []
    if (values.every((v) => v === null || v === '')) continue
    sourceRows++
    const row = i + 1
    const get = (k: keyof typeof TOTERS_HEADERS) => (c[k] === undefined ? undefined : values[c[k] as number])
    const storeId = storeText(get('storeId'))
    const scope = cellText(get('deliveryRequest'))
    if (scope) scopes.add(scope)

    const rawDate = get('period')
    const date = parseTotersDate(rawDate ?? null)
    const rawTotal = get('total')
    const total = parseTotersNumber(rawTotal ?? null)

    // Rows that cannot belong to a known store are reported but never imported.
    if (c.storeId !== undefined && !storeId) {
      unattributed.push({ row, date, reason: 'Missing store ID' })
      continue
    }
    if (storeId && storeId !== COMBINED_STORE_ID && !storeById(storeId)) {
      unknown.add(storeId)
      unattributed.push({ row, date, reason: `Unknown store ID ${storeId}` })
      continue
    }
    const g = group(storeId ?? '')
    const label = cellText(get('ref'))
    if (label && !g.label) g.label = label
    if (!date) {
      g.invalid.push({ row, reason: cellText(rawDate) ? `Invalid date “${cellText(rawDate)}”` : 'Missing date' })
      continue
    }
    if (total === undefined) {
      g.invalid.push({ row, date, reason: cellText(rawTotal) ? `Invalid amount “${cellText(rawTotal)}”` : 'Missing amount (not treated as zero)' })
      continue
    }
    g.candidates.push({ row, date, csvTotal: total, storeId })
  }

  let identicalRepeats = 0
  const stores: TotersStoreRows[] = []
  let combined: TotersRow[] = []
  for (const [key, g] of byStore) {
    const { rows, identicalRepeats: n } = oneRowPerDate(g.candidates, g.invalid)
    identicalRepeats += n
    g.invalid.sort((a, b) => a.row - b.row)
    if (key === COMBINED_STORE_ID) {
      combined = rows
      if (g.invalid.length > 0) issues.push({ level: 'warning', message: `${g.invalid.length} combined-total row(s) (store_id 0) are invalid; they are not needed for branch figures.` })
      continue
    }
    stores.push({ storeId: key || undefined, storeLabel: g.label, rows, invalid: g.invalid, periodStart: rows[0]?.date, periodEnd: rows[rows.length - 1]?.date })
  }
  // Registry order keeps branches in a stable order.
  stores.sort((a, b) => (a.storeId ?? '').localeCompare(b.storeId ?? '', undefined, { numeric: true }))

  const allDates = stores.flatMap((s) => s.rows.map((r) => r.date)).sort()
  const reconciliation = combined.length > 0 && stores.length > 0 ? reconcileCombined(combined, stores) : undefined

  if (unknown.size > 0) issues.push({ level: 'error', message: `Unknown store ID(s): ${[...unknown].join(', ')}. They are not mapped to any branch, so the file cannot be imported.` })
  if (scopes.size > 1) issues.push({ level: 'error', message: `The file mixes delivery_request values (${[...scopes].join(', ')}); totals could overlap.` })
  else if (scopes.size === 1 && [...scopes][0].toUpperCase() !== 'ALL')
    issues.push({ level: 'warning', message: `delivery_request is “${[...scopes][0]}”, not “ALL”: revenue may cover only part of the Toters orders.` })
  if (combined.length > 0 && stores.length === 0) issues.push({ level: 'error', message: 'The file contains only combined totals (store_id 0). Branch rows are required; combined totals are used only for reconciliation.' })
  else if (stores.every((s) => s.rows.length === 0)) issues.push({ level: 'error', message: 'No valid daily rows were found.' })
  if (combined.length > 0 && stores.length > 0)
    issues.push({ level: 'info', message: `${combined.length} combined-total row(s) (store_id 0) are used only to reconcile the branch rows — never added to revenue.` })
  if (reconciliation && reconciliation.mismatches.length > 0)
    issues.push({ level: 'warning', message: `Reconciliation: on ${reconciliation.mismatches.length} of ${reconciliation.days} day(s) the branch rows do not add up to the export's combined total.` })
  if (identicalRepeats > 0) issues.push({ level: 'info', message: `${identicalRepeats} repeated row(s) with identical values were counted once.` })
  if (stores.some((s) => s.rows.some((r) => r.csvTotal < 0))) issues.push({ level: 'warning', message: 'Some days have a negative amount. They are imported as shown in the export.' })

  return {
    fileName: raw.fileName,
    detection,
    hasStoreColumn: c.storeId !== undefined && stores.some((s) => s.storeId !== undefined),
    stores,
    combined,
    reconciliation,
    deliveryScopes: [...scopes],
    unattributed: unattributed.sort((a, b) => a.row - b.row),
    sourceRows,
    periodStart: allDates[0],
    periodEnd: allDates[allDates.length - 1],
    issues,
  }
}

export interface StoreResolution {
  /** One entry per store in the file, with its branch. */
  stores: { store: TotersStore; rows: TotersStoreRows; source: 'file' | 'manual' }[]
  /** True when the file has no store IDs and the user must pick the branch. */
  needsManualBranch: boolean
  issues: Issue[]
}

/**
 * Branches for a parsed file. Store IDs decide when present; a manual selection is only used
 * when the file has no store IDs, and a selection that conflicts with the file blocks the import.
 */
export function resolveStores(parsed: TotersParseResult, manualBranchKey?: string): StoreResolution {
  const manual = manualBranchKey
    ? (() => {
        const [brandId, ...rest] = manualBranchKey.split(':')
        return storeByBranch(brandId as TotersStore['brandId'], rest.join(':'))
      })()
    : undefined
  const identified = parsed.stores.filter((s) => s.storeId !== undefined)
  const anonymous = parsed.stores.find((s) => s.storeId === undefined)

  if (identified.length > 0) {
    const stores = identified.map((rows) => ({ store: storeById(rows.storeId as string) as TotersStore, rows, source: 'file' as const })).filter((s) => s.store)
    const issues: Issue[] = []
    if (manual && !(stores.length === 1 && stores[0].store.storeId === manual.storeId))
      issues.push({ level: 'error', message: `The selected branch conflicts with the store ID(s) in the file (${identified.map((s) => s.storeId).join(', ')}). Import blocked.` })
    return { stores, needsManualBranch: false, issues }
  }
  if (!anonymous) return { stores: [], needsManualBranch: false, issues: [] }
  if (!manual) return { stores: [], needsManualBranch: true, issues: [{ level: 'error', message: 'The file has no store ID. Select the Toters branch it belongs to.' }] }
  return { stores: [{ store: manual, rows: anonymous, source: 'manual' }], needsManualBranch: true, issues: [] }
}

/** Content fingerprint of one store's valid rows — identical re-imports are detected regardless of file name. */
export function fingerprintToters(storeId: string, rows: TotersRow[]): string {
  return `${rows.length}-${fnv1a(`${storeId}|${rows.map((r) => `${r.date}=${r.csvTotal}`).join(';')}`)}`
}
