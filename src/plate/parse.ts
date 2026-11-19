/**
 * Plate "Bookings" CSV export (verified against the October 2026 exports of all four locations):
 *
 *   row 1  headers   Date, Time, Guest, Party Size, Status, Table, Phone, Email, Confirmation Code,
 *                    Source, Booking Type, Occasion, Section, Coming For, Dietary Notes, Special
 *                    Requests, Restaurant Notes, Payment Status, Payment Amount, Duration (min),
 *                    Booked At, Modified, Changes, Booking ID
 *   row 2+   one row per reservation
 *
 * The format is recognised from the headers. The export has no restaurant column: the location
 * and covered period are suggested from the file name and confirmed on import. Personal data
 * (guest name, phone, email, confirmation code, notes) is never kept — the phone number only
 * becomes a one-way guest code for repeat-guest counts.
 */
import { PLATE_CANCELLED_STATUSES, PLATE_COMPLETED_STATUSES, PLATE_DECLINED_STATUSES, PLATE_HEADERS, PLATE_REQUIRED, plateLocationByExportName, type PlateColumn } from '@/config/plate'
import type { CellValue, RawFile } from '@/types/data'
import type { Issue } from '@/types/dataset'
import { fnv1a } from '@/utils/hash'
import type { PlateBooking, PlateControlTotals, PlateInvalidRow, PlateOutcome } from './types'

const norm = (s: string) => s.replace(/^﻿/, '').trim().toLowerCase()

export interface PlateDetection {
  sheetIndex: number
  headerRow: number
  columns: Partial<Record<PlateColumn, number>>
}

export function detectPlate(raw: RawFile): PlateDetection | null {
  for (let sheetIndex = 0; sheetIndex < raw.sheets.length; sheetIndex++) {
    const cells = raw.sheets[sheetIndex].cells
    for (let r = 0; r < Math.min(cells.length, 5); r++) {
      const headers = (cells[r] ?? []).map((v) => (typeof v === 'string' ? norm(v) : ''))
      const columns: PlateDetection['columns'] = {}
      for (const [key, header] of Object.entries(PLATE_HEADERS) as [PlateColumn, string][]) {
        const i = headers.indexOf(norm(header))
        if (i >= 0) columns[key] = i
      }
      if (PLATE_REQUIRED.every((k) => columns[k] !== undefined)) return { sheetIndex, headerRow: r + 1, columns }
    }
  }
  return null
}

const pad = (n: number) => String(n).padStart(2, '0')

function validDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** Strict "yyyy-mm-dd" (or an Excel date). */
export function parsePlateDate(value: CellValue | undefined): string | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10)
  if (typeof value !== 'string') return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!m || !validDate(+m[1], +m[2], +m[3])) return undefined
  return `${m[1]}-${m[2]}-${m[3]}`
}

/** "8:30 PM" → "20:30". Also accepts "20:30". */
export function parsePlateTime(value: CellValue | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const m = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/.exec(value.trim())
  if (!m) return undefined
  let h = +m[1]
  const mi = +m[2]
  if (mi > 59) return undefined
  if (m[3]) {
    if (h < 1 || h > 12) return undefined
    const pm = m[3].toUpperCase() === 'PM'
    h = (h % 12) + (pm ? 12 : 0)
  } else if (h > 23) return undefined
  return `${pad(h)}:${pad(mi)}`
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** "Oct 2, 2026, 6:58 PM" → "2026-10-02 18:58". */
export function parsePlateBookedAt(value: CellValue | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4}),?\s+(\d{1,2}:\d{2}\s*[AaPp][Mm])$/.exec(value.trim())
  if (!m) return undefined
  const month = MONTHS.indexOf(m[1].toLowerCase()) + 1
  const [y, d] = [+m[3], +m[2]]
  const time = parsePlateTime(m[4])
  if (month === 0 || !validDate(y, month, d) || !time) return undefined
  return `${y}-${pad(month)}-${pad(d)} ${time}`
}

const text = (v: CellValue | undefined): string | undefined => {
  if (v === null || v === undefined) return undefined
  const s = (v instanceof Date ? v.toISOString() : String(v)).trim()
  return s === '' ? undefined : s
}

const intOf = (v: CellValue | undefined): number | undefined => {
  if (typeof v === 'number') return Number.isInteger(v) ? v : undefined
  const s = text(v)
  return s && /^\d+$/.test(s) ? Number(s) : undefined
}

export function outcomeOf(status: string): PlateOutcome {
  const s = norm(status)
  if (PLATE_COMPLETED_STATUSES.includes(s)) return 'completed'
  if (PLATE_CANCELLED_STATUSES.includes(s)) return 'cancelled'
  if (PLATE_DECLINED_STATUSES.includes(s)) return 'declined'
  return 'other'
}

/** One-way 64-bit code for a guest identifier. The original value cannot be recovered from it. */
export function guestCode(kind: 'phone' | 'email', value: string): string {
  const v = `${kind}:${value}`
  return `${fnv1a(`a|${v}`)}${fnv1a(`b|${v}`)}`
}

const phoneDigits = (s: string | undefined) => {
  const d = (s ?? '').replace(/\D/g, '')
  return d.length >= 6 ? d : undefined
}

const DAY = 86400000
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY)

/** Values parsed from a row; the location is assigned when the import is confirmed. */
export type PlateParsedBooking = Omit<PlateBooking, 'importId' | 'locationId'> & { row: number }

export function bookingSignature(b: Omit<PlateBooking, 'importId'> | (PlateParsedBooking & { locationId: string })): string {
  const { bookingId, locationId, date, time, partySize, status, source, bookingType, occasion, section, durationMin, bookedAt, guestKey, hasDietaryNotes, hasSpecialRequests, modified, paymentStatus, paymentAmount } = b
  return JSON.stringify([bookingId, locationId, date, time, partySize, status, source, bookingType, occasion, section, durationMin, bookedAt, guestKey, hasDietaryNotes, hasSpecialRequests, modified, paymentStatus, paymentAmount])
}

export const byDateTime = (a: Pick<PlateBooking, 'date' | 'time' | 'bookingId'>, b: Pick<PlateBooking, 'date' | 'time' | 'bookingId'>) =>
  a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.bookingId.localeCompare(b.bookingId)

/** Location and covered period suggested by a Plate file name: "Bookings — <location> — <from> to <to>.csv". */
export interface PlateFileNameInfo {
  exportName?: string
  locationId?: string
  periodStart?: string
  periodEnd?: string
}

export function readPlateFileName(fileName: string): PlateFileNameInfo {
  const m = /^Bookings\s*[—–-]\s*(.+?)\s*[—–]\s*(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/i.exec(fileName.trim())
  if (!m) return {}
  const start = parsePlateDate(m[2])
  const end = parsePlateDate(m[3])
  const ok = start && end && start <= end
  return { exportName: m[1], locationId: plateLocationByExportName(m[1])?.id, periodStart: ok ? start : undefined, periodEnd: ok ? end : undefined }
}

export function controlTotals(bookings: Pick<PlateBooking, 'outcome' | 'partySize'>[]): PlateControlTotals {
  const completed = bookings.filter((b) => b.outcome === 'completed')
  return {
    bookings: bookings.length,
    completed: completed.length,
    covers: completed.reduce((a, b) => a + b.partySize, 0),
    cancelled: bookings.filter((b) => b.outcome === 'cancelled').length,
    declined: bookings.filter((b) => b.outcome === 'declined').length,
    other: bookings.filter((b) => b.outcome === 'other').length,
  }
}

export interface PlateParseResult {
  fileName: string
  detection: PlateDetection
  bookings: PlateParsedBooking[]
  invalid: PlateInvalidRow[]
  sourceRows: number
  /** First and last reservation date in the file. */
  firstDate?: string
  lastDate?: string
  fileNameInfo: PlateFileNameInfo
  statuses: Record<string, number>
  control: PlateControlTotals
  issues: Issue[]
}

export function parsePlate(raw: RawFile, detection: PlateDetection): PlateParseResult {
  const cells = raw.sheets[detection.sheetIndex].cells
  const c = detection.columns
  const issues: Issue[] = []
  const invalid: PlateInvalidRow[] = []
  const candidates: PlateParsedBooking[] = []
  let sourceRows = 0
  let badTimes = 0
  let badBookedAt = 0

  for (let i = detection.headerRow; i < cells.length; i++) {
    const values = cells[i] ?? []
    if (values.every((v) => v === null || v === undefined || v === '')) continue
    sourceRows++
    const row = i + 1
    const get = (k: PlateColumn) => (c[k] === undefined ? undefined : values[c[k] as number])

    const bookingId = text(get('bookingId'))
    const date = parsePlateDate(get('date'))
    const status = text(get('status'))
    const partySize = intOf(get('partySize'))
    if (!bookingId) {
      invalid.push({ row, date, reason: 'Missing Booking ID' })
      continue
    }
    if (!date) {
      const t = text(get('date'))
      invalid.push({ row, bookingId, reason: t ? `Invalid reservation date “${t}”` : 'Missing reservation date' })
      continue
    }
    if (!status) {
      invalid.push({ row, bookingId, date, reason: 'Missing status' })
      continue
    }
    if (partySize === undefined || partySize < 1) {
      const t = text(get('partySize'))
      invalid.push({ row, bookingId, date, reason: t ? `Invalid party size “${t}”` : 'Missing party size (not treated as zero)' })
      continue
    }
    const timeText = text(get('time'))
    const time = parsePlateTime(timeText)
    if (timeText && !time) badTimes++
    const bookedText = text(get('bookedAt'))
    const bookedAt = parsePlateBookedAt(bookedText)
    if (bookedText && !bookedAt) badBookedAt++

    const phone = phoneDigits(text(get('phone')))
    const email = text(get('email'))?.toLowerCase()
    const guestKey = phone ? guestCode('phone', phone) : email ? guestCode('email', email) : undefined
    const modifiedText = text(get('modified'))?.toLowerCase()

    candidates.push({
      row,
      bookingId,
      date,
      time,
      partySize,
      status,
      outcome: outcomeOf(status),
      source: text(get('source')),
      bookingType: text(get('bookingType')),
      occasion: text(get('occasion')),
      section: text(get('section')),
      durationMin: intOf(get('duration')),
      bookedAt,
      leadDays: bookedAt ? dayDiff(date, bookedAt.slice(0, 10)) : undefined,
      guestKey,
      guestKeySource: phone ? 'phone' : email ? 'email' : undefined,
      hasDietaryNotes: text(get('dietaryNotes')) !== undefined,
      hasSpecialRequests: text(get('specialRequests')) !== undefined,
      modified: modifiedText === 'yes' || modifiedText === 'true',
      paymentStatus: text(get('paymentStatus')),
      paymentAmount: text(get('paymentAmount')),
    })
  }

  // One row per Booking ID: identical repeats count once; conflicting repeats are not imported.
  const byId = new Map<string, PlateParsedBooking[]>()
  for (const b of candidates) byId.set(b.bookingId, [...(byId.get(b.bookingId) ?? []), b])
  const bookings: PlateParsedBooking[] = []
  let identicalRepeats = 0
  for (const [bookingId, group] of byId) {
    if (new Set(group.map((g) => bookingSignature({ ...g, locationId: '' }))).size === 1) {
      bookings.push(group[0])
      identicalRepeats += group.length - 1
    } else for (const g of group) invalid.push({ row: g.row, bookingId, date: g.date, reason: 'Conflicting duplicate rows for this Booking ID (not imported)' })
  }
  bookings.sort(byDateTime)
  invalid.sort((a, b) => a.row - b.row)

  const statuses: Record<string, number> = {}
  for (const b of bookings) statuses[b.status] = (statuses[b.status] ?? 0) + 1
  const dates = bookings.map((b) => b.date).sort()

  if (bookings.length === 0) issues.push({ level: 'error', message: 'No valid reservation rows were found.' })
  const other = Object.entries(statuses).filter(([s]) => outcomeOf(s) === 'other')
  if (other.length > 0)
    issues.push({
      level: 'warning',
      message: `Status value(s) with no configured meaning: ${other.map(([s, n]) => `“${s}” (${n})`).join(', ')}. These reservations are stored and listed under their status, but not counted as completed, cancelled or declined.`,
    })
  if (invalid.length > 0) issues.push({ level: 'warning', message: `${invalid.length} row(s) could not be read and are not imported (listed below).` })
  if (identicalRepeats > 0) issues.push({ level: 'info', message: `${identicalRepeats} repeated row(s) of the same booking were counted once.` })
  if (badTimes > 0) issues.push({ level: 'warning', message: `${badTimes} reservation time value(s) could not be read; those bookings are left out of the time-slot analysis only.` })
  if (badBookedAt > 0) issues.push({ level: 'warning', message: `${badBookedAt} “Booked At” value(s) could not be read; those bookings are left out of the lead-time analysis only.` })
  const noGuest = bookings.filter((b) => !b.guestKey).length
  if (noGuest > 0) issues.push({ level: 'info', message: `${noGuest} booking(s) have no phone number or email and cannot be counted in repeat-guest figures.` })

  return {
    fileName: raw.fileName,
    detection,
    bookings,
    invalid,
    sourceRows,
    firstDate: dates[0],
    lastDate: dates[dates.length - 1],
    fileNameInfo: readPlateFileName(raw.fileName),
    statuses,
    control: controlTotals(bookings),
    issues,
  }
}

/** Problems with the chosen location / period for a parsed file. Errors block the import. */
export function checkPlateTarget(parsed: Pick<PlateParseResult, 'bookings'>, locationId: string | undefined, periodStart: string | undefined, periodEnd: string | undefined): Issue[] {
  const issues: Issue[] = []
  if (!locationId) issues.push({ level: 'error', message: 'Choose the Plate location of this file (the export has no restaurant column).' })
  if (!periodStart || !periodEnd || !parsePlateDate(periodStart) || !parsePlateDate(periodEnd) || periodStart > periodEnd) {
    issues.push({ level: 'error', message: 'Enter the period the export covers (from and to dates).' })
    return issues
  }
  const outside = parsed.bookings.filter((b) => b.date < periodStart || b.date > periodEnd).length
  if (outside > 0) issues.push({ level: 'error', message: `${outside} reservation(s) are dated outside ${periodStart} to ${periodEnd}. Correct the covered period before importing.` })
  return issues
}

export function fingerprintPlate(bookings: PlateParsedBooking[], locationId: string): string {
  return `${bookings.length}-${fnv1a(bookings.map((b) => bookingSignature({ ...b, locationId })).join('\n'))}`
}
