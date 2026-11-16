import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runAnalysis } from '@/analytics'
import { ACTIVE_PLATFORMS, BRANDS } from '@/config/brands'
import { rawFromDisk, rawSheet } from '@/test/build'
import { detectToters } from '@/toters/parse'
import type { CellValue, RawFile } from '@/types/data'
import { DEFAULT_FILTERS } from '@/types/filters'
import { DEFAULT_SETTINGS } from '@/types/settings'
import { computeFoodyAnalytics, parseItems } from './analytics'
import { applyFoodyImport, planFoodyImport, removeFoodyImport, setFoodyImportIncluded } from './merge'
import { detectFoody, parseFoody } from './parse'
import { DEFAULT_FOODY_FILTERS, EMPTY_FOODY_STATE, type FoodyFilters, type FoodyState } from './types'

// Synthetic fixtures in the verified Foody layout (no real figures). Row 1 = grouped titles.
const GROUPS = ['Order metadata', 'Order metadata', 'Order metadata', 'Order metadata', 'Order metadata', 'Operations', 'Operations', 'Operational issues', 'Operational issues', 'Operational issues', 'Income', 'Deductions', 'Deductions', 'Additional information']
const HEADERS = ['Restaurant name', 'Order ID', 'Store ID', 'Delivery type', 'Payment type', 'Order status', 'Order received at', 'Has complaint?', 'Cancellation reason', 'Cancellation owner', 'Subtotal', 'Discount', 'Voucher', 'Order items']
const STORE = '2000666969'
type Row = { id: string; at: string; status?: string; sub: number | string; disc?: number | string; vouch?: number | string; store?: string; items?: string; complaint?: string; type?: string }
const row = (r: Row): CellValue[] => ['Ginger&Co', r.id, r.store ?? STORE, r.type ?? 'Platform delivery', 'Online', r.status ?? 'Delivered', r.at, r.complaint ?? 'N', r.status === 'Cancelled' ? 'Vendor closed' : '', r.status === 'Cancelled' ? 'Vendor' : '', r.sub, r.disc ?? 0, r.vouch ?? 0, r.items ?? '1 Test item']
const file = (rows: Row[], name = 'orderDetails.xlsx') => rawSheet([GROUPS, HEADERS, ...rows.map(row)], name)

const parse = (raw: RawFile) => parseFoody(raw, detectFoody(raw)!)

let n = 0
function importInto(state: FoodyState, raw: RawFile, resolution: 'replace' | 'keep' = 'keep') {
  const p = parse(raw)
  const errors = p.issues.filter((i) => i.level === 'error')
  if (errors.length > 0) throw new Error(errors.map((i) => i.message).join('; '))
  const plan = planFoodyImport(state, p)
  if (plan.kind === 'identical') return { state, plan, entry: undefined }
  n++
  const r = applyFoodyImport(state, p, plan, resolution, { id: `imp-${n}`, fileName: raw.fileName, fileSize: 1, importedAt: n, warnings: [] })
  return { ...r, plan }
}

const analyse = (state: FoodyState, f: Partial<FoodyFilters> = {}) => computeFoodyAnalytics(state, { ...DEFAULT_FOODY_FILTERS, ...f })

const OCT = [
  { id: '1', at: '2026-10-01 12:00', sub: 50, disc: 5 },
  { id: '2', at: '2026-10-01 19:30', sub: 30, vouch: 3 },
  { id: '3', at: '2026-10-02 13:00', sub: 20, status: 'Cancelled' },
  { id: '4', at: '2026-10-03 20:00', sub: 40, complaint: 'Y', type: 'Pickup' },
] satisfies Row[]

describe('Foody detection and parsing', () => {
  it('recognises the export from its headers on row 2 (not the file name)', () => {
    const raw = file(OCT, 'anything.xlsx')
    const d = detectFoody(raw)
    expect(d?.headerRow).toBe(2)
    expect(detectToters(raw)).toBeNull()
    const p = parse(raw)
    expect(p.orders).toHaveLength(4)
    expect(p.storeIds).toEqual([STORE])
    expect(p.periodStart).toBe('2026-10-01')
    expect(p.periodEnd).toBe('2026-10-03')
  })

  it('does not recognise unrelated sheets', () => {
    expect(detectFoody(rawSheet([['Days', 'Orders', 'Amount']]))).toBeNull()
  })

  it('reports invalid rows instead of treating them as zero', () => {
    const p = parse(file([...OCT, { id: '5', at: 'yesterday', sub: 10 }, { id: '6', at: '2026-10-04 10:00', sub: '' }, { id: '7', at: '2026-10-04 10:00', sub: 'abc' }]))
    expect(p.orders).toHaveLength(4)
    expect(p.invalid.map((r) => r.reason)).toEqual([expect.stringMatching(/Invalid “Order received at”/), expect.stringMatching(/Missing Subtotal/), expect.stringMatching(/Invalid Subtotal/)])
  })

  it('blocks unknown store IDs', () => {
    const p = parse(file([{ id: '1', at: '2026-10-01 12:00', sub: 10, store: '999' }]))
    expect(p.issues.some((i) => i.level === 'error' && i.message.includes('999'))).toBe(true)
  })

  it('counts identical repeated rows once and rejects conflicting repeats', () => {
    const p = parse(file([...OCT, OCT[0], { ...OCT[1], sub: 99 }]))
    expect(p.orders.map((o) => o.orderId)).toEqual(['1', '3', '4'])
    expect(p.invalid.filter((r) => r.orderId === '2')).toHaveLength(2)
  })

  it('dates an order cancelled before receipt by “Cancelled at”; other orders need a received time', () => {
    const raw = rawSheet([[...GROUPS, 'x'], [...HEADERS, 'Cancelled at'], [...row({ id: '1', at: '', sub: 9, status: 'Cancelled' }), '2026-10-05 18:00'], [...row({ id: '2', at: '', sub: 9 }), '']])
    const p = parse(raw)
    expect(p.orders.map((o) => [o.orderId, o.date, o.dateSource])).toEqual([['1', '2026-10-05', 'cancelled']])
    expect(p.invalid.map((r) => r.orderId)).toEqual(['2'])
  })

  it('flags statuses without a configured meaning', () => {
    const p = parse(file([{ id: '1', at: '2026-10-01 12:00', sub: 10, status: 'Refunded' }]))
    expect(p.orders[0].outcome).toBe('other')
    expect(p.issues.some((i) => i.level === 'warning' && i.message.includes('Refunded'))).toBe(true)
  })
})

describe('Foody sales rules', () => {
  const a = analyse(importInto(EMPTY_FOODY_STATE, file(OCT)).state)

  it('gross = subtotal, net = subtotal − discount − voucher, AOV = net ÷ valid orders', () => {
    expect(a.totals.validOrders).toBe(3)
    expect(a.totals.gross).toBe(120)
    expect(a.totals.discount).toBe(5)
    expect(a.totals.voucher).toBe(3)
    expect(a.totals.net).toBe(112)
    expect(a.totals.aov).toBeCloseTo(112 / 3, 10)
    expect(a.totals.promoOrders).toBe(2)
  })

  it('excludes cancelled orders from sales and tracks them separately', () => {
    expect(a.totals.cancelledOrders).toBe(1)
    expect(a.totals.cancelledSubtotal).toBe(20)
    expect(a.cancellations.byReason).toEqual([{ label: 'Vendor closed', orders: 1, subtotal: 20 }])
    expect(a.totals.cancellationRate).toBeCloseTo(1 / 4, 10)
  })

  it('reports in EUR and breaks down delivery type and complaints', () => {
    expect(a.currency).toBe('EUR')
    expect(a.mix.deliveryType.map((m) => [m.label, m.orders])).toEqual([['Platform delivery', 2], ['Pickup', 1]])
    expect(a.totals.complaints).toBe(1)
  })

  it('treats covered days without orders as zero, days outside imports as missing', () => {
    const b = analyse(importInto(EMPTY_FOODY_STATE, file(OCT)).state, { from: '2026-09-30', to: '2026-10-03' })
    expect(b.daily.map((d) => d.net)).toEqual([null, 72, 0, 40])
    expect(b.daily[0].status).toBe('missing')
    expect(b.totals.missingBranchDays).toBe(1)
  })

  it('aggregates weekly and monthly with the same totals', () => {
    const s = importInto(EMPTY_FOODY_STATE, file(OCT)).state
    for (const grain of ['week', 'month'] as const) expect(analyse(s, { grain }).periods.reduce((x, p) => x + p.metrics.net, 0)).toBe(112)
  })
})

describe('Foody duplicate prevention', () => {
  it('skips identical re-imports and adds only new orders from overlapping files', () => {
    const first = importInto(EMPTY_FOODY_STATE, file(OCT, 'a.xlsx'))
    expect(importInto(first.state, file(OCT, 'renamed.xlsx')).plan.kind).toBe('identical')
    const overlap = importInto(first.state, file([OCT[3], { id: '8', at: '2026-10-04 12:00', sub: 10 }], 'b.xlsx'))
    expect(overlap.plan.newOrders.map((o) => o.orderId)).toEqual(['8'])
    expect(overlap.plan.unchanged.map((o) => o.orderId)).toEqual(['4'])
    expect(overlap.state.orders).toHaveLength(5)
    expect(analyse(overlap.state).totals.net).toBe(122)
  })

  it('asks before replacing an order whose values changed, and keeps an audit trail', () => {
    const first = importInto(EMPTY_FOODY_STATE, file(OCT))
    const changed = file([{ ...OCT[0], status: 'Cancelled' }], 'later.xlsx')
    expect(planFoodyImport(first.state, parse(changed)).kind).toBe('conflict')
    const kept = importInto(first.state, changed, 'keep')
    expect(analyse(kept.state).totals.net).toBe(112)
    const replaced = importInto(first.state, changed, 'replace')
    expect(analyse(replaced.state).totals.net).toBe(67)
    expect(replaced.entry?.replaced).toEqual([{ orderId: '1', previousNet: 45, previousStatus: 'Delivered', previousImportId: first.entry!.id }])
  })

  it('validates stored orders against each file’s own totals', () => {
    const s = importInto(EMPTY_FOODY_STATE, file(OCT)).state
    expect(analyse(s).reconciliation.every((r) => r.matches)).toBe(true)
  })

  it('excluding or deleting an import removes its orders from every figure', () => {
    const first = importInto(EMPTY_FOODY_STATE, file(OCT))
    const id = first.entry!.id
    expect(analyse(setFoodyImportIncluded(first.state, id, false)).hasData).toBe(false)
    expect(removeFoodyImport(first.state, id).orders).toHaveLength(0)
  })
})

describe('Foody period comparison', () => {
  const s = importInto(EMPTY_FOODY_STATE, file([...OCT, { id: '9', at: '2026-10-05 12:00', sub: 100, disc: 10 }, { id: '10', at: '2026-10-06 12:00', sub: 60 }])).state

  it('compares a campaign range with the previous period of the same length', () => {
    const a = analyse(s, { from: '2026-10-04', to: '2026-10-06', compare: 'previous' })
    expect(a.comparison?.baseline).toMatchObject({ start: '2026-10-01', end: '2026-10-03' })
    expect(a.comparison?.current.metrics.net).toBe(150)
    expect(a.comparison?.baseline.metrics.net).toBe(112)
    expect(a.comparison?.change.net).toBeCloseTo(38 / 112, 10)
  })

  it('compares with a custom range and flags a baseline without imported data', () => {
    const a = analyse(s, { from: '2026-10-04', to: '2026-10-06', compare: 'custom', compareFrom: '2026-09-01', compareTo: '2026-09-03' })
    expect(a.comparison?.baselineIncomplete).toBe(true)
    expect(a.comparison?.change.net).toBeUndefined()
  })
})

describe('Foody item text', () => {
  it('splits items at top-level commas and ignores modifiers', () => {
    expect(parseItems('2 Miso soup, 1 Salmon poke bowl [1 With rice, 1 Extra sauce], 1 Duo set').items).toEqual([
      { name: 'Miso soup', quantity: 2 },
      { name: 'Salmon poke bowl', quantity: 1 },
      { name: 'Duo set', quantity: 1 },
    ])
    expect(parseItems('Something odd').unparsed).toBe(1)
  })
})

describe('Foody stays separate', () => {
  it('is not analysed by the Weevi engine and is not a Ginger & Co Weevi source', () => {
    expect(ACTIVE_PLATFORMS.map((p) => p.id)).not.toContain('foody')
    expect(BRANDS['ginger-and-co'].sources.map((s) => s.platformId)).not.toContain('foody')
    const result = runAnalysis([], DEFAULT_FILTERS, DEFAULT_SETTINGS)
    expect(result.totals.byCurrency).toEqual([])
  })
})

const DIR = join(process.cwd(), 'samples', 'foody')
const sampleFiles = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.xlsx')) : []

describe.skipIf(sampleFiles.length === 0)('Foody — real October 2026 export', () => {
  it('matches the totals computed directly from the export', async () => {
    const raw = await rawFromDisk(join(DIR, sampleFiles[0]))
    const p = parse(raw)
    expect(p.invalid).toEqual([])
    // One order was cancelled before it was received: dated by "Cancelled at".
    expect(p.orders.filter((o) => o.dateSource === 'cancelled').map((o) => [o.outcome, o.date])).toEqual([['cancelled', '2026-10-13']])
    expect(p.issues.filter((i) => i.level === 'error')).toEqual([])
    expect(p.storeIds).toEqual([STORE])
    expect(p.control).toMatchObject({ orders: 367, validOrders: 364, cancelledOrders: 3, otherOrders: 0, gross: 14375.5, discount: 70, voucher: 110, net: 14195.5 })
    const state = importInto(EMPTY_FOODY_STATE, raw).state
    const a = analyse(state, { from: '2026-10-01', to: '2026-10-31' })
    expect(a.totals.validOrders).toBe(364)
    expect(Math.round(a.totals.net * 100) / 100).toBe(14195.5)
    expect(Math.round(a.totals.gross * 100) / 100).toBe(14375.5)
    expect(Math.round((a.totals.aov as number) * 100) / 100).toBe(39)
    expect(a.totals.cancelledOrders).toBe(3)
    expect(a.totals.cancelledSubtotal).toBe(147)
    expect(a.totals.complaints).toBe(2)
    expect(a.totals.missingBranchDays).toBe(0)
    expect(a.branchRows[0].info.label).toBe('Ginger & Co — Nicosia')
    expect(a.reconciliation.every((r) => r.matches)).toBe(true)
    expect(a.items.unparsed).toBe(0)
    expect(a.daily.reduce((x, d) => x + (d.net ?? 0), 0)).toBeCloseTo(14195.5, 6)
    // Re-importing the same export changes nothing.
    expect(planFoodyImport(state, parse(raw)).kind).toBe('identical')
  })
})
