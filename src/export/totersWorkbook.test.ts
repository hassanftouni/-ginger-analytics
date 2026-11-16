import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { rawCsv, rawFromDisk } from '@/test/build'
import { computeTotersAnalytics } from '@/toters/analytics'
import { applyTotersImport, planTotersImport } from '@/toters/merge'
import { detectToters, parseToters, resolveStores } from '@/toters/parse'
import { DEFAULT_TOTERS_FILTERS, EMPTY_TOTERS_STATE, type TotersFilters, type TotersState } from '@/toters/types'
import type { RawFile } from '@/types/data'
import { chartsOf, workbookToBuffer } from './charts'
import { TOTERS_SHEETS, buildTotersWorkbook } from './totersWorkbook'

let n = 0
function load(files: RawFile[]): TotersState {
  let state = EMPTY_TOTERS_STATE
  for (const raw of files) {
    const p = parseToters(raw, detectToters(raw)!)
    const plan = planTotersImport(state, resolveStores(p).stores)
    if (plan.kind === 'identical') continue
    state = applyTotersImport(state, plan, 'keep', { batchId: `b${++n}`, fileName: raw.fileName, fileSize: 1, importedAt: 0, reconciliation: p.reconciliation, warnings: [], newId: () => `i${++n}` }).state
  }
  return state
}

const build = async (state: TotersState, filters: Partial<TotersFilters> = {}) => {
  const a = computeTotersAnalytics(state, { ...DEFAULT_TOTERS_FILTERS, ...filters })
  const wb = await buildTotersWorkbook(a, { title: 'Toters test report', generatedAt: new Date(0) })
  const buffer = await workbookToBuffer(wb)
  return { a, wb, buffer, zip: await JSZip.loadAsync(buffer) }
}

// Synthetic fixture (no real figures): two branches, one missing day.
const HEADER = 'store_id,period,total,ref,delivery_request'
const synthetic = () =>
  load([
    rawCsv(`${HEADER}\n96297,2026-10-01 00:00:00,89500,G, ALL\n96297,2026-10-02 00:00:00,0,G, ALL\n96297,2026-10-03 00:00:00,179000,G, ALL\n`, 'a.csv'),
    rawCsv(`${HEADER}\n104873,2026-10-01 00:00:00,17900,P, ALL\n104873,2026-10-03 00:00:00,17900,P, ALL\n`, 'b.csv'),
  ])

describe('Toters workbook', () => {
  it('contains the five Toters sheets, native charts and the conversion rule', async () => {
    const { wb, zip } = await build(synthetic())
    expect(wb.worksheets.map((s) => s.name)).toEqual([...TOTERS_SHEETS])
    expect(chartsOf(wb).map((c) => `${c.sheet}:${c.type}`).sort()).toEqual([
      'Toters Branch Performance:bar',
      'Toters Brand Comparison:bar',
      'Toters Daily Sales:line',
      'Toters Executive Summary:line',
    ])
    expect(Object.keys(zip.files).filter((f) => /^xl\/charts\/chart\d+\.xml$/.test(f))).toHaveLength(4)
    const strings = await zip.file('xl/sharedStrings.xml')!.async('string')
    expect(strings).toContain('89,500')
    expect(strings).toContain('Not available')
    expect(strings).toMatch(/never added to Weevi/)
  })

  it('leaves missing branch-days blank (never zero) and keeps actual zeros', async () => {
    const { wb } = await build(synthetic())
    const s = wb.getWorksheet('Toters Daily Sales')!
    const rowOf = (iso: string) => s.getRows(1, s.rowCount)!.find((r) => r.getCell(1).value instanceof Date && (r.getCell(1).value as Date).toISOString().startsWith(iso))!
    const oct2 = rowOf('2026-10-02')
    expect(oct2.getCell(3).value).toBe(0) // Ginger & Co Hamra: actual zero
    expect(oct2.getCell(5).value).toBeNull() // Pertutti Hamra: missing
    expect(String(oct2.getCell(7).value)).toMatch(/Partial/)
  })

  it('reflects the filters', async () => {
    const { wb } = await build(synthetic(), { brandId: 'pertutti' })
    const strings = wb.getWorksheet('Toters Branch Performance')!.getSheetValues().flat().map(String)
    expect(strings.some((v) => v.includes('Ginger & Co'))).toBe(false)
    expect(strings.some((v) => v.includes('Pertutti — Hamra'))).toBe(true)
  })
})

const DIR = join(process.cwd(), 'samples', 'toters')
const present = existsSync(DIR) && readdirSync(DIR).some((f) => f.toLowerCase().endsWith('.csv'))

describe.skipIf(!present)('Toters workbook — real October 2026 samples', () => {
  it('reports the reconciled totals (and writes the file for Excel QA when TOTERS_QA_OUT is set)', async () => {
    const files = await Promise.all(readdirSync(DIR).filter((f) => f.endsWith('.csv')).map((f) => rawFromDisk(join(DIR, f))))
    const { a, wb, buffer } = await build(load(files), { from: '2026-10-01', to: '2026-10-31' })
    expect(Math.round(a.totals.revenueUsd * 100) / 100).toBe(81532.69)
    const v = wb.getWorksheet('Toters Branch Performance')!
    const total = v.getRows(1, v.rowCount)!.find((r) => r.getCell(1).value === 'Total (selected branches)')!
    expect(Math.round((total.getCell(6).value as number) * 100) / 100).toBe(81532.69)
    if (process.env.TOTERS_QA_OUT) writeFileSync(process.env.TOTERS_QA_OUT, Buffer.from(buffer))
  })
})
