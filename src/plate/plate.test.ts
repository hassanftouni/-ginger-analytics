import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectFoody } from '@/foody/parse'
import { rawCsv, rawFromDisk } from '@/test/build'
import { detectToters } from '@/toters/parse'
import type { RawFile } from '@/types/data'
import { computePlateAnalytics } from './analytics'
import { applyPlateImport, planPlateImport, removePlateImport, setPlateImportIncluded, type PlateTarget } from './merge'
import { checkPlateTarget, detectPlate, parsePlate, parsePlateBookedAt, parsePlateTime, readPlateFileName } from './parse'
import { DEFAULT_PLATE_FILTERS, EMPTY_PLATE_STATE, type PlateFilters, type PlateState } from './types'

// Synthetic fixtures in the verified Plate layout (no real guests).
const HEADER =
  'Date,Time,Guest,Party Size,Status,Table,Phone,Email,Confirmation Code,Source,Booking Type,Occasion,Section,Coming For,Dietary Notes,Special Requests,Restaurant Notes,Payment Status,Payment Amount,Duration (min),Booked At,Modified,Changes,Booking ID'
type Row = { id: string; date: string; time?: string; size?: number | string; status?: string; phone?: string; source?: string; section?: string; booked?: string }
const line = (r: Row) =>
  [r.date, r.time ?? '8:00 PM', 'Test Guest', r.size ?? 2, r.status ?? 'Completed', '', r.phone ?? '+961 70 000 001', '', 'ABC123', r.source ?? 'Mobile app', 'Regular', '', r.section ?? 'Indoor', '', '', '', '', '', '', 120, `"${r.booked ?? 'Oct 1, 2026, 10:00 AM'}"`, '', '', r.id].join(',')
const csv = (rows: Row[], name = 'Bookings — Ginger&Co - Hazmieh — 2026-10-01 to 2026-10-31.csv') => rawCsv(`﻿${HEADER}\n${rows.map(line).join('\n')}\n`, name)

const parse = (raw: RawFile) => parsePlate(raw, detectPlate(raw)!)
const OCT: PlateTarget = { locationId: 'ginger-hazmieh', periodStart: '2026-10-01', periodEnd: '2026-10-31' }

let n = 0
function importInto(state: PlateState, raw: RawFile, target: PlateTarget = OCT, resolution: 'replace' | 'keep' = 'keep') {
  const p = parse(raw)
  const errors = [...p.issues, ...checkPlateTarget(p, target.locationId, target.periodStart, target.periodEnd)].filter((i) => i.level === 'error')
  if (errors.length > 0) throw new Error(errors.map((i) => i.message).join('; '))
  const plan = planPlateImport(state, p, target)
  if (plan.kind === 'identical') return { state, plan, entry: undefined }
  n++
  return { ...applyPlateImport(state, p, plan, target, resolution, { id: `imp-${n}`, fileName: raw.fileName, fileSize: 1, importedAt: n, warnings: [] }), plan }
}
const analyse = (state: PlateState, f: Partial<PlateFilters> = {}) => computePlateAnalytics(state, { ...DEFAULT_PLATE_FILTERS, ...f })

describe('Plate parsing', () => {
  it('reads times, booked-at timestamps and the file name', () => {
    expect(parsePlateTime('8:30 PM')).toBe('20:30')
    expect(parsePlateTime('12:00 PM')).toBe('12:00')
    expect(parsePlateTime('12:15 AM')).toBe('00:15')
    expect(parsePlateTime('13:00 PM')).toBeUndefined()
    expect(parsePlateBookedAt('Oct 2, 2026, 6:58 PM')).toBe('2026-10-02 18:58')
    expect(parsePlateBookedAt('Sep 29, 2026, 11:01 AM')).toBe('2026-09-29 11:01')
    expect(parsePlateBookedAt('Feb 30, 2026, 1:00 PM')).toBeUndefined()
    expect(readPlateFileName('Bookings — Ginger&Co - Jal El Dib — 2026-10-01 to 2026-10-31 (1).csv')).toEqual({ exportName: 'Ginger&Co - Jal El Dib', locationId: 'ginger-jal-el-dib', periodStart: '2026-10-01', periodEnd: '2026-10-31' })
    expect(readPlateFileName('Bookings — Ginger&Co - Pertutti Hamra — 2026-10-01 to 2026-10-31.csv').locationId).toBe('hamra')
    expect(readPlateFileName('Bookings — Pertutti - Hazmieh — 2026-10-01 to 2026-10-31.csv').locationId).toBe('pertutti-hazmieh')
    expect(readPlateFileName('Bookings — Somewhere Else — 2026-10-01 to 2026-10-31.csv')).toMatchObject({ exportName: 'Somewhere Else', locationId: undefined })
    expect(readPlateFileName('export.csv')).toEqual({})
  })

  it('is recognised only from its headers and not taken for Toters or Foody', () => {
    const raw = csv([{ id: 'b1', date: '2026-10-02' }])
    expect(detectPlate(raw)).not.toBeNull()
    expect(detectToters(raw)).toBeNull()
    expect(detectFoody(raw)).toBeNull()
    expect(detectPlate(rawCsv('Date,Orders\n2026-10-01,3\n'))).toBeNull()
  })

  it('classifies statuses, keeps no personal data and rejects unreadable rows', () => {
    const p = parse(
      csv([
        { id: 'b1', date: '2026-10-02', size: 4 },
        { id: 'b2', date: '2026-10-02', status: 'Cancelled by User', size: 3 },
        { id: 'b3', date: '2026-10-03', status: 'Declined' },
        { id: 'b4', date: '2026-10-03', status: 'No Show' },
        { id: 'b5', date: '2026-10-04', size: '' },
        { id: 'b6', date: '04/10/2026' },
      ]),
    )
    expect(p.control).toEqual({ bookings: 4, completed: 1, covers: 4, cancelled: 1, declined: 1, other: 1 })
    expect(p.invalid.map((r) => r.reason)).toEqual(['Missing party size (not treated as zero)', 'Invalid reservation date “04/10/2026”'])
    expect(p.issues.some((i) => i.level === 'warning' && i.message.includes('“No Show” (1)'))).toBe(true)
    const json = JSON.stringify(p.bookings)
    expect(json).not.toContain('Test Guest')
    expect(json).not.toContain('961')
    expect(json).not.toContain('ABC123')
    expect(p.bookings[0].guestKey).toMatch(/^[0-9a-f]{16}$/)
    expect(p.bookings[0].leadDays).toBe(1)
  })

  it('requires a location and a period that contains every reservation', () => {
    const p = parse(csv([{ id: 'b1', date: '2026-10-02' }]))
    expect(checkPlateTarget(p, undefined, '2026-10-01', '2026-10-31').some((i) => i.level === 'error')).toBe(true)
    expect(checkPlateTarget(p, 'hamra', '2026-10-05', '2026-10-31').some((i) => i.message.includes('outside'))).toBe(true)
    expect(checkPlateTarget(p, 'hamra', '2026-10-01', '2026-10-31')).toEqual([])
  })
})

describe('Plate import and analytics', () => {
  it('counts a booking once across overlapping files and asks before replacing changed values', () => {
    let s = importInto(EMPTY_PLATE_STATE, csv([{ id: 'b1', date: '2026-10-02' }, { id: 'b2', date: '2026-10-03' }])).state
    const again = importInto(s, csv([{ id: 'b1', date: '2026-10-02' }, { id: 'b2', date: '2026-10-03' }]))
    expect(again.plan.kind).toBe('identical')
    const changed = importInto(s, csv([{ id: 'b2', date: '2026-10-03', status: 'Cancelled by User' }, { id: 'b3', date: '2026-10-04' }]), OCT, 'replace')
    expect(changed.plan.kind).toBe('conflict')
    s = changed.state
    expect(s.bookings).toHaveLength(3)
    expect(s.bookings.find((b) => b.bookingId === 'b2')?.status).toBe('Cancelled by User')
    expect(analyse(s).totals).toMatchObject({ bookings: 3, completed: 2, cancelled: 1 })
  })

  it('treats covered days without bookings as zero and uncovered days as missing', () => {
    const s = importInto(EMPTY_PLATE_STATE, csv([{ id: 'b1', date: '2026-10-02', size: 5 }]), { ...OCT, periodEnd: '2026-10-10' }).state
    const a = analyse(s, { location: 'ginger-hazmieh', from: '2026-10-01', to: '2026-10-12' })
    expect(a.daily.find((d) => d.date === '2026-10-05')).toMatchObject({ covers: 0, status: 'complete' })
    // With all locations selected, the other locations have no data for the day.
    expect(analyse(s, { from: '2026-10-01', to: '2026-10-12' }).daily.find((d) => d.date === '2026-10-05')?.status).toBe('partial')
    expect(a.daily.find((d) => d.date === '2026-10-11')).toMatchObject({ covers: null, status: 'missing' })
    expect(a.totals).toMatchObject({ covers: 5, daysCovered: 10, calendarDays: 12 })
  })

  it('counts repeat and returning guests by phone across months and locations', () => {
    const A = '+961 70 111 111'
    const B = '+961 70 222 222'
    let s = importInto(EMPTY_PLATE_STATE, csv([{ id: 'b1', date: '2026-10-02', phone: A }, { id: 'b2', date: '2026-10-09', phone: B, status: 'Cancelled by User' }])).state
    s = importInto(s, csv([{ id: 'b3', date: '2026-11-03', phone: A }, { id: 'b4', date: '2026-11-04', phone: B }], 'Bookings — Pertutti - Hazmieh — 2026-11-01 to 2026-11-30.csv'), { locationId: 'pertutti-hazmieh', periodStart: '2026-11-01', periodEnd: '2026-11-30' }).state
    const nov = analyse(s, { from: '2026-11-01', to: '2026-11-30' })
    // A came in October and November → repeat and returning. B's October booking was cancelled → first visit.
    expect(nov.guests).toMatchObject({ guests: 2, repeat: 1, returning: 1, firstTime: 1, multiLocation: 1 })
    expect(nov.guests.top[0].label).toMatch(/^GUEST-[0-9A-F]{6}$/)
    // One location only: A has a single visit there.
    expect(analyse(s, { location: 'pertutti-hazmieh', from: '2026-11-01', to: '2026-11-30' }).guests).toMatchObject({ guests: 2, repeat: 0, multiLocation: undefined })
  })

  it('patterns: weekday, time slot, party size and lead time', () => {
    const s = importInto(
      EMPTY_PLATE_STATE,
      csv([
        { id: 'b1', date: '2026-10-03', time: '8:30 PM', size: 2, booked: 'Oct 3, 2026, 9:00 AM' },
        { id: 'b2', date: '2026-10-03', time: '8:30 PM', size: 6, booked: 'Sep 20, 2026, 9:00 AM' },
        { id: 'b3', date: '2026-10-05', time: '1:00 PM', size: 2, status: 'Declined', booked: 'Oct 1, 2026, 9:00 AM' },
      ]),
    ).state
    const a = analyse(s)
    expect(a.weekdays.find((w) => w.label === 'Saturday')).toMatchObject({ completed: 2, covers: 8, days: 5 })
    expect(a.timeSlots).toEqual([expect.objectContaining({ key: '20:30', label: '8:30 PM', completed: 2, covers: 8 })])
    expect(a.partySizes.map((r) => r.key)).toEqual(['2', '6'])
    expect(a.leadTime.rows.find((r) => r.key === '0')?.bookings).toBe(1)
    expect(a.leadTime.rows.find((r) => r.key === '8-14')?.bookings).toBe(1)
    expect(a.leadTime.rows.find((r) => r.key === '4-7')?.bookings).toBe(1)
    expect(a.totals).toMatchObject({ declined: 1, declinedGuests: 2, avgPartySize: 4 })
  })

  it('excluding and deleting an import removes its bookings from every figure', () => {
    const r = importInto(EMPTY_PLATE_STATE, csv([{ id: 'b1', date: '2026-10-02' }]))
    const id = r.entry!.id
    expect(analyse(setPlateImportIncluded(r.state, id, false)).hasData).toBe(false)
    expect(removePlateImport(r.state, id)).toEqual(EMPTY_PLATE_STATE)
  })
})

const DIR = join(process.cwd(), 'samples')
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.startsWith('Bookings') && f.endsWith('.csv')) : []

describe.skipIf(files.length < 4)('Plate samples — October 2026, four locations', () => {
  it('reconciles to 51 bookings, 45 completed, 157 guests, 4 cancelled, 2 declined', async () => {
    let state = EMPTY_PLATE_STATE
    for (const f of files) {
      const raw = await rawFromDisk(join(DIR, f))
      const p = parse(raw)
      expect(p.invalid).toEqual([])
      const info = p.fileNameInfo
      expect(info.locationId).toBeDefined()
      expect([info.periodStart, info.periodEnd]).toEqual(['2026-10-01', '2026-10-31'])
      state = importInto(state, raw, { locationId: info.locationId!, periodStart: info.periodStart!, periodEnd: info.periodEnd! }).state
    }
    const a = analyse(state)
    expect(a.range).toEqual({ start: '2026-10-01', end: '2026-10-31' })
    expect(a.totals).toMatchObject({ bookings: 51, completed: 45, covers: 157, cancelled: 4, cancelledGuests: 14, declined: 2, declinedGuests: 4, other: 0, daysCovered: 31 })
    const byLoc = Object.fromEntries(a.locationRows.map((r) => [r.info.id, [r.metrics.bookings, r.metrics.completed, r.metrics.covers]]))
    expect(byLoc).toEqual({ 'ginger-hazmieh': [16, 14, 48], 'ginger-jal-el-dib': [23, 20, 71], 'pertutti-hazmieh': [6, 6, 24], hamra: [6, 5, 14] })
    expect(a.guests).toMatchObject({ guests: 39, repeat: 4, multiLocation: 1 })
    expect(a.weekdays.find((w) => w.label === 'Saturday')?.covers).toBe(58)
    expect(a.reconciliation.every((r) => r.matches)).toBe(true)
    expect(a.mix.status.map((r) => r.key).sort()).toEqual(['Cancelled by User', 'Completed', 'Declined'])
    // No personal data is stored.
    expect(JSON.stringify(state)).not.toMatch(/@|\+961/)
  })
})
