import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { computePlateAnalytics } from '@/plate/analytics'
import { applyPlateImport, planPlateImport } from '@/plate/merge'
import { detectPlate, parsePlate } from '@/plate/parse'
import { DEFAULT_PLATE_FILTERS, EMPTY_PLATE_STATE, type PlateFilters, type PlateState } from '@/plate/types'
import { rawCsv, rawFromDisk } from '@/test/build'
import type { RawFile } from '@/types/data'
import { chartsOf, workbookToBuffer } from './charts'
import { PLATE_SHEETS, buildPlateWorkbook } from './plateWorkbook'

function load(files: RawFile[]): PlateState {
  let state = EMPTY_PLATE_STATE
  files.forEach((raw, i) => {
    const p = parsePlate(raw, detectPlate(raw)!)
    const info = p.fileNameInfo
    const target = { locationId: info.locationId!, periodStart: info.periodStart!, periodEnd: info.periodEnd! }
    const plan = planPlateImport(state, p, target)
    if (plan.kind !== 'identical') state = applyPlateImport(state, p, plan, target, 'keep', { id: `i${i}`, fileName: raw.fileName, fileSize: 1, importedAt: 0, warnings: [] }).state
  })
  return state
}

const build = async (state: PlateState, filters: Partial<PlateFilters> = {}) => {
  const a = computePlateAnalytics(state, { ...DEFAULT_PLATE_FILTERS, ...filters })
  const wb = await buildPlateWorkbook(a, { title: 'Plate test report', generatedAt: new Date(0) })
  const buffer = await workbookToBuffer(wb)
  return { a, wb, buffer, zip: await JSZip.loadAsync(buffer) }
}

const HEADER = 'Date,Time,Guest,Party Size,Status,Table,Phone,Email,Confirmation Code,Source,Booking Type,Occasion,Section,Coming For,Dietary Notes,Special Requests,Restaurant Notes,Payment Status,Payment Amount,Duration (min),Booked At,Modified,Changes,Booking ID'
const r = (id: string, date: string, size: number, status = 'Completed', phone = '+961 70 123 456', time = '8:00 PM') => `${date},${time},Private Person,${size},${status},,${phone},private@example.com,XYZ789,Mobile app,Regular,,Indoor,,,,,,,120,"Oct 1, 2026, 9:00 AM",,,${id}`
const synthetic = () =>
  load([
    rawCsv(`${HEADER}\n${[r('a', '2026-10-01', 2), r('b', '2026-10-02', 4, 'Cancelled by User'), r('c', '2026-10-04', 3), r('d', '2026-10-05', 5, 'Completed', '+961 70 999 999', '9:30 PM'), r('e', '2026-10-06', 2, 'Declined')].join('\n')}\n`, 'Bookings — Ginger&Co - Hazmieh — 2026-10-01 to 2026-10-06.csv'),
  ])

describe('Plate workbook', () => {
  it('contains the seven Plate sheets, native charts, the rules and no personal data', async () => {
    const { wb, zip } = await build(synthetic(), { from: '2026-10-04', to: '2026-10-06' })
    expect(wb.worksheets.map((s) => s.name)).toEqual([...PLATE_SHEETS])
    expect(chartsOf(wb).map((c) => `${c.sheet}:${c.type}`).sort()).toEqual(['Plate Booking Patterns:column', 'Plate Booking Patterns:column', 'Plate Daily Reservations:line', 'Plate Executive Summary:line', 'Plate Period Comparison:column'])
    const strings = await zip.file('xl/sharedStrings.xml')!.async('string')
    expect(strings).toContain('Walk-ins and no-shows are not in the Plate export')
    expect(strings).toContain('MATCHES')
    expect(strings).not.toMatch(/Private Person|private@example|XYZ789|961/)
  })

  it('writes the comparison against the previous period of the same length', async () => {
    const { wb } = await build(synthetic(), { from: '2026-10-04', to: '2026-10-06' })
    const s = wb.getWorksheet('Plate Period Comparison')!
    const guests = s.getRows(1, s.rowCount)!.find((x) => x.getCell(1).value === 'Guests (covers)')!
    expect(guests.getCell(2).value).toBe(8)
    expect(guests.getCell(3).value).toBe(2)
    expect(guests.getCell(4).value).toBeCloseTo(3, 10)
  })

  it('leaves days without imported data blank and keeps covered days without bookings at zero', async () => {
    const { wb } = await build(synthetic(), { from: '2026-09-30', to: '2026-10-03' })
    const s = wb.getWorksheet('Plate Daily Reservations')!
    const rowOf = (iso: string) => s.getRows(1, s.rowCount)!.find((x) => x.getCell(1).value instanceof Date && (x.getCell(1).value as Date).toISOString().startsWith(iso))!
    expect(rowOf('2026-09-30').getCell(2).value).toBeNull()
    expect(rowOf('2026-10-03').getCell(2).value).toBe(0)
  })
})

const DIR = join(process.cwd(), 'samples')
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.startsWith('Bookings') && f.endsWith('.csv')) : []

describe.skipIf(files.length < 4)('Plate workbook — real October 2026 exports', () => {
  it('reports the validated totals (and writes the file for Excel QA when PLATE_QA_OUT is set)', async () => {
    const raws = await Promise.all(files.map((f) => rawFromDisk(join(DIR, f))))
    const { wb, buffer } = await build(load(raws), { compare: 'none' })
    const s = wb.getWorksheet('Plate Daily Reservations')!
    const total = s.getRows(1, s.rowCount)!.find((x) => x.getCell(1).value === 'Total (selection)')!
    expect([2, 3, 4, 5, 6].map((c) => total.getCell(c).value)).toEqual([157, 45, 51, 4, 2])
    if (process.env.PLATE_QA_OUT) writeFileSync(process.env.PLATE_QA_OUT, Buffer.from(buffer))
  })
})
