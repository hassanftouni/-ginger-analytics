/**
 * Plate reservation analytics. Works only on Plate bookings — Weevi, Toters and Foody data are
 * never read here, and reservations are never turned into sales.
 *
 * Reporting date = reservation date. A date is "covered" for a location when an included
 * import's period (the export period, confirmed on import) contains it: a covered date without
 * bookings is a real zero, a date outside every imported period is missing and never zero.
 */
import { PLATE_LOCATIONS, PLATE_RULES } from '@/config/plate'
import { controlTotals } from './parse'
import type { PlateBooking, PlateControlTotals, PlateFilters, PlateGrain, PlateImport, PlateState } from './types'

const included = (i: PlateImport) => i.included !== false

export interface PlateLocationInfo {
  id: string
  label: string
  note?: string
  index: number
}

export const PLATE_LOCATION_INFO: PlateLocationInfo[] = PLATE_LOCATIONS.map((l, index) => ({ id: l.id, label: l.label, note: l.note, index }))
export const plateLocationLabel = (id: string) => PLATE_LOCATION_INFO.find((l) => l.id === id)?.label ?? id

export interface PlateMetrics {
  /** All reservations, any status. */
  bookings: number
  completed: number
  /** Guests of completed reservations. */
  covers: number
  /** Covers ÷ completed reservations. */
  avgPartySize?: number
  cancelled: number
  cancelledGuests: number
  declined: number
  declinedGuests: number
  other: number
  /** Share of all reservations. */
  completionRate?: number
  cancellationRate?: number
  declineRate?: number
  /** Distinct identified guests with a completed reservation. */
  uniqueGuests: number
}

export function metricsOf(bookings: PlateBooking[]): PlateMetrics {
  const completed = bookings.filter((b) => b.outcome === 'completed')
  const cancelled = bookings.filter((b) => b.outcome === 'cancelled')
  const declined = bookings.filter((b) => b.outcome === 'declined')
  const guests = (list: PlateBooking[]) => list.reduce((a, b) => a + b.partySize, 0)
  const covers = guests(completed)
  const n = bookings.length
  return {
    bookings: n,
    completed: completed.length,
    covers,
    avgPartySize: completed.length > 0 ? covers / completed.length : undefined,
    cancelled: cancelled.length,
    cancelledGuests: guests(cancelled),
    declined: declined.length,
    declinedGuests: guests(declined),
    other: bookings.filter((b) => b.outcome === 'other').length,
    completionRate: n > 0 ? completed.length / n : undefined,
    cancellationRate: n > 0 ? cancelled.length / n : undefined,
    declineRate: n > 0 ? declined.length / n : undefined,
    uniqueGuests: new Set(completed.map((b) => b.guestKey).filter(Boolean)).size,
  }
}

export interface PlateDailyPoint {
  date: string
  /** Null when no selected location has imported data for the date. */
  bookings: number | null
  completed: number | null
  covers: number | null
  cancelled: number | null
  declined: number | null
  /** Covers per location (null = not covered). */
  byLocation: Record<string, number | null>
  status: 'complete' | 'partial' | 'missing'
  missingLocations: string[]
}

export interface PlatePeriodRow {
  key: string
  start: string
  end: string
  metrics: PlateMetrics
  daysCovered: number
  calendarDays: number
  partial: boolean
  /** Covers change versus the previous bucket. */
  change?: number
}

export interface PlateLocationRow {
  info: PlateLocationInfo
  metrics: PlateMetrics
  /** Share of covers in the selection. */
  share?: number
  daysCovered: number
  missingDays: number
  busiest?: { date: string; covers: number }
}

export interface PlateCountRow {
  key: string
  label: string
  bookings: number
  completed: number
  covers: number
  /** Share of the base (see each list). */
  share?: number
}

export interface PlateWeekdayRow extends PlateCountRow {
  /** Covered calendar days of this weekday in the range. */
  days: number
  avgCovers?: number
}

export interface PlateGuestRow {
  /** Anonymised label — no personal data. */
  label: string
  visitsAllTime: number
  visitsInRange: number
  coversInRange: number
  locations: number
  lastVisit: string
}

export interface PlateGuestStats {
  /** Identified guests with a completed reservation in the selection. */
  guests: number
  repeat: number
  repeatShare?: number
  returning: number
  firstTime: number
  /** Guests with 2+ completed reservations inside the selection. */
  repeatInRange: number
  /** Guests seen at 2+ locations (all imported months); only with all locations selected. */
  multiLocation?: number
  /** Completed reservations in the selection without a phone number or email. */
  unidentified: number
  top: PlateGuestRow[]
  /** True when the earliest stored data starts at the selection start (returning cannot be known). */
  noHistoryBefore: boolean
}

export interface PlateComparison {
  mode: 'previous' | 'custom'
  current: { start: string; end: string; metrics: PlateMetrics; daysCovered: number; calendarDays: number }
  baseline: { start: string; end: string; metrics: PlateMetrics; daysCovered: number; calendarDays: number }
  change: Partial<Record<'bookings' | 'completed' | 'covers' | 'avgPartySize' | 'cancelled' | 'declined' | 'uniqueGuests', number>>
  pointChange: Partial<Record<'cancellationRate' | 'declineRate', number>>
  baselineIncomplete: boolean
  currentIncomplete: boolean
}

export interface PlateReconciliation {
  importId: string
  fileName: string
  control: PlateControlTotals
  stored: PlateControlTotals
  matches: boolean
  suppliedElsewhere: number
}

export interface PlateQualityItem {
  level: 'error' | 'warning' | 'info'
  message: string
}

export interface PlateAnalytics {
  filters: PlateFilters
  locations: PlateLocationInfo[]
  range?: { start: string; end: string }
  calendar: string[]
  totals: PlateMetrics & { daysCovered: number; calendarDays: number; missingLocationDays: number; avgCoversPerDay?: number }
  daily: PlateDailyPoint[]
  periods: PlatePeriodRow[]
  locationRows: PlateLocationRow[]
  busiestDay?: { date: string; covers: number; bookings: number }
  comparison?: PlateComparison
  weekdays: PlateWeekdayRow[]
  timeSlots: PlateCountRow[]
  partySizes: PlateCountRow[]
  leadTime: { rows: PlateCountRow[]; average?: number; median?: number; known: number }
  mix: { source: PlateCountRow[]; section: PlateCountRow[]; occasion: PlateCountRow[]; bookingType: PlateCountRow[]; status: (PlateCountRow & { outcome: string })[] }
  guests: PlateGuestStats
  extras: { dietaryNotes: number; specialRequests: number; modified: number; withPayment: number; noTime: number }
  bookings: PlateBooking[]
  reconciliation: PlateReconciliation[]
  imports: PlateImport[]
  allImports: PlateImport[]
  quality: PlateQualityItem[]
  hasData: boolean
}

const DAY = 86400000
const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function dateSpan(start: string, end: string): string[] {
  const out: string[] = []
  for (let t = toMs(start); t <= toMs(end); t += DAY) out.push(fromMs(t))
  return out
}

export const addDays = (iso: string, days: number) => fromMs(toMs(iso) + days * DAY)

export function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

function bucketOf(date: string, grain: PlateGrain): { key: string; start: string; end: string } {
  if (grain === 'week') {
    const start = weekStart(date)
    return { key: start, start, end: addDays(start, 6) }
  }
  if (grain === 'month') {
    const [y, m] = date.split('-').map(Number)
    return { key: date.slice(0, 7), start: `${date.slice(0, 7)}-01`, end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) }
  }
  return { key: date, start: date, end: date }
}

const ratio = (a: number | undefined, b: number | undefined) => (a === undefined || b === undefined || b === 0 ? undefined : (a - b) / Math.abs(b))
const points = (a: number | undefined, b: number | undefined) => (a === undefined || b === undefined ? undefined : a - b)

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const weekdayIndex = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7

/** Lead-time buckets (reservation date − booked date). */
export const LEAD_BUCKETS: { key: string; label: string; test: (d: number) => boolean }[] = [
  { key: 'after', label: 'Booked after the reservation date', test: (d) => d < 0 },
  { key: '0', label: 'Same day', test: (d) => d === 0 },
  { key: '1', label: '1 day ahead', test: (d) => d === 1 },
  { key: '2-3', label: '2–3 days ahead', test: (d) => d >= 2 && d <= 3 },
  { key: '4-7', label: '4–7 days ahead', test: (d) => d >= 4 && d <= 7 },
  { key: '8-14', label: '8–14 days ahead', test: (d) => d >= 8 && d <= 14 },
  { key: '15+', label: '15+ days ahead', test: (d) => d >= 15 },
]

function countRows(bookings: PlateBooking[], key: (b: PlateBooking) => string | undefined, opts: { sort?: 'count' | 'key'; shareBase?: 'bookings' | 'completed' } = {}): PlateCountRow[] {
  const map = new Map<string, PlateCountRow>()
  for (const b of bookings) {
    const label = key(b) ?? 'Not stated'
    const row = map.get(label) ?? { key: label, label, bookings: 0, completed: 0, covers: 0 }
    row.bookings++
    if (b.outcome === 'completed') {
      row.completed++
      row.covers += b.partySize
    }
    map.set(label, row)
  }
  const rows = [...map.values()]
  if (opts.sort === 'key') rows.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
  else rows.sort((a, b) => b.bookings - a.bookings || b.covers - a.covers || a.label.localeCompare(b.label))
  const base = opts.shareBase === 'completed' ? rows.reduce((a, r) => a + r.completed, 0) : bookings.length
  for (const r of rows) r.share = base > 0 ? (opts.shareBase === 'completed' ? r.completed : r.bookings) / base : undefined
  return rows
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** "20:30" → "8:30 PM" for display. */
export function displayTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export function computePlateAnalytics(state: PlateState, filters: PlateFilters): PlateAnalytics {
  const locations = PLATE_LOCATION_INFO.filter((l) => filters.location === 'all' || l.id === filters.location)
  const locIds = new Set(locations.map((l) => l.id))
  const excludedIds = new Set(state.imports.filter((i) => !included(i)).map((i) => i.id))
  const scope = state.bookings.filter((b) => locIds.has(b.locationId) && !excludedIds.has(b.importId))
  const allImports = state.imports.filter((i) => locIds.has(i.locationId))
  const imports = allImports.filter(included)

  const covered = new Map<string, Set<string>>()
  for (const i of imports) {
    const set = covered.get(i.locationId) ?? new Set<string>()
    for (const d of dateSpan(i.periodStart, i.periodEnd)) set.add(d)
    covered.set(i.locationId, set)
  }
  const isCovered = (loc: string, date: string) => covered.get(loc)?.has(date) ?? false

  const coveredDates = [...new Set(locations.flatMap((l) => [...(covered.get(l.id) ?? [])]))].sort()
  const start = filters.from || coveredDates[0]
  const end = filters.to || coveredDates[coveredDates.length - 1]
  const range = start && end && start <= end ? { start, end } : undefined
  const calendar = range ? dateSpan(range.start, range.end) : []
  const inRange = (date: string, r = range) => Boolean(r && date >= r.start && date <= r.end)
  const bookings = scope.filter((b) => inRange(b.date))

  const byDate = new Map<string, PlateBooking[]>()
  for (const b of bookings) byDate.set(b.date, [...(byDate.get(b.date) ?? []), b])

  const daily: PlateDailyPoint[] = calendar.map((date) => {
    const day = byDate.get(date) ?? []
    const byLocation: Record<string, number | null> = {}
    const missingLocations: string[] = []
    let any = false
    for (const l of locations) {
      if (isCovered(l.id, date)) {
        any = true
        byLocation[l.id] = day.filter((b) => b.locationId === l.id && b.outcome === 'completed').reduce((a, b) => a + b.partySize, 0)
      } else {
        byLocation[l.id] = null
        missingLocations.push(l.label)
      }
    }
    const m = metricsOf(day.filter((b) => isCovered(b.locationId, date)))
    return {
      date,
      bookings: any ? m.bookings : null,
      completed: any ? m.completed : null,
      covers: any ? m.covers : null,
      cancelled: any ? m.cancelled : null,
      declined: any ? m.declined : null,
      byLocation,
      status: !any ? 'missing' : missingLocations.length > 0 ? 'partial' : 'complete',
      missingLocations,
    }
  })

  const totalsMetrics = metricsOf(bookings)
  const hasData = daily.some((d) => d.status !== 'missing')

  const locationRows: PlateLocationRow[] = locations.map((l) => {
    const own = bookings.filter((b) => b.locationId === l.id)
    const daysCovered = calendar.filter((d) => isCovered(l.id, d)).length
    const perDay = new Map<string, number>()
    for (const b of own) if (b.outcome === 'completed') perDay.set(b.date, (perDay.get(b.date) ?? 0) + b.partySize)
    let busiest: PlateLocationRow['busiest']
    for (const [date, covers] of perDay) if (!busiest || covers > busiest.covers || (covers === busiest.covers && date < busiest.date)) busiest = { date, covers }
    const metrics = metricsOf(own)
    return { info: l, metrics, share: hasData && totalsMetrics.covers > 0 ? metrics.covers / totalsMetrics.covers : undefined, daysCovered, missingDays: calendar.length - daysCovered, busiest }
  })

  let busiestDay: PlateAnalytics['busiestDay']
  for (const d of daily) if (d.covers !== null && d.covers > 0 && (!busiestDay || d.covers > busiestDay.covers)) busiestDay = { date: d.date, covers: d.covers, bookings: d.completed ?? 0 }

  // Period table.
  const buckets = new Map<string, { row: PlatePeriodRow; list: PlateBooking[] }>()
  for (const p of daily) {
    const b = bucketOf(p.date, filters.grain)
    const entry = buckets.get(b.key) ?? { row: { key: b.key, start: p.date, end: p.date, metrics: metricsOf([]), daysCovered: 0, calendarDays: 0, partial: false }, list: [] }
    entry.row.end = p.date
    entry.row.calendarDays++
    if (p.status !== 'missing') entry.row.daysCovered++
    if (p.status !== 'complete') entry.row.partial = true
    if (range && (b.start < range.start || b.end > range.end)) entry.row.partial = true
    entry.list.push(...(byDate.get(p.date) ?? []))
    buckets.set(b.key, entry)
  }
  const periods = [...buckets.values()].map(({ row, list }) => ({ ...row, metrics: metricsOf(list) }))
  periods.forEach((p, i) => {
    const prev = periods[i - 1]
    if (prev && prev.daysCovered > 0 && p.daysCovered > 0) p.change = ratio(p.metrics.covers, prev.metrics.covers)
  })

  // Comparison.
  let comparison: PlateComparison | undefined
  if (range && filters.compare !== 'none') {
    const days = calendar.length
    const baseRange =
      filters.compare === 'previous'
        ? { start: addDays(range.start, -days), end: addDays(range.start, -1) }
        : filters.compareFrom && filters.compareTo && filters.compareFrom <= filters.compareTo
          ? { start: filters.compareFrom, end: filters.compareTo }
          : undefined
    if (baseRange) {
      const baseCalendar = dateSpan(baseRange.start, baseRange.end)
      const coveredCount = (cal: string[]) => cal.filter((d) => locations.some((l) => isCovered(l.id, d))).length
      const fully = (cal: string[]) => cal.every((d) => locations.every((l) => isCovered(l.id, d)))
      const base = metricsOf(scope.filter((b) => inRange(b.date, baseRange)))
      const cur = totalsMetrics
      comparison = {
        mode: filters.compare,
        current: { ...range, metrics: cur, daysCovered: coveredCount(calendar), calendarDays: calendar.length },
        baseline: { ...baseRange, metrics: base, daysCovered: coveredCount(baseCalendar), calendarDays: baseCalendar.length },
        change: {
          bookings: ratio(cur.bookings, base.bookings),
          completed: ratio(cur.completed, base.completed),
          covers: ratio(cur.covers, base.covers),
          avgPartySize: ratio(cur.avgPartySize, base.avgPartySize),
          cancelled: ratio(cur.cancelled, base.cancelled),
          declined: ratio(cur.declined, base.declined),
          uniqueGuests: ratio(cur.uniqueGuests, base.uniqueGuests),
        },
        pointChange: { cancellationRate: points(cur.cancellationRate, base.cancellationRate), declineRate: points(cur.declineRate, base.declineRate) },
        baselineIncomplete: !fully(baseCalendar),
        currentIncomplete: !fully(calendar),
      }
    }
  }

  // Patterns (completed reservations: when guests actually came).
  const completed = bookings.filter((b) => b.outcome === 'completed')
  const coveredCalendar = daily.filter((d) => d.status !== 'missing').map((d) => d.date)
  const weekdays: PlateWeekdayRow[] = WEEKDAYS.map((label, i) => {
    const own = bookings.filter((b) => weekdayIndex(b.date) === i)
    const done = own.filter((b) => b.outcome === 'completed')
    const days = coveredCalendar.filter((d) => weekdayIndex(d) === i).length
    const covers = done.reduce((a, b) => a + b.partySize, 0)
    return { key: String(i), label, bookings: own.length, completed: done.length, covers, days, avgCovers: days > 0 ? covers / days : undefined }
  })
  const totalCovers = totalsMetrics.covers
  for (const w of weekdays) w.share = totalCovers > 0 ? w.covers / totalCovers : undefined

  const timeSlots = countRows(
    completed.filter((b) => b.time),
    (b) => b.time,
    { sort: 'key', shareBase: 'completed' },
  ).map((r) => ({ ...r, label: displayTime(r.key) }))
  const partySizes = countRows(completed, (b) => String(b.partySize), { sort: 'key', shareBase: 'completed' }).map((r) => ({ ...r, label: `${r.key} guest${r.key === '1' ? '' : 's'}` }))

  const withLead = bookings.filter((b) => b.leadDays !== undefined)
  const leadRows: PlateCountRow[] = LEAD_BUCKETS.map((bk) => {
    const own = withLead.filter((b) => bk.test(b.leadDays as number))
    const done = own.filter((b) => b.outcome === 'completed')
    return { key: bk.key, label: bk.label, bookings: own.length, completed: done.length, covers: done.reduce((a, b) => a + b.partySize, 0), share: withLead.length > 0 ? own.length / withLead.length : undefined }
  }).filter((r) => r.bookings > 0 || r.key !== 'after')
  const leadValues = withLead.map((b) => b.leadDays as number)

  const outcomeLabel = { completed: 'Completed (guests came)', cancelled: 'Cancelled by the guest', declined: 'Declined by the restaurant', other: 'No configured meaning' } as const
  const statusRows = countRows(bookings, (b) => b.status).map((r) => {
    const sample = bookings.find((b) => b.status === r.key)
    const guests = bookings.filter((b) => b.status === r.key).reduce((a, b) => a + b.partySize, 0)
    return { ...r, covers: guests, outcome: sample ? outcomeLabel[sample.outcome] : '' }
  })

  // Guests (one-way codes only). Visits = completed reservations, across all imported months.
  const visitsAll = new Map<string, PlateBooking[]>()
  for (const b of scope) if (b.outcome === 'completed' && b.guestKey) visitsAll.set(b.guestKey, [...(visitsAll.get(b.guestKey) ?? []), b])
  const inRangeGuests = new Map<string, PlateBooking[]>()
  for (const b of completed) if (b.guestKey) inRangeGuests.set(b.guestKey, [...(inRangeGuests.get(b.guestKey) ?? []), b])
  const allLocVisits = new Map<string, Set<string>>()
  for (const b of state.bookings) if (b.outcome === 'completed' && b.guestKey && !excludedIds.has(b.importId)) allLocVisits.set(b.guestKey, (allLocVisits.get(b.guestKey) ?? new Set()).add(b.locationId))
  const earliest = scope.reduce<string | undefined>((m, b) => (!m || b.date < m ? b.date : m), undefined)
  let repeat = 0
  let returning = 0
  let repeatInRange = 0
  let multiLocation = 0
  const top: PlateGuestRow[] = []
  for (const [key, list] of inRangeGuests) {
    const all = visitsAll.get(key) ?? []
    if (all.length >= 2) repeat++
    if (range && all.some((b) => b.date < range.start)) returning++
    if (list.length >= 2) repeatInRange++
    if ((allLocVisits.get(key)?.size ?? 0) >= 2) multiLocation++
    if (all.length >= 2)
      top.push({
        label: `GUEST-${key.slice(0, 6).toUpperCase()}`,
        visitsAllTime: all.length,
        visitsInRange: list.length,
        coversInRange: list.reduce((a, b) => a + b.partySize, 0),
        locations: new Set(all.map((b) => b.locationId)).size,
        lastVisit: all.reduce((m, b) => (b.date > m ? b.date : m), ''),
      })
  }
  top.sort((a, b) => b.visitsAllTime - a.visitsAllTime || b.coversInRange - a.coversInRange || a.label.localeCompare(b.label))
  const guestCount = inRangeGuests.size
  const guests: PlateGuestStats = {
    guests: guestCount,
    repeat,
    repeatShare: guestCount > 0 ? repeat / guestCount : undefined,
    returning,
    firstTime: guestCount - returning,
    repeatInRange,
    multiLocation: filters.location === 'all' ? multiLocation : undefined,
    unidentified: completed.filter((b) => !b.guestKey).length,
    top: top.slice(0, 20),
    noHistoryBefore: !range || !earliest || earliest >= range.start,
  }

  // Validation: each included file's own totals against the bookings stored from it.
  const byId = new Map(state.bookings.map((b) => [b.bookingId, b]))
  const reconciliation: PlateReconciliation[] = imports.map((i) => {
    const stored = i.bookingIds.map((id) => byId.get(id)).filter((b): b is PlateBooking => b !== undefined)
    const totals = controlTotals(stored)
    const c = i.control
    const matches = (Object.keys(c) as (keyof PlateControlTotals)[]).every((k) => c[k] === totals[k])
    return { importId: i.id, fileName: i.fileName, control: c, stored: totals, matches, suppliedElsewhere: stored.filter((b) => b.importId !== i.id).length }
  })

  const extras = {
    dietaryNotes: bookings.filter((b) => b.hasDietaryNotes).length,
    specialRequests: bookings.filter((b) => b.hasSpecialRequests).length,
    modified: bookings.filter((b) => b.modified).length,
    withPayment: bookings.filter((b) => b.paymentStatus || b.paymentAmount).length,
    noTime: bookings.filter((b) => !b.time).length,
  }

  const missingLocationDays = locationRows.reduce((a, r) => a + r.missingDays, 0)
  const quality: PlateQualityItem[] = []
  for (const r of locationRows) {
    if (!range) continue
    if (r.daysCovered === 0) quality.push({ level: 'warning', message: `${r.info.label}: no Plate export imported for ${range.start} to ${range.end}.` })
    else if (r.missingDays > 0) quality.push({ level: 'warning', message: `${r.info.label}: ${r.missingDays} day(s) outside every imported Plate export (shown as missing, not zero).` })
  }
  for (const rec of reconciliation) {
    quality.push(
      rec.matches
        ? { level: 'info', message: `“${rec.fileName}”: stored bookings match the file (${rec.control.bookings} bookings · ${rec.control.completed} completed · ${rec.control.covers} guests).` }
        : {
            level: 'warning',
            message: `“${rec.fileName}”: stored values differ from the file (file ${rec.control.completed} completed / ${rec.control.covers} guests, stored ${rec.stored.completed} / ${rec.stored.covers})${rec.suppliedElsewhere > 0 ? ` — ${rec.suppliedElsewhere} of its bookings now hold values from another import` : ''}.`,
          },
    )
  }
  if (totalsMetrics.other > 0) quality.push({ level: 'warning', message: `${totalsMetrics.other} reservation(s) have a status with no configured meaning; they count in total bookings only.` })
  const notRead = imports.reduce((a, i) => a + i.invalidRows.length, 0)
  if (notRead > 0) quality.push({ level: 'error', message: `${notRead} row(s) in the imported files could not be read and were not imported.` })
  const excluded = allImports.filter((i) => !included(i))
  if (excluded.length > 0) quality.push({ level: 'warning', message: `${excluded.length} Plate import(s) are excluded from analysis (${[...new Set(excluded.map((i) => i.fileName))].join(', ')}).` })
  if (comparison?.baselineIncomplete) quality.push({ level: 'warning', message: `Comparison period ${comparison.baseline.start} to ${comparison.baseline.end} has days without imported Plate data — the comparison is not like for like.` })
  if (guests.unidentified > 0) quality.push({ level: 'info', message: `${guests.unidentified} completed reservation(s) have no phone number or email and are not in the guest counts.` })
  if (range && guests.noHistoryBefore) quality.push({ level: 'info', message: 'No Plate data is imported before the selected period, so “returning guests” only reflects repeat visits within the imported data.' })
  if (extras.noTime > 0) quality.push({ level: 'info', message: `${extras.noTime} reservation(s) have no readable time and are left out of the time-slot analysis.` })
  if (extras.withPayment > 0) quality.push({ level: 'info', message: `${extras.withPayment} reservation(s) carry payment information. The export states no currency, so no amounts are reported.` })
  quality.push({ level: 'info', message: `${PLATE_RULES.date}. ${PLATE_RULES.completed}. ${PLATE_RULES.covers}.` })
  quality.push({ level: 'info', message: `${PLATE_RULES.cancelled}. ${PLATE_RULES.declined}.` })
  quality.push({ level: 'info', message: `${PLATE_RULES.repeat}.` })
  quality.push({ level: 'info', message: `${PLATE_RULES.notInExport}.` })
  quality.push({ level: 'info', message: `${PLATE_RULES.privacy}.` })
  quality.push({ level: 'info', message: 'Plate reservations are reported separately and are never combined with Weevi, Toters or Foody sales.' })

  const daysCovered = daily.filter((d) => d.status !== 'missing').length
  return {
    filters,
    locations,
    range,
    calendar,
    totals: { ...totalsMetrics, daysCovered, calendarDays: calendar.length, missingLocationDays, avgCoversPerDay: daysCovered > 0 ? totalsMetrics.covers / daysCovered : undefined },
    daily,
    periods,
    locationRows,
    busiestDay,
    comparison,
    weekdays,
    timeSlots,
    partySizes,
    leadTime: { rows: leadRows, average: leadValues.length > 0 ? leadValues.reduce((a, b) => a + b, 0) / leadValues.length : undefined, median: median(leadValues), known: withLead.length },
    mix: {
      source: countRows(bookings, (b) => b.source),
      section: countRows(bookings, (b) => b.section),
      occasion: countRows(bookings, (b) => b.occasion),
      bookingType: countRows(bookings, (b) => b.bookingType),
      status: statusRows,
    },
    guests,
    extras,
    bookings,
    reconciliation,
    imports,
    allImports,
    quality,
    hasData,
  }
}
