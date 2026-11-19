/** How a reservation counts. 'other' = a status with no configured meaning. */
export type PlateOutcome = 'completed' | 'cancelled' | 'declined' | 'other'

/**
 * One stored Plate reservation. At most one record per Booking ID, so overlapping files never
 * count a booking twice. No personal data: the guest is kept only as a one-way code.
 */
export interface PlateBooking {
  bookingId: string
  locationId: string
  /** Reservation date (yyyy-mm-dd) — the reporting date. */
  date: string
  /** Reservation time "HH:mm" (24 h). */
  time?: string
  partySize: number
  /** Original "Status" value. */
  status: string
  outcome: PlateOutcome
  source?: string
  bookingType?: string
  occasion?: string
  section?: string
  durationMin?: number
  /** "yyyy-mm-dd HH:mm" from "Booked At". */
  bookedAt?: string
  /** Reservation date − booked date, in days. */
  leadDays?: number
  /** One-way code of the phone number (or email when there is no phone). Never reversible. */
  guestKey?: string
  guestKeySource?: 'phone' | 'email'
  hasDietaryNotes: boolean
  hasSpecialRequests: boolean
  modified: boolean
  paymentStatus?: string
  /** Payment Amount as text (no currency in the export) — counted, never summed as revenue. */
  paymentAmount?: string
  importId: string
}

export interface PlateInvalidRow {
  /** 1-based row number in the file. */
  row: number
  bookingId?: string
  date?: string
  reason: string
}

/** Totals of a file, computed from its rows — used to validate what was stored. */
export interface PlateControlTotals {
  bookings: number
  completed: number
  covers: number
  cancelled: number
  declined: number
  other: number
}

export type PlateResolution = 'new' | 'replace' | 'keep'

export interface PlateImport {
  id: string
  fileName: string
  fileSize: number
  locationId: string
  /** Covered period of the export (from the file name, confirmed on import). */
  periodStart: string
  periodEnd: string
  importedAt: number
  bookingIds: string[]
  fingerprint: string
  validRows: number
  invalidRows: PlateInvalidRow[]
  bookingsAdded: number
  bookingsReplaced: number
  bookingsKept: number
  bookingsUnchanged: number
  resolution: PlateResolution
  control: PlateControlTotals
  included?: boolean
  replaced: { bookingId: string; previousStatus: string; previousPartySize: number; previousImportId: string }[]
  warnings: string[]
}

export interface PlateImportResult {
  kind: 'imported' | 'skipped'
  entry?: PlateImport
  message: string
}

export interface PlateState {
  bookings: PlateBooking[]
  imports: PlateImport[]
}

export const EMPTY_PLATE_STATE: PlateState = { bookings: [], imports: [] }

export type PlateGrain = 'day' | 'week' | 'month'
export type PlateCompareMode = 'none' | 'previous' | 'custom'

export interface PlateFilters {
  /** Location ID or 'all'. */
  location: string
  from: string
  to: string
  grain: PlateGrain
  compare: PlateCompareMode
  compareFrom: string
  compareTo: string
}

export const DEFAULT_PLATE_FILTERS: PlateFilters = { location: 'all', from: '', to: '', grain: 'day', compare: 'previous', compareFrom: '', compareTo: '' }
