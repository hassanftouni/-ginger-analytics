/**
 * Toters configuration. Toters analytics are kept completely separate from Weevi: separate
 * storage, separate calculations, separate dashboard and separate Excel report. Toters revenue
 * is never added to Weevi (app) revenue anywhere in the application.
 *
 * Every value here was supplied by the business (store IDs, branches, conversion rule).
 */
import type { BrandId } from './brands'

/** Store registry. The store ID in the export identifies the branch — never the file name. */
export interface TotersStore {
  storeId: string
  brandId: BrandId
  /** Branch name, matching the brand's configured branch list. */
  branch: string
}

export const TOTERS_STORES: TotersStore[] = [
  { storeId: '96297', brandId: 'ginger-and-co', branch: 'Hamra' },
  { storeId: '96298', brandId: 'ginger-and-co', branch: 'Jal El Dib' },
  { storeId: '104873', brandId: 'pertutti', branch: 'Hamra' },
  { storeId: '121769', brandId: 'pertutti', branch: 'Hazmieh' },
]

/** Configured branches with no Toters channel: shown as "Not available", never as zero sales. */
export const TOTERS_UNAVAILABLE: { brandId: BrandId; branch: string; reason: string }[] = [
  { brandId: 'ginger-and-co', branch: 'Hazmieh', reason: 'No Toters channel' },
  { brandId: 'ginger-and-co', branch: 'Discount', reason: 'No Toters channel (hospital location)' },
]

/**
 * Currency conversion (fixed business rule):
 *   Revenue LBP = CSV total × 1,500
 *   Revenue USD = Revenue LBP ÷ 89,500
 * The conversion is always calculated from the original CSV value, so re-importing a file can
 * never convert an amount twice.
 */
export const TOTERS_CONVERSION = {
  lbpMultiplier: 1500,
  lbpPerUsd: 89500,
  formula: 'Revenue USD = (Toters CSV total × 1,500) ÷ 89,500',
  description: 'Revenue LBP = Toters CSV total × 1,500; Revenue USD = Revenue LBP ÷ 89,500 (fixed rate: 89,500 LBP per USD)',
} as const

export type TotersConversion = { lbpMultiplier: number; lbpPerUsd: number; formula: string }

export function totersToLbp(csvTotal: number): number {
  return csvTotal * TOTERS_CONVERSION.lbpMultiplier
}

export function totersToUsd(csvTotal: number): number {
  return (csvTotal * TOTERS_CONVERSION.lbpMultiplier) / TOTERS_CONVERSION.lbpPerUsd
}

/** Stable key for a Toters branch, e.g. "pertutti:Hamra". */
export const branchKey = (brandId: BrandId, branch: string) => `${brandId}:${branch}`

export function storeById(storeId: string): TotersStore | undefined {
  return TOTERS_STORES.find((s) => s.storeId === storeId)
}

export function storeByBranch(brandId: BrandId, branch: string): TotersStore | undefined {
  return TOTERS_STORES.find((s) => s.brandId === brandId && s.branch === branch)
}

/** Headers of the verified Toters daily revenue export (compared trimmed, case-insensitive). */
export const TOTERS_HEADERS = {
  storeId: 'store_id',
  period: 'period',
  total: 'total',
  ref: 'ref',
  deliveryRequest: 'delivery_request',
} as const

/**
 * The format is recognised by `period` + `total` plus at least one Toters-specific column
 * (`store_id` or `delivery_request`). A file without `store_id` is still recognised; its branch
 * must then be selected manually.
 */
export const TOTERS_REQUIRED_HEADERS = [TOTERS_HEADERS.period, TOTERS_HEADERS.total] as const
export const TOTERS_IDENTIFYING_HEADERS = [TOTERS_HEADERS.storeId, TOTERS_HEADERS.deliveryRequest] as const
