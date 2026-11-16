import { describe, expect, it } from 'vitest'
import { BRANDS, expectedBranches, reportingBranch } from '@/config/brands'
import { buildAnalyticalWorkbook } from '@/export/workbook'
import { buildManualBranchDataset, validateManualBranches, type ManualBranchInput } from '@/import/manual'
import { datasetFrom, rawSheet } from '@/test/build'
import type { Dataset } from '@/types/dataset'
import { DEFAULT_FILTERS, type Filters } from '@/types/filters'
import { DEFAULT_SETTINGS } from '@/types/settings'
import { runAnalysis } from './engine'

const d = (m: number, day: number) => new Date(Date.UTC(2026, m - 1, day))
// Synthetic daily sales whose October total matches the verified brand total (USD 40,699 / 593).
const october = datasetFrom(
  rawSheet([
    ['Days', 'Orders', 'Amount'],
    [d(10, 1), '300', 'USD 20,000'],
    [d(10, 31), '293', 'USD 20,699'],
  ]),
  { branchScope: { mode: 'all', branches: [] } },
)
const manual = (over: Partial<ManualBranchInput>, id: string): Dataset =>
  buildManualBranchDataset(
    { brandId: 'ginger-and-co', platformId: 'weevi', currency: 'USD', periodStart: '2026-10-01', periodEnd: '2026-10-31', rows: [], note: '', ...over },
    id,
  )
const octBranches = manual(
  {
    rows: [
      { branch: 'Hamra', revenue: 3303, orders: 54 },
      { branch: 'Discount', revenue: 100, orders: 2 },
    ],
  },
  'manual-oct',
)
const run = (datasets: Dataset[], f: Partial<Filters> = {}) => runAnalysis(datasets, { ...DEFAULT_FILTERS, ...f }, DEFAULT_SETTINGS)
const row = (r: ReturnType<typeof run>, label: string) => r.branches.rows.find((x) => x.label === label)

describe('configuration', () => {
  it('lists the four independent Ginger & Co branches and keeps Pertutti separate', () => {
    expect(BRANDS['ginger-and-co'].branches).toEqual(['Hazmieh', 'Jal El Dib', 'Hamra', 'Discount'])
    expect(BRANDS.pertutti.branches).toEqual(['Hamra', 'Hazmieh'])
    expect(BRANDS.pertutti.branchGroups).toBeUndefined()
  })
  it('maps members to the group only in the combined view', () => {
    expect(reportingBranch('ginger-and-co', 'Discount', 'separate')).toBe('Discount')
    expect(reportingBranch('ginger-and-co', 'Discount', 'combined')).toBe('Hamra + Discount')
    expect(reportingBranch('ginger-and-co', 'Hazmieh', 'combined')).toBe('Hazmieh')
    expect(reportingBranch('pertutti', 'Hamra', 'combined')).toBe('Hamra')
    expect(expectedBranches('ginger-and-co', 'combined')).toEqual(['Hazmieh', 'Jal El Dib', 'Hamra + Discount'])
  })
})

describe('Separate Branches — October 2026', () => {
  const r = run([october, octBranches], { from: '2026-10-01', to: '2026-10-31' })

  it('shows Hamra and Discount individually', () => {
    expect(row(r, 'Hamra')).toMatchObject({ revenue: 3303, orders: 54, status: 'complete', userConfirmed: true })
    expect(row(r, 'Discount')).toMatchObject({ revenue: 100, orders: 2, status: 'complete' })
    expect(row(r, 'Hamra + Discount')).toBeUndefined()
  })
  it('shows branches without figures as incomplete, never as zero', () => {
    expect(r.branches.missing?.map((m) => m.label)).toEqual(['Hazmieh', 'Jal El Dib'])
    expect(r.branches.missing?.[0].reason).toMatch(/Incomplete data/)
  })
  it('keeps the brand total at USD 40,699 and 593 orders', () => {
    expect(r.totals.byCurrency[0]).toMatchObject({ currency: 'USD', revenue: 40699, orders: 593 })
  })
})

describe('Combine Hamra + Discount — October 2026', () => {
  const r = run([october, octBranches], { from: '2026-10-01', to: '2026-10-31', branchView: 'combined' })
  const group = row(r, 'Hamra + Discount')

  it('sums revenue and orders and recalculates AOV', () => {
    expect(group).toMatchObject({ revenue: 3403, orders: 56, status: 'complete', members: ['Hamra', 'Discount'] })
    expect(group?.averageOrderValue).toBeCloseTo(60.77, 2)
  })
  it('never lists the group and its members together', () => {
    expect(row(r, 'Hamra')).toBeUndefined()
    expect(row(r, 'Discount')).toBeUndefined()
    expect(r.branches.rows.reduce((s, x) => s + x.revenue, 0)).toBe(3403)
    expect(r.branches.missing?.map((m) => m.label)).toEqual(['Hazmieh', 'Jal El Dib'])
  })
  it('keeps the brand total unchanged', () => {
    expect(r.totals.byCurrency[0]).toMatchObject({ revenue: 40699, orders: 593 })
  })
  it('does not change the stored source data', () => {
    expect(octBranches.records.map((x) => x.branch)).toEqual(['Hamra', 'Discount'])
  })
  it('filters to the group: KPIs become the group totals', () => {
    const f = run([october, octBranches], { from: '2026-10-01', to: '2026-10-31', branchView: 'combined', branch: 'Hamra + Discount' })
    expect(f.totals.byCurrency[0]).toMatchObject({ revenue: 3403, orders: 56 })
    expect(f.totals.byCurrency[0].averageOrderValue).toBeCloseTo(60.77, 2)
  })
})

describe('date range is applied before grouping', () => {
  it('never applies the October figures to November', () => {
    const r = run([october, octBranches], { from: '2026-11-01', to: '2026-11-30', branchView: 'combined' })
    expect(r.branches.rows).toEqual([])
    expect(r.branches.missing?.map((m) => m.label)).toContain('Hamra + Discount')
  })
  it('does not prorate a monthly figure into part of the month', () => {
    const r = run([october, octBranches], { from: '2026-10-01', to: '2026-10-15' })
    expect(row(r, 'Hamra')).toBeUndefined()
    expect(row(r, 'Discount')).toBeUndefined()
  })
  it('flags the group as incomplete when Discount data is missing for a period', () => {
    const nov = manual({ periodStart: '2026-11-01', periodEnd: '2026-11-30', rows: [{ branch: 'Hamra', revenue: 2000, orders: 30 }] }, 'manual-nov')
    const combined = run([october, octBranches, nov], { from: '2026-11-01', to: '2026-11-30', branchView: 'combined' })
    const group = row(combined, 'Hamra + Discount')
    expect(group).toMatchObject({ revenue: 2000, orders: 30, status: 'incomplete' })
    expect(group?.notes?.join(' ')).toMatch(/no Discount figures/)
    const separate = run([october, octBranches, nov], { from: '2026-11-01', to: '2026-11-30' })
    expect(separate.branches.missing?.map((m) => m.label)).toContain('Discount')
    expect(row(separate, 'Discount')).toBeUndefined()
  })
  it('does not rank incomplete branches in insights', () => {
    const nov = manual({ periodStart: '2026-11-01', periodEnd: '2026-11-30', rows: [{ branch: 'Hamra', revenue: 2000, orders: 30 }, { branch: 'Hazmieh', revenue: 900, orders: 12 }] }, 'manual-nov2')
    const r = run([nov], { from: '2026-11-01', to: '2026-11-30', branchView: 'combined' })
    expect(r.insights.find((i) => i.id.startsWith('branch-top'))).toBeUndefined()
  })
})

describe('Pertutti stays separate', () => {
  it('has no reporting groups and ignores Ginger & Co branch figures', () => {
    const r = run([october, octBranches], { brandId: 'pertutti', branchView: 'combined' })
    expect(r.branches.rows).toEqual([])
    // Pertutti's own branches are expected but have no Weevi branch data in these fixtures.
    expect(r.branches.missing?.map((m) => m.label)).toEqual(['Hamra', 'Hazmieh'])
  })
})

describe('user-confirmed entries', () => {
  const base: ManualBranchInput = { brandId: 'ginger-and-co', platformId: 'weevi', currency: 'USD', periodStart: '2026-10-01', periodEnd: '2026-10-31', rows: [], note: '' }
  it('rejects a second entry for the same branch and overlapping period', () => {
    const issues = validateManualBranches({ ...base, rows: [{ branch: 'Hamra', revenue: 1, orders: 1 }] }, [octBranches])
    expect(issues.some((i) => i.level === 'error' && /already exist/.test(i.message))).toBe(true)
  })
  it('allows another branch for the same period', () => {
    expect(validateManualBranches({ ...base, rows: [{ branch: 'Hazmieh', revenue: 5000, orders: 70 }] }, [octBranches])).toEqual([])
  })
  it('rejects unknown branches, missing periods and fractional orders', () => {
    const issues = validateManualBranches({ ...base, periodStart: '', rows: [{ branch: 'Verdun', revenue: 1, orders: 1.5 }] }, [])
    expect(issues.map((i) => i.message).join(' ')).toMatch(/period/)
    expect(issues.map((i) => i.message).join(' ')).toMatch(/Verdun/)
    expect(issues.map((i) => i.message).join(' ')).toMatch(/whole number/)
  })
})

describe('analytical Excel export — both modes', () => {
  // Totals labels span columns A–B, so their figures sit under Revenue (C) and Orders (D).
  const sheetRows = async (view: 'separate' | 'combined') => {
    const result = run([october, octBranches], { from: '2026-10-01', to: '2026-10-31', branchView: view })
    const wb = await buildAnalyticalWorkbook(result, { title: 'Test', generatedAt: new Date(0), settings: DEFAULT_SETTINGS })
    const ws = wb.getWorksheet('Branch Performance')
    const rows: unknown[][] = []
    ws?.eachRow((r) => rows.push((r.values as unknown[]).slice(1)))
    return rows
  }
  it('separate: lists Hamra and Discount, and Hazmieh / Jal El Dib as incomplete', async () => {
    const rows = await sheetRows('separate')
    expect(rows.find((r) => r[0] === 'Hamra')?.slice(2, 4)).toEqual([3303, 54])
    expect(rows.find((r) => r[0] === 'Discount')?.slice(2, 4)).toEqual([100, 2])
    expect(rows.find((r) => r[0] === 'Hazmieh')?.[6]).toBe('Incomplete data')
    expect(rows.find((r) => r[0] === 'Brand total from sales exports')?.slice(2, 4)).toEqual([40699, 593])
  })
  it('combined: lists only the group, with recalculated AOV', async () => {
    const rows = await sheetRows('combined')
    const group = rows.find((r) => r[0] === 'Hamra + Discount')
    expect(group?.slice(2, 4)).toEqual([3403, 56])
    expect(group?.[4] as number).toBeCloseTo(60.77, 2)
    expect(rows.find((r) => r[0] === 'Hamra')).toBeUndefined()
    expect(rows.find((r) => r[0] === 'Listed branches (each counted once)')?.slice(2, 4)).toEqual([3403, 56])
  })
})

describe('one daily-sales export per branch', () => {
  const day = (n: number) => new Date(Date.UTC(2026, 9, n))
  const hamraFile = datasetFrom(rawSheet([['Days', 'Orders', 'Amount'], [day(1), '30', 'USD 2,000'], [day(31), '24', 'USD 1,303']], 'hamra.xlsx'), {
    branchScope: { mode: 'selected', branches: ['Hamra'] },
  })
  const hazmiehFile = datasetFrom(rawSheet([['Days', 'Orders', 'Amount'], [day(1), '40', 'USD 3,000'], [day(31), '10', 'USD 500']], 'hazmieh.xlsx'), {
    branchScope: { mode: 'selected', branches: ['Hazmieh'] },
  })

  it('does not treat files for different branches as overlapping', async () => {
    const { findOverlaps } = await import('@/import/validation')
    expect(findOverlaps(hazmiehFile, [hamraFile]).overlapping).toEqual([])
  })
  it('treats an all-branches file and a branch file for the same period as overlapping', async () => {
    const { findOverlaps } = await import('@/import/validation')
    expect(findOverlaps(hamraFile, [october]).overlapping.map((d) => d.id)).toEqual([october.id])
  })
  it('shows each branch from its own file and totals them', () => {
    const r = run([hamraFile, hazmiehFile], { from: '2026-10-01', to: '2026-10-31' })
    expect(row(r, 'Hamra')).toMatchObject({ revenue: 3303, orders: 54, status: 'complete' })
    expect(row(r, 'Hazmieh')).toMatchObject({ revenue: 3500, orders: 50, status: 'complete' })
    expect(r.totals.byCurrency[0]).toMatchObject({ revenue: 6803, orders: 104 })
  })
})
