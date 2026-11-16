import type { BrandId } from '@/config/brands'
import type { TotersConversion } from '@/config/toters'

/**
 * One stored Toters day for one store. There is at most one record per store and date
 * (key `${storeId}|${date}`), so revenue for a branch-day can never be counted twice.
 */
export interface TotersDay {
  storeId: string
  date: string
  /** Original value from the CSV `total` column (kept for auditing). */
  csvTotal: number
  /** csvTotal × 1,500 — full precision. */
  revenueLbp: number
  /** revenueLbp ÷ 89,500 — full precision; rounded only for display. */
  revenueUsd: number
  /** Import that supplied the current value. */
  importId: string
}

export interface TotersInvalidRow {
  /** 1-based row number in the file (header = row 1). */
  row: number
  date?: string
  reason: string
}

export type TotersResolution = 'new' | 'replace' | 'keep'

/** Check of a file's branch rows against its own combined-total rows (store_id = 0). */
export interface TotersReconciliation {
  days: number
  matchedDays: number
  /** Sum of the combined-total rows (original CSV values). */
  combinedCsvTotal: number
  /** Sum of the branch rows on those days (original CSV values). */
  branchCsvTotal: number
  mismatches: { date: string; combinedCsvTotal: number; branchCsvTotal: number; missingStores: string[] }[]
}

/** Import history entry. */
export interface TotersImport {
  id: string
  /** Shared by the per-branch entries created from one multi-branch file. */
  batchId: string
  fileName: string
  fileSize: number
  storeId: string
  brandId: BrandId
  branch: string
  /** "file" = store ID read from the export; "manual" = branch selected by the user. */
  storeIdSource: 'file' | 'manual'
  /** Store name in the export's `ref` column, for verification. */
  storeLabel?: string
  /** Value of `delivery_request` (e.g. "ALL"). */
  deliveryScope?: string
  periodStart: string
  periodEnd: string
  importedAt: number
  conversion: TotersConversion
  /** Content fingerprint of the valid rows (store, date, original total). */
  fingerprint: string
  validRows: number
  invalidRows: TotersInvalidRow[]
  /** Days newly added by this import. */
  daysAdded: number
  /** Overlapping days whose value was replaced by this import. */
  daysReplaced: number
  /** Overlapping days kept at their existing value (conflict resolved as "keep existing"). */
  daysKept: number
  /** Overlapping days with an identical value (nothing changed). */
  daysUnchanged: number
  resolution: TotersResolution
  /**
   * Excluded imports stay stored but their days are left out of every Toters figure (shown as
   * missing). Undefined = included (imports saved before this option existed).
   */
  included?: boolean
  /** Reconciliation against the file's combined totals (store_id 0), when the file had them. */
  reconciliation?: TotersReconciliation
  /** Previous values of replaced days, for auditing. */
  replaced: { date: string; previousCsvTotal: number; previousImportId: string }[]
  warnings: string[]
}

export interface TotersState {
  days: TotersDay[]
  imports: TotersImport[]
}

export const EMPTY_TOTERS_STATE: TotersState = { days: [], imports: [] }

export type TotersGrain = 'day' | 'week' | 'month'

/** Toters dashboard filters (independent of the Weevi global filters). */
export interface TotersFilters {
  brandId: BrandId | 'all'
  /** branchKey(brandId, branch) or 'all'. */
  branch: string
  from: string
  to: string
  grain: TotersGrain
}

export const DEFAULT_TOTERS_FILTERS: TotersFilters = { brandId: 'all', branch: 'all', from: '', to: '', grain: 'day' }
