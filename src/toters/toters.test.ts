import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runAnalysis } from '@/analytics'
import { BRANDS } from '@/config/brands'
import { totersToUsd } from '@/config/toters'
import { rawCsv, rawFromDisk } from '@/test/build'
import { DEFAULT_FILTERS } from '@/types/filters'
import { DEFAULT_SETTINGS } from '@/types/settings'
import type { Dataset } from '@/types/dataset'
import type { RawFile } from '@/types/data'
import { computeTotersAnalytics, totersBranchOptions } from './analytics'
import { applyTotersImport, planTotersImport, removeTotersImport, setTotersImportIncluded } from './merge'
import { detectToters, parseToters, resolveStores } from './parse'
import { DEFAULT_TOTERS_FILTERS, EMPTY_TOTERS_STATE, type TotersImport, type TotersState } from './types'

// Synthetic fixtures in the verified Toters layout (no real figures).
const HEADER = 'store_id,period,total,ref,delivery_request'
const csv = (store: string, rows: [string, string][], name = 'chart-data-orders_value-test.csv') =>
  rawCsv(`${HEADER}\n${rows.map(([d, t]) => `${store},${d} 00:00:00,${t},Store, ALL`).join('\n')}\n`, name)

const parse = (raw: RawFile) => parseToters(raw, detectToters(raw)!)

let n = 0
function importInto(state: TotersState, raw: RawFile, resolution: 'replace' | 'keep' = 'keep', manual?: string) {
  const p = parse(raw)
  const s = resolveStores(p, manual)
  const errors = [...p.issues, ...s.issues].filter((i) => i.level === 'error')
  if (s.stores.length === 0 || errors.length > 0) throw new Error(errors.map((i) => i.message).join('; ') || 'no stores')
  const plan = planTotersImport(state, s.stores)
  if (plan.kind === 'identical') return { state, plan, entries: [] as TotersImport[], entry: undefined }
  n++
  const r = applyTotersImport(state, plan, resolution, {
    batchId: `batch-${n}`,
    fileName: raw.fileName,
    fileSize: 100,
    importedAt: n,
    reconciliation: p.reconciliation,
    warnings: [],
    newId: () => `imp-${n}-${Math.random().toString(36).slice(2, 8)}`,
  })
  return { ...r, plan, entry: r.entries[0] }
}

describe('Toters conversion', () => {
  it('converts CSV total × 1,500 ÷ 89,500 with full precision', () => {
    expect(totersToUsd(89500)).toBe(1500)
    expect(totersToUsd(77100)).toBeCloseTo((77100 * 1500) / 89500, 12)
    expect(totersToUsd(0)).toBe(0)
  })
})

describe('Toters parsing and store mapping', () => {
  it('detects the format and identifies the branch from store_id, not the file name', () => {
    const p = parse(csv('104873', [['2026-10-01', '100'], ['2026-10-02', '200']], 'ginger_hamra_oct_2026.csv'))
    expect(p.stores[0].rows.map((r) => r.csvTotal)).toEqual([100, 200])
    const s = resolveStores(p)
    expect(s.stores[0].store).toMatchObject({ brandId: 'pertutti', branch: 'Hamra' })
    expect(s.stores[0].source).toBe('file')
  })

  it('maps every configured store ID', () => {
    const expected: Record<string, [string, string]> = { '96297': ['ginger-and-co', 'Hamra'], '96298': ['ginger-and-co', 'Jal El Dib'], '104873': ['pertutti', 'Hamra'], '121769': ['pertutti', 'Hazmieh'] }
    for (const [id, [brand, branch]] of Object.entries(expected)) expect(resolveStores(parse(csv(id, [['2026-10-01', '1']]))).stores[0].store).toMatchObject({ brandId: brand, branch })
  })

  it('rejects unknown store IDs and conflicting manual selections', () => {
    expect(parse(csv('999', [['2026-10-01', '1']])).issues[0]).toMatchObject({ level: 'error', message: expect.stringMatching(/Unknown store ID/) })
    const r = resolveStores(parse(csv('96297', [['2026-10-01', '1']])), 'pertutti:Hazmieh')
    expect(r.issues[0].message).toMatch(/conflicts/)
  })

  it('requires a manual branch when the file has no store ID', () => {
    const p = parse(rawCsv('period,total,ref,delivery_request\n2026-10-01 00:00:00,50,Store, ALL\n'))
    expect(resolveStores(p).needsManualBranch).toBe(true)
    expect(resolveStores(p).issues[0].level).toBe('error')
    expect(resolveStores(p, 'pertutti:Hazmieh').stores[0].store.storeId).toBe('121769')
  })

  it('flags invalid dates and amounts, never turning them into zero', () => {
    const p = parse(rawCsv(`${HEADER}\n96297,2026-02-30 00:00:00,10,S, ALL\n96297,2026-10-02 00:00:00,abc,S, ALL\n96297,2026-10-03 00:00:00,,S, ALL\n96297,2026-10-04 00:00:00,0,S, ALL\n`))
    expect(p.stores[0].rows).toEqual([expect.objectContaining({ date: '2026-10-04', csvTotal: 0 })])
    expect(p.stores[0].invalid.map((i) => i.reason)).toEqual([expect.stringMatching(/Invalid date/), expect.stringMatching(/Invalid amount/), expect.stringMatching(/Missing amount/)])
  })

  it('treats conflicting duplicate dates in one file as invalid', () => {
    const p = parse(csv('96297', [['2026-10-01', '10'], ['2026-10-01', '20'], ['2026-10-02', '5'], ['2026-10-02', '5']]))
    expect(p.stores[0].rows.map((r) => r.date)).toEqual(['2026-10-02'])
    expect(p.stores[0].invalid).toHaveLength(2)
  })

  it('splits a multi-branch file by store and keeps store_id 0 for reconciliation only', () => {
    const raw = rawCsv(
      `${HEADER}\n0,2026-10-01 00:00:00,30,All, ALL\n0,2026-10-02 00:00:00,99,All, ALL\n96297,2026-10-01 00:00:00,10,G, ALL\n96297,2026-10-02 00:00:00,20,G, ALL\n104873,2026-10-01 00:00:00,20,P, ALL\n104873,2026-10-02 00:00:00,70,P, ALL\n`,
    )
    const p = parse(raw)
    expect(p.stores.map((s) => s.storeId)).toEqual(['96297', '104873'])
    expect(p.combined).toHaveLength(2)
    expect(p.reconciliation).toMatchObject({ days: 2, matchedDays: 1, mismatches: [{ date: '2026-10-02', combinedCsvTotal: 99, branchCsvTotal: 90 }] })
    const imported = importInto(EMPTY_TOTERS_STATE, raw)
    expect(imported.entries.map((e) => e.storeId)).toEqual(['96297', '104873'])
    expect(imported.state.days.some((d) => d.storeId === '0')).toBe(false)
    const a = computeTotersAnalytics(imported.state, DEFAULT_TOTERS_FILTERS)
    expect(a.totals.csvTotal).toBe(120)
    expect(a.quality.some((q) => q.level === 'warning' && /combined totals/.test(q.message))).toBe(true)
  })

  it('rejects files with only combined totals', () => {
    expect(parse(csv('0', [['2026-10-01', '1']])).issues.some((i) => i.level === 'error' && /only combined totals/.test(i.message))).toBe(true)
  })

  it('does not detect Weevi exports as Toters', () => {
    expect(detectToters(rawCsv('id,Product Name,Items Sold,Total Amount\n1,A,2,3\n'))).toBeNull()
    expect(detectToters(rawCsv('Days,Orders,Amount\n2026-10-01,1,USD 5\n'))).toBeNull()
  })
})

describe('Toters re-imports', () => {
  const oct = () => csv('96297', [['2026-10-01', '100'], ['2026-10-02', '200']])

  it('skips an identical re-import, even under another file name', () => {
    const first = importInto(EMPTY_TOTERS_STATE, oct())
    const again = importInto(first.state, csv('96297', [['2026-10-01', '100'], ['2026-10-02', '200']], 'renamed.csv'))
    expect(again.plan.kind).toBe('identical')
    expect(again.state).toBe(first.state)
  })

  it('adds only new days and reports differing overlaps as conflicts', () => {
    const first = importInto(EMPTY_TOTERS_STATE, oct())
    const next = csv('96297', [['2026-10-02', '250'], ['2026-10-03', '300']])
    const kept = importInto(first.state, next, 'keep')
    expect(kept.plan.stores[0].conflicts.map((c) => [c.date, c.existing.csvTotal, c.incoming.csvTotal])).toEqual([['2026-10-02', 200, 250]])
    expect(kept.state.days.map((d) => d.csvTotal)).toEqual([100, 200, 300])
    const replaced = importInto(first.state, next, 'replace')
    expect(replaced.state.days.map((d) => d.csvTotal)).toEqual([100, 250, 300])
    expect(replaced.entry?.replaced).toEqual([{ date: '2026-10-02', previousCsvTotal: 200, previousImportId: first.entry!.id }])
  })

  it('never overwrites another branch with the same dates', () => {
    const a = importInto(EMPTY_TOTERS_STATE, oct())
    const b = importInto(a.state, csv('104873', [['2026-10-01', '7']]))
    expect(b.plan.kind).toBe('clean')
    expect(b.state.days).toHaveLength(3)
    expect(b.state.days.filter((d) => d.storeId === '96297').map((d) => d.csvTotal)).toEqual([100, 200])
  })

  it('removes an import and only the days it supplied', () => {
    const a = importInto(EMPTY_TOTERS_STATE, oct())
    const b = importInto(a.state, csv('96297', [['2026-10-03', '300']]))
    const after = removeTotersImport(b.state, a.entry!.id)
    expect(after.days.map((d) => d.date)).toEqual(['2026-10-03'])
    expect(after.imports).toHaveLength(1)
  })

  it('excludes an import from every figure without deleting it, and includes it again', () => {
    const a = importInto(EMPTY_TOTERS_STATE, oct())
    const b = importInto(a.state, csv('104873', [['2026-10-01', '89500']]))
    const pertutti = b.entry!.id
    const off = setTotersImportIncluded(b.state, pertutti, false)
    expect(off.days).toHaveLength(3) // still stored
    const x = computeTotersAnalytics(off, DEFAULT_TOTERS_FILTERS)
    expect(x.totals.csvTotal).toBe(300)
    expect(x.status['pertutti:Hamra']['2026-10-01']).toBe('missing')
    expect(x.quality.some((q) => /excluded from analysis/.test(q.message))).toBe(true)
    expect(x.allImports).toHaveLength(2)
    const on = computeTotersAnalytics(setTotersImportIncluded(off, pertutti, true), DEFAULT_TOTERS_FILTERS)
    expect(on.totals.csvTotal).toBe(89800)
  })

  it('records the conversion rule and original values in every import', () => {
    const a = importInto(EMPTY_TOTERS_STATE, oct())
    expect(a.entry?.conversion).toMatchObject({ lbpMultiplier: 1500, lbpPerUsd: 89500 })
    expect(a.state.days[0]).toMatchObject({ csvTotal: 100, revenueLbp: 150000, revenueUsd: 150000 / 89500 })
  })
})

describe('Toters analytics', () => {
  const build = () => {
    let s = importInto(EMPTY_TOTERS_STATE, csv('96297', [['2026-10-01', '89500'], ['2026-10-02', '0'], ['2026-10-03', '179000']])).state
    s = importInto(s, csv('104873', [['2026-10-01', '17900'], ['2026-10-03', '17900']])).state
    return s
  }

  it('distinguishes zero sales from missing days and keeps Ginger & Co Hazmieh unavailable', () => {
    const a = computeTotersAnalytics(build(), DEFAULT_TOTERS_FILTERS)
    expect(a.totals.revenueUsd).toBeCloseTo(1500 + 0 + 3000 + 300 + 300, 9)
    expect(a.status['ginger-and-co:Hamra']['2026-10-02']).toBe('zero')
    expect(a.status['pertutti:Hamra']['2026-10-02']).toBe('missing')
    expect(a.status['pertutti:Hazmieh']['2026-10-01']).toBe('missing')
    expect(a.daily[1]).toMatchObject({ totalUsd: 0, status: 'partial' })
    expect(a.unavailable.map((u) => u.branch)).toEqual(['Hazmieh', 'Discount'])
    expect(a.branches.some((b) => b.brandId === 'ginger-and-co' && b.branch === 'Hazmieh')).toBe(false)
    expect(a.totals.branchesWithData).toBe(2)
    expect(a.highestBranch?.info.label).toBe('Ginger & Co — Hamra')
  })

  it('marks dates with invalid export rows as invalid, not missing or zero', () => {
    const s = importInto(EMPTY_TOTERS_STATE, rawCsv(`${HEADER}\n96297,2026-10-01 00:00:00,10,S, ALL\n96297,2026-10-02 00:00:00,x,S, ALL\n`)).state
    const a = computeTotersAnalytics(s, { ...DEFAULT_TOTERS_FILTERS, branch: 'ginger-and-co:Hamra' })
    expect(a.status['ginger-and-co:Hamra']['2026-10-02']).toBeUndefined() // outside the imported extent
    const b = computeTotersAnalytics(s, { ...DEFAULT_TOTERS_FILTERS, branch: 'ginger-and-co:Hamra', from: '2026-10-01', to: '2026-10-03' })
    expect(b.status['ginger-and-co:Hamra']).toEqual({ '2026-10-01': 'value', '2026-10-02': 'invalid', '2026-10-03': 'missing' })
  })

  it('applies brand, branch and date filters to every figure', () => {
    const s = build()
    const p = computeTotersAnalytics(s, { ...DEFAULT_TOTERS_FILTERS, brandId: 'pertutti' })
    expect(p.totals.revenueUsd).toBeCloseTo(600, 9)
    expect(p.brandRows.map((b) => b.name)).toEqual(['Pertutti'])
    expect(p.unavailable).toEqual([])
    const d = computeTotersAnalytics(s, { ...DEFAULT_TOTERS_FILTERS, branch: 'ginger-and-co:Hamra', from: '2026-10-02', to: '2026-10-03' })
    expect(d.totals.revenueUsd).toBeCloseTo(3000, 9)
    expect(d.totals.daysWithData).toBe(2)
    expect(d.branchRows).toHaveLength(1)
    expect(totersBranchOptions('pertutti').map((b) => b.branch)).toEqual(['Hamra', 'Hazmieh'])
  })

  it('groups weekly and monthly without changing totals', () => {
    const s = build()
    const day = computeTotersAnalytics(s, DEFAULT_TOTERS_FILTERS)
    for (const grain of ['week', 'month'] as const) {
      const a = computeTotersAnalytics(s, { ...DEFAULT_TOTERS_FILTERS, grain })
      expect(a.periods.reduce((x, p) => x + p.revenueUsd, 0)).toBeCloseTo(day.totals.revenueUsd, 9)
    }
  })

  it('keeps Weevi analytics free of Toters datasets', () => {
    const legacy = {
      id: 'legacy',
      included: true,
      metadata: { brandId: 'ginger-and-co', platformId: 'toters', country: 'Lebanon', category: 'sales-summary', currency: 'USD', periodStart: '', periodEnd: '' },
      records: [{ date: '2026-10-01', revenue: 999 }],
      mapping: {},
      source: { fileName: 'x', fileSize: 1, lastModified: 1, sheetName: 'x', headerRow: 1 },
      stats: { sourceRows: 1, importedRows: 1, skippedRows: 0, invalidDates: 0, invalidNumbers: 0, duplicateOrderIdsInFile: 0, valueCurrencies: [] },
      warnings: [],
      fingerprint: '',
      importedAt: 1,
      parseOptions: { dateFormat: 'auto', decimalSeparator: '.' },
    } as unknown as Dataset
    expect(runAnalysis([legacy], { ...DEFAULT_FILTERS, brandId: 'all' }, DEFAULT_SETTINGS).records).toHaveLength(0)
  })

  it('configures Pertutti Hamra and Hazmieh as branches', () => {
    expect(BRANDS.pertutti.branches).toEqual(['Hamra', 'Hazmieh'])
  })
})

// Real exports (git-ignored). Skipped when samples/toters is absent.
const DIR = join(process.cwd(), 'samples', 'toters')
const present = existsSync(DIR) && readdirSync(DIR).some((f) => f.toLowerCase().endsWith('.csv'))
const files = () => (present ? readdirSync(DIR).filter((x) => x.toLowerCase().endsWith('.csv')) : [])
const branchFiles = () => files().filter((f) => f.endsWith('_oct_2026.csv'))
const combinedFiles = () => files().filter((f) => !f.endsWith('_oct_2026.csv'))

describe.skipIf(!present)('Toters samples — October 2026 reconciliation', () => {
  const load = async (names: string[]) => {
    let state = EMPTY_TOTERS_STATE
    for (const f of names) state = importInto(state, await rawFromDisk(join(DIR, f))).state
    return state
  }
  const check = (state: TotersState) => {
    const a = computeTotersAnalytics(state, { ...DEFAULT_TOTERS_FILTERS, from: '2026-10-01', to: '2026-10-31' })
    const byLabel = Object.fromEntries(a.branchRows.map((r) => [r.info.label, Math.round(r.revenueUsd * 100) / 100]))
    expect(byLabel).toEqual({ 'Ginger & Co — Hamra': 39918.03, 'Ginger & Co — Jal El Dib': 26593.68, 'Pertutti — Hamra': 8092.23, 'Pertutti — Hazmieh': 6928.76 })
    const brand = Object.fromEntries(a.brandRows.map((b) => [b.name, b.revenueUsd]))
    expect(brand['Ginger & Co']).toBeCloseTo(66511.7, 1)
    expect(brand.Pertutti).toBeCloseTo(15020.98, 1)
    expect(a.totals.revenueUsd).toBeCloseTo(81532.69, 1)
    expect(a.totals.daysWithData).toBe(31)
    expect(a.totals.missingDays).toBe(0)
    expect(a.totals.branchesWithData).toBe(4)
    // Pertutti Hazmieh, 8 Oct: an actual zero in the export, not missing data.
    expect(a.status['pertutti:Hazmieh']['2026-10-08']).toBe('zero')
    return a
  }

  it.skipIf(branchFiles().length === 0)('matches the reference totals from the four branch files', async () => {
    check(await load(branchFiles()))
  })

  it.skipIf(combinedFiles().length === 0)('matches the same totals from the combined file, reconciling store_id 0 without adding it', async () => {
    const raw = await rawFromDisk(join(DIR, combinedFiles()[0]))
    const p = parse(raw)
    expect(p.sourceRows).toBe(155)
    expect(p.combined).toHaveLength(31)
    expect(p.reconciliation?.mismatches).toEqual([])
    const state = await load([combinedFiles()[0]])
    expect(state.days).toHaveLength(124)
    const a = check(state)
    // store_id 0 equals the branch sum; it is not added on top.
    expect(a.totals.csvTotal).toBeCloseTo(p.reconciliation!.combinedCsvTotal, 6)
  })

  it('treats re-imports of the same data as identical, in either layout', async () => {
    const first = branchFiles().length > 0 ? branchFiles() : combinedFiles()
    const state = await load(first)
    for (const f of files()) expect(importInto(state, await rawFromDisk(join(DIR, f))).plan.kind).toBe('identical')
  })
})
