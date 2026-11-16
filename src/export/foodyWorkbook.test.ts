import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { computeFoodyAnalytics } from '@/foody/analytics'
import { applyFoodyImport, planFoodyImport } from '@/foody/merge'
import { detectFoody, parseFoody } from '@/foody/parse'
import { DEFAULT_FOODY_FILTERS, EMPTY_FOODY_STATE, type FoodyFilters, type FoodyState } from '@/foody/types'
import { rawFromDisk, rawSheet } from '@/test/build'
import type { RawFile } from '@/types/data'
import { chartsOf, workbookToBuffer } from './charts'
import { FOODY_SHEETS, buildFoodyWorkbook } from './foodyWorkbook'

function load(files: RawFile[]): FoodyState {
  let state = EMPTY_FOODY_STATE
  files.forEach((raw, i) => {
    const p = parseFoody(raw, detectFoody(raw)!)
    const plan = planFoodyImport(state, p)
    if (plan.kind !== 'identical') state = applyFoodyImport(state, p, plan, 'keep', { id: `i${i}`, fileName: raw.fileName, fileSize: 1, importedAt: 0, warnings: [] }).state
  })
  return state
}

const build = async (state: FoodyState, filters: Partial<FoodyFilters> = {}) => {
  const a = computeFoodyAnalytics(state, { ...DEFAULT_FOODY_FILTERS, ...filters })
  const wb = await buildFoodyWorkbook(a, { title: 'Foody test report', generatedAt: new Date(0) })
  const buffer = await workbookToBuffer(wb)
  return { a, wb, buffer, zip: await JSZip.loadAsync(buffer) }
}

// Synthetic fixture (no real figures).
const H = ['Order ID', 'Store ID', 'Order status', 'Order received at', 'Subtotal', 'Discount', 'Voucher', 'Order items']
const synthetic = () =>
  load([
    rawSheet([
      ['Order metadata'],
      H,
      ['1', '2000666969', 'Delivered', '2026-10-01 12:00', 50, 5, 0, '2 Soup'],
      ['2', '2000666969', 'Delivered', '2026-10-03 12:00', 40, 0, 4, '1 Bowl'],
      ['3', '2000666969', 'Cancelled', '2026-10-04 12:00', 20, 0, 0, '1 Bowl'],
      ['4', '2000666969', 'Delivered', '2026-10-05 12:00', 30, 0, 0, '1 Soup'],
      ['5', '2000666969', 'Delivered', '2026-10-06 12:00', 60, 0, 0, '3 Soup'],
    ]),
  ])

describe('Foody workbook', () => {
  it('contains the seven Foody sheets, native charts, the rules and the separation note', async () => {
    const { wb, zip } = await build(synthetic(), { from: '2026-10-04', to: '2026-10-06' })
    expect(wb.worksheets.map((s) => s.name)).toEqual([...FOODY_SHEETS])
    expect(chartsOf(wb).map((c) => `${c.sheet}:${c.type}`).sort()).toEqual(['Foody Daily Sales:line', 'Foody Executive Summary:line', 'Foody Period Comparison:column'])
    const strings = await zip.file('xl/sharedStrings.xml')!.async('string')
    expect(strings).toContain('Subtotal − Discount − Voucher')
    expect(strings).toMatch(/never converted or added to Weevi or Toters/)
    expect(strings).toContain('MATCHES')
  })

  it('writes the comparison against the previous period of the same length', async () => {
    const { wb } = await build(synthetic(), { from: '2026-10-04', to: '2026-10-06' })
    const s = wb.getWorksheet('Foody Period Comparison')!
    const net = s.getRows(1, s.rowCount)!.find((r) => r.getCell(1).value === 'Net sales')!
    expect(net.getCell(2).value).toBe(90)
    expect(net.getCell(3).value).toBe(81)
    expect(net.getCell(4).value).toBeCloseTo(9 / 81, 10)
  })

  it('leaves days without imported data blank and keeps covered days without orders at zero', async () => {
    const { wb } = await build(synthetic(), { from: '2026-09-30', to: '2026-10-02' })
    const s = wb.getWorksheet('Foody Daily Sales')!
    const rowOf = (iso: string) => s.getRows(1, s.rowCount)!.find((r) => r.getCell(1).value instanceof Date && (r.getCell(1).value as Date).toISOString().startsWith(iso))!
    expect(rowOf('2026-09-30').getCell(2).value).toBeNull()
    expect(rowOf('2026-10-02').getCell(2).value).toBe(0)
  })
})

const DIR = join(process.cwd(), 'samples', 'foody')
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.xlsx')) : []

describe.skipIf(files.length === 0)('Foody workbook — real October 2026 export', () => {
  it('reports the validated totals (and writes the file for Excel QA when FOODY_QA_OUT is set)', async () => {
    const raws = await Promise.all(files.map((f) => rawFromDisk(join(DIR, f))))
    const { wb, buffer } = await build(load(raws), { from: '2026-10-01', to: '2026-10-31', compare: 'none' })
    const s = wb.getWorksheet('Foody Branch Performance')!
    const total = s.getRows(1, s.rowCount)!.find((r) => r.getCell(1).value === 'Total (selected branches)')!
    expect(Math.round((total.getCell(4).value as number) * 100) / 100).toBe(14195.5)
    expect(Math.round((total.getCell(6).value as number) * 100) / 100).toBe(14375.5)
    expect(total.getCell(9).value).toBe(364)
    if (process.env.FOODY_QA_OUT) writeFileSync(process.env.FOODY_QA_OUT, Buffer.from(buffer))
    // Campaign-style comparison inside the month (second half vs first half).
    const cmp = await build(load(raws), { from: '2026-10-16', to: '2026-10-31', compare: 'custom', compareFrom: '2026-10-01', compareTo: '2026-10-15' })
    expect(cmp.a.comparison?.baselineIncomplete).toBe(false)
    expect(Math.round(((cmp.a.comparison?.current.metrics.net ?? 0) + (cmp.a.comparison?.baseline.metrics.net ?? 0)) * 100) / 100).toBe(14195.5)
    if (process.env.FOODY_QA_OUT) writeFileSync(process.env.FOODY_QA_OUT.replace(/\.xlsx$/, '-compare.xlsx'), Buffer.from(cmp.buffer))
  })
})
