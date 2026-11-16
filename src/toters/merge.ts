/**
 * Import planning for Toters days. Every stored day is unique per store and date, so a
 * re-import can only add missing days or (when explicitly chosen) replace existing ones —
 * revenue is never added twice. A multi-branch file is planned per store; each store with
 * changes gets its own import-history entry.
 */
import { TOTERS_CONVERSION, totersToLbp, totersToUsd, type TotersStore } from '@/config/toters'
import { fingerprintToters, type TotersRow, type TotersStoreRows } from './parse'
import type { TotersDay, TotersImport, TotersReconciliation, TotersResolution, TotersState } from './types'

export const dayKey = (storeId: string, date: string) => `${storeId}|${date}`

export interface TotersConflict {
  date: string
  existing: TotersDay
  incoming: TotersRow
}

export type PlanKind = 'identical' | 'clean' | 'conflict'

export interface TotersStorePlan {
  store: TotersStore
  source: 'file' | 'manual'
  rows: TotersStoreRows
  /** identical = nothing would change; clean = no differing overlaps; conflict = a decision is needed. */
  kind: PlanKind
  newDays: TotersRow[]
  unchanged: TotersRow[]
  conflicts: TotersConflict[]
}

export interface TotersBatchPlan {
  stores: TotersStorePlan[]
  kind: PlanKind
}

export function planStore(state: TotersState, store: TotersStore, rows: TotersStoreRows, source: 'file' | 'manual'): TotersStorePlan {
  const existing = new Map(state.days.filter((d) => d.storeId === store.storeId).map((d) => [d.date, d]))
  const newDays: TotersRow[] = []
  const unchanged: TotersRow[] = []
  const conflicts: TotersConflict[] = []
  for (const r of rows.rows) {
    const e = existing.get(r.date)
    if (!e) newDays.push(r)
    else if (e.csvTotal === r.csvTotal) unchanged.push(r)
    else conflicts.push({ date: r.date, existing: e, incoming: r })
  }
  const kind: PlanKind = conflicts.length > 0 ? 'conflict' : newDays.length === 0 ? 'identical' : 'clean'
  return { store, source, rows, kind, newDays, unchanged, conflicts }
}

export function planTotersImport(state: TotersState, stores: { store: TotersStore; rows: TotersStoreRows; source: 'file' | 'manual' }[]): TotersBatchPlan {
  const plans = stores.map((s) => planStore(state, s.store, s.rows, s.source))
  const kind: PlanKind = plans.some((p) => p.kind === 'conflict') ? 'conflict' : plans.every((p) => p.kind === 'identical') ? 'identical' : 'clean'
  return { stores: plans, kind }
}

export interface TotersBatchInput {
  batchId: string
  fileName: string
  fileSize: number
  deliveryScope?: string
  importedAt: number
  reconciliation?: TotersReconciliation
  warnings: string[]
  /** Creates the id of each per-store import entry. */
  newId: () => string
}

/** The conversion is always applied to the original CSV value (never to a stored amount). */
export function toDay(storeId: string, row: TotersRow, importId: string): TotersDay {
  return { storeId, date: row.date, csvTotal: row.csvTotal, revenueLbp: totersToLbp(row.csvTotal), revenueUsd: totersToUsd(row.csvTotal), importId }
}

/**
 * Apply a plan. `resolution` decides differing overlapping days: "replace" uses the new values,
 * "keep" leaves existing values. Stores with identical data are skipped (no entry, no change).
 */
export function applyTotersImport(state: TotersState, plan: TotersBatchPlan, resolution: Exclude<TotersResolution, 'new'>, input: TotersBatchInput): { state: TotersState; entries: TotersImport[] } {
  if (plan.kind === 'identical') throw new Error('Identical import: nothing to apply.')
  let days = state.days
  const entries: TotersImport[] = []
  for (const p of plan.stores) {
    if (p.kind === 'identical') continue
    const id = input.newId()
    const { storeId } = p.store
    const replace = resolution === 'replace' && p.conflicts.length > 0
    const writes = [...p.newDays, ...(replace ? p.conflicts.map((c) => c.incoming) : [])].map((r) => toDay(storeId, r, id))
    const writeKeys = new Set(writes.map((d) => dayKey(d.storeId, d.date)))
    days = [...days.filter((d) => !writeKeys.has(dayKey(d.storeId, d.date))), ...writes]
    entries.push({
      id,
      batchId: input.batchId,
      fileName: input.fileName,
      fileSize: input.fileSize,
      storeId,
      brandId: p.store.brandId,
      branch: p.store.branch,
      storeIdSource: p.source,
      storeLabel: p.rows.storeLabel,
      deliveryScope: input.deliveryScope,
      periodStart: p.rows.periodStart ?? '',
      periodEnd: p.rows.periodEnd ?? '',
      importedAt: input.importedAt,
      conversion: { lbpMultiplier: TOTERS_CONVERSION.lbpMultiplier, lbpPerUsd: TOTERS_CONVERSION.lbpPerUsd, formula: TOTERS_CONVERSION.formula },
      fingerprint: fingerprintToters(storeId, p.rows.rows),
      validRows: p.rows.rows.length,
      invalidRows: p.rows.invalid,
      daysAdded: p.newDays.length,
      daysReplaced: replace ? p.conflicts.length : 0,
      daysKept: replace ? 0 : p.conflicts.length,
      daysUnchanged: p.unchanged.length,
      resolution: p.conflicts.length === 0 ? 'new' : resolution,
      included: true,
      reconciliation: input.reconciliation,
      replaced: replace ? p.conflicts.map((c) => ({ date: c.date, previousCsvTotal: c.existing.csvTotal, previousImportId: c.existing.importId })) : [],
      warnings: input.warnings,
    })
  }
  days = [...days].sort((a, b) => a.storeId.localeCompare(b.storeId) || a.date.localeCompare(b.date))
  return { state: { days, imports: [...entries, ...state.imports] }, entries }
}

/**
 * Remove an import and the days whose current value it supplied. Days it replaced are not
 * restored (their previous values remain listed in that import's audit trail).
 */
/** Include or exclude an import without deleting it. */
export function setTotersImportIncluded(state: TotersState, importId: string, included: boolean): TotersState {
  return { ...state, imports: state.imports.map((i) => (i.id === importId ? { ...i, included } : i)) }
}

export const isIncluded = (i: { included?: boolean }) => i.included !== false

export function removeTotersImport(state: TotersState, importId: string): TotersState {
  return { days: state.days.filter((d) => d.importId !== importId), imports: state.imports.filter((i) => i.id !== importId) }
}
