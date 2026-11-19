/**
 * Plate reservations configuration. Plate analytics are kept completely separate from Weevi,
 * Toters and Foody: separate storage, calculations, dashboard and Excel report. Reservations are
 * bookings and guests (covers) — never sales — and are never added to any revenue figure.
 *
 * Everything here was read from the verified October 2026 Plate exports (CSV, one file per
 * location) or supplied by the business.
 */
import type { BrandId } from './brands'

/** A Plate reservation location (one Plate account = one location). */
export interface PlateLocation {
  id: string
  label: string
  /** Brands served at the location. Hamra is one combined reservation location for both brands. */
  brands: BrandId[]
  /** Location name as written in the export file name ("Bookings — <name> — <from> to <to>.csv"). */
  exportNames: string[]
  note?: string
}

/**
 * The export has no restaurant column, so the location is suggested from the file name and must
 * be confirmed on import. Ginger & Co Hamra and Pertutti Hamra share one Plate account and are
 * treated as a single reservation location (confirmed by the business).
 */
export const PLATE_LOCATIONS: PlateLocation[] = [
  { id: 'ginger-hazmieh', label: 'Ginger & Co — Hazmieh', brands: ['ginger-and-co'], exportNames: ['Ginger&Co - Hazmieh'] },
  { id: 'ginger-jal-el-dib', label: 'Ginger & Co — Jal El Dib', brands: ['ginger-and-co'], exportNames: ['Ginger&Co - Jal El Dib'] },
  { id: 'pertutti-hazmieh', label: 'Pertutti — Hazmieh', brands: ['pertutti'], exportNames: ['Pertutti - Hazmieh'] },
  {
    id: 'hamra',
    label: 'Ginger & Co + Pertutti — Hamra',
    brands: ['ginger-and-co', 'pertutti'],
    exportNames: ['Ginger&Co - Pertutti Hamra'],
    note: 'One combined reservation location for Ginger & Co and Pertutti Hamra (one Plate account).',
  },
]

export const plateLocationById = (id: string): PlateLocation | undefined => PLATE_LOCATIONS.find((l) => l.id === id)

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Location for an export name taken from the file name, or undefined when it is not registered. */
export function plateLocationByExportName(name: string): PlateLocation | undefined {
  const key = squash(name)
  return PLATE_LOCATIONS.find((l) => l.exportNames.some((n) => squash(n) === key))
}

/** Status values found in the exports and their meaning (compared trimmed, case-insensitive). */
export const PLATE_COMPLETED_STATUSES = ['completed']
export const PLATE_CANCELLED_STATUSES = ['cancelled by user']
export const PLATE_DECLINED_STATUSES = ['declined']

export const PLATE_RULES = {
  date: 'Reservations are reported by reservation date (the “Date” column), never by the date the booking was made',
  completed: 'Completed reservations = status “Completed” — the guests came',
  covers: 'Guests (covers) = sum of “Party Size” of completed reservations',
  cancelled: 'Cancelled = status “Cancelled by User” (the guest cancelled) — tracked separately, not in covers',
  declined: 'Declined = status “Declined” (the restaurant refused the booking) — a separate KPI, not a cancellation',
  repeat: 'Repeat guest = a guest (identified by phone number) with 2 or more completed reservations across all imported months; returning = also had a completed reservation before the selected period',
  lead: 'Booking lead time = reservation date − “Booked At” date, in days',
  notInExport: 'Walk-ins and no-shows are not in the Plate export (Booking Type is “Regular” and there is no no-show status) — not shown',
  privacy: 'Guest names, phone numbers, emails, confirmation codes and notes are never stored; phone numbers are kept only as a one-way code for repeat-guest counts',
} as const

/** Headers of the verified Plate “Bookings” CSV export. */
export const PLATE_HEADERS = {
  date: 'Date',
  time: 'Time',
  guest: 'Guest',
  partySize: 'Party Size',
  status: 'Status',
  table: 'Table',
  phone: 'Phone',
  email: 'Email',
  confirmationCode: 'Confirmation Code',
  source: 'Source',
  bookingType: 'Booking Type',
  occasion: 'Occasion',
  section: 'Section',
  comingFor: 'Coming For',
  dietaryNotes: 'Dietary Notes',
  specialRequests: 'Special Requests',
  restaurantNotes: 'Restaurant Notes',
  paymentStatus: 'Payment Status',
  paymentAmount: 'Payment Amount',
  duration: 'Duration (min)',
  bookedAt: 'Booked At',
  modified: 'Modified',
  changes: 'Changes',
  bookingId: 'Booking ID',
} as const

export type PlateColumn = keyof typeof PLATE_HEADERS

/** Every one of these must be present for a file to be recognised as a Plate bookings export. */
export const PLATE_REQUIRED: PlateColumn[] = ['date', 'time', 'partySize', 'status', 'confirmationCode', 'bookedAt', 'bookingId']
