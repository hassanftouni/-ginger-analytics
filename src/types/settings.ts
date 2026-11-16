/**
 * Reporting policy. Every business rule the analytics engine applies is configured here
 * by the user; nothing is assumed. Defaults are deliberately neutral.
 */

export type StatusTreatment = 'exclude' | 'include'

export interface ExchangeRate {
  from: string
  to: string
  /** 1 unit of `from` = `rate` units of `to`. */
  rate: number
}

export interface ReportingSettings {
  /** Order status values (as they appear in exports, case-insensitive) that mean cancelled. */
  cancelledStatuses: string[]
  /** Order status values that mean refunded. */
  refundedStatuses: string[]
  cancelledTreatment: StatusTreatment
  refundedTreatment: StatusTreatment
  /** Ratings below this value raise a "low rating" insight. Null disables the rule. */
  lowRatingThreshold: number | null
  /** User-supplied conversion rates; currencies are never combined without one. */
  exchangeRates: ExchangeRate[]
  /** When set and every currency has a rate, converted totals are shown alongside the originals. */
  reportingCurrency: string
}

export const DEFAULT_SETTINGS: ReportingSettings = {
  cancelledStatuses: [],
  refundedStatuses: [],
  cancelledTreatment: 'exclude',
  refundedTreatment: 'exclude',
  lowRatingThreshold: null,
  exchangeRates: [],
  reportingCurrency: '',
}
