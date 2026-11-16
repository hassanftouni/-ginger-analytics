import type { BrandId } from '@/config/brands'

/** How an order counts: valid (delivered), cancelled, or a status with no configured meaning. */
export type FoodyOutcome = 'valid' | 'cancelled' | 'other'

/**
 * One stored Foody order. There is at most one record per order ID, so an order imported from
 * several (overlapping) files is never counted twice. Amounts are the original EUR values.
 */
export interface FoodyOrder {
  orderId: string
  storeId: string
  /** Order date (yyyy-mm-dd) in the export's local time — from "Order received at". */
  date: string
  /**
   * "yyyy-mm-dd HH:mm" as in the export. Empty for an order cancelled before it was received;
   * its date then comes from "Cancelled at" (dateSource = 'cancelled').
   */
  receivedAt?: string
  dateSource: 'received' | 'cancelled'
  /** Original "Order status" value. */
  status: string
  outcome: FoodyOutcome
  deliveryType?: string
  paymentType?: string
  paymentMethod?: string
  isPro?: boolean
  subtotal: number
  discount: number
  voucher: number
  /** Optional columns: undefined when the export left them empty. */
  packaging?: number
  minOrderFee?: number
  hasComplaint: boolean
  complaintReason?: string
  cancelledAt?: string
  cancellationReason?: string
  cancellationOwner?: string
  /** "Order items" text, e.g. "2 Miso soup, 1 Salmon poke bowl [1 With rice]". */
  items?: string
  /** Import that supplied the current values. */
  importId: string
}

export interface FoodyInvalidRow {
  /** 1-based row number in the sheet. */
  row: number
  orderId?: string
  date?: string
  reason: string
}

/** Totals of an export, computed directly from its rows — used to validate what was stored. */
export interface FoodyControlTotals {
  orders: number
  validOrders: number
  cancelledOrders: number
  otherOrders: number
  /** Subtotal of all rows (any status). */
  subtotalAll: number
  /** Valid orders only. */
  gross: number
  discount: number
  voucher: number
  net: number
}

export type FoodyResolution = 'new' | 'replace' | 'keep'

/** Outcome of reviewing one Foody file in the import page. */
export interface FoodyImportResult {
  kind: 'imported' | 'skipped'
  entry?: FoodyImport
  message: string
}

export interface FoodyImport {
  id: string
  fileName: string
  fileSize: number
  /** Store IDs in the file (normally one). */
  storeIds: string[]
  branches: { brandId: BrandId; branch: string; storeId: string }[]
  /** Restaurant name(s) and address(es) in the export, for verification. */
  restaurantNames: string[]
  addresses: string[]
  /** First and last order date in the file — the covered period. */
  periodStart: string
  periodEnd: string
  importedAt: number
  currency: string
  /** Order IDs of the valid rows in the file (for validating stored totals). */
  orderIds: string[]
  fingerprint: string
  validRows: number
  invalidRows: FoodyInvalidRow[]
  ordersAdded: number
  ordersReplaced: number
  ordersKept: number
  ordersUnchanged: number
  resolution: FoodyResolution
  /** Totals of the file's own rows. */
  control: FoodyControlTotals
  /** Excluded imports stay stored, but orders they supplied are left out of every figure. */
  included?: boolean
  /** Previous values of replaced orders, for auditing. */
  replaced: { orderId: string; previousNet: number; previousStatus: string; previousImportId: string }[]
  warnings: string[]
}

export interface FoodyState {
  orders: FoodyOrder[]
  imports: FoodyImport[]
}

export const EMPTY_FOODY_STATE: FoodyState = { orders: [], imports: [] }

export type FoodyGrain = 'day' | 'week' | 'month'

/** none = no comparison; previous = the same number of days just before the range; custom = own dates. */
export type FoodyCompareMode = 'none' | 'previous' | 'custom'

/** Foody dashboard filters (independent of the Weevi and Toters filters). */
export interface FoodyFilters {
  brandId: BrandId | 'all'
  /** foodyBranchKey(brandId, branch) or 'all'. */
  branch: string
  from: string
  to: string
  grain: FoodyGrain
  compare: FoodyCompareMode
  compareFrom: string
  compareTo: string
}

export const DEFAULT_FOODY_FILTERS: FoodyFilters = { brandId: 'all', branch: 'all', from: '', to: '', grain: 'day', compare: 'previous', compareFrom: '', compareTo: '' }
