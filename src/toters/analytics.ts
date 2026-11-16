/**
 * Toters analytics. Works only on Toters days — Weevi data is never read here, and Toters
 * figures are never passed to the Weevi engine.
 *
 * Per branch and date a day is one of: a value (including an actual zero), missing (no
 * imported row), or invalid (the export had a row for that date that failed validation).
 * Missing and invalid days are never treated as zero.
 */
import { BRANDS, BRAND_LIST, type BrandId } from '@/config/brands'
import { TOTERS_CONVERSION, TOTERS_STORES, TOTERS_UNAVAILABLE, branchKey } from '@/config/toters'
import type { TotersDay, TotersFilters, TotersGrain, TotersImport, TotersState } from './types'

const included = (i: TotersImport) => i.included !== false

export interface TotersBranchInfo {
  key: string
  brandId: BrandId
  branch: string
  storeId: string
  label: string
  /** Fixed position in the store registry — gives each branch a consistent colour. */
  index: number
}

export const branchLabel = (brandId: BrandId, branch: string) => `${BRANDS[brandId].name} — ${branch}`

export const TOTERS_BRANCHES: TotersBranchInfo[] = TOTERS_STORES.map((s, index) => ({
  key: branchKey(s.brandId, s.branch),
  brandId: s.brandId,
  branch: s.branch,
  storeId: s.storeId,
  label: branchLabel(s.brandId, s.branch),
  index,
}))

export const TOTERS_BRANDS: BrandId[] = BRAND_LIST.filter((b) => TOTERS_STORES.some((s) => s.brandId === b.id)).map((b) => b.id)

/** Branch options for a brand selection (the branch dropdown follows the brand filter). */
export function totersBranchOptions(brandId: TotersFilters['brandId']): TotersBranchInfo[] {
  return TOTERS_BRANCHES.filter((b) => brandId === 'all' || b.brandId === brandId)
}

export type DayStatus = 'value' | 'zero' | 'missing' | 'invalid'

export interface TotersDailyPoint {
  date: string
  /** Sum over branches with data; null when no selected branch has data for the date. */
  totalUsd: number | null
  byBranch: Record<string, number | null>
  status: 'complete' | 'partial' | 'missing'
  missingBranches: string[]
  invalidBranches: string[]
}

export interface TotersPeriodRow {
  key: string
  start: string
  end: string
  revenueUsd: number
  daysWithData: number
  calendarDays: number
  /** Bucket is cut by the date range, or has days without data. */
  partial: boolean
  change?: number
}

export interface TotersBranchRow {
  info: TotersBranchInfo
  csvTotal: number
  revenueLbp: number
  revenueUsd: number
  share?: number
  daysWithData: number
  zeroDays: number
  missingDays: number
  invalidDays: number
  averageDailyUsd?: number
  best?: { date: string; revenueUsd: number }
  lowest?: { date: string; revenueUsd: number }
}

export interface TotersBrandRow {
  brandId: BrandId
  name: string
  revenueUsd: number
  revenueLbp: number
  csvTotal: number
  share?: number
  branches: number
  branchesWithData: number
}

export interface TotersQualityItem {
  level: 'error' | 'warning' | 'info'
  message: string
}

export interface TotersAnalytics {
  filters: TotersFilters
  branches: TotersBranchInfo[]
  unavailable: { brandId: BrandId; branch: string; label: string; reason: string }[]
  range?: { start: string; end: string }
  calendar: string[]
  totals: {
    csvTotal: number
    revenueLbp: number
    revenueUsd: number
    daysWithData: number
    calendarDays: number
    averageDailyUsd?: number
    branchesWithData: number
    branchDaysWithData: number
    branchDaysExpected: number
    zeroDays: number
    missingDays: number
    invalidDays: number
  }
  highestBranch?: TotersBranchRow
  extremes?: { highest: { date: string; revenueUsd: number }; lowest: { date: string; revenueUsd: number } }
  daily: TotersDailyPoint[]
  periods: TotersPeriodRow[]
  branchRows: TotersBranchRow[]
  brandRows: TotersBrandRow[]
  /** status[branchKey][date] */
  status: Record<string, Record<string, DayStatus>>
  /** Included imports for the branches in scope. */
  imports: TotersImport[]
  /** All imports (included and excluded) for the branches in scope, for the history. */
  allImports: TotersImport[]
  quality: TotersQualityItem[]
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

/** Monday of the ISO week. */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

function bucketOf(date: string, grain: TotersGrain): { key: string; start: string; end: string } {
  if (grain === 'week') {
    const start = weekStart(date)
    return { key: start, start, end: fromMs(toMs(start) + 6 * DAY) }
  }
  if (grain === 'month') {
    const [y, m] = date.split('-').map(Number)
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    return { key: date.slice(0, 7), start: `${date.slice(0, 7)}-01`, end }
  }
  return { key: date, start: date, end: date }
}

export function computeTotersAnalytics(state: TotersState, filters: TotersFilters): TotersAnalytics {
  const branches = TOTERS_BRANCHES.filter((b) => (filters.brandId === 'all' || b.brandId === filters.brandId) && (filters.branch === 'all' || b.key === filters.branch))
  const unavailable =
    filters.branch === 'all'
      ? TOTERS_UNAVAILABLE.filter((u) => filters.brandId === 'all' || u.brandId === filters.brandId).map((u) => ({ ...u, label: branchLabel(u.brandId, u.branch) }))
      : []
  const storeIds = new Set(branches.map((b) => b.storeId))
  // Excluded imports keep their stored days, but those days are left out of every figure.
  const excludedIds = new Set(state.imports.filter((i) => !included(i)).map((i) => i.id))
  const scopeDays = state.days.filter((d) => storeIds.has(d.storeId) && !excludedIds.has(d.importId))
  const allImports = state.imports.filter((i) => storeIds.has(i.storeId))
  const imports = allImports.filter(included)

  // Evaluation range: the selected dates, completed from the imported extent when open-ended.
  const sortedDates = scopeDays.map((d) => d.date).sort()
  const start = filters.from || sortedDates[0]
  const end = filters.to || sortedDates[sortedDates.length - 1]
  const range = start && end && start <= end ? { start, end } : undefined
  const calendar = range ? dateSpan(range.start, range.end) : []
  const inRange = (date: string) => Boolean(range && date >= range.start && date <= range.end)

  const byStore = new Map<string, Map<string, TotersDay>>()
  for (const d of scopeDays) {
    if (!inRange(d.date)) continue
    if (!byStore.has(d.storeId)) byStore.set(d.storeId, new Map())
    byStore.get(d.storeId)!.set(d.date, d)
  }
  // Dates with an invalid row in an import for the store (and no valid stored value).
  const invalidDates = new Map<string, Set<string>>()
  for (const i of imports) for (const r of i.invalidRows) if (r.date) invalidDates.set(i.storeId, (invalidDates.get(i.storeId) ?? new Set()).add(r.date))

  const status: TotersAnalytics['status'] = {}
  for (const b of branches) {
    const days = byStore.get(b.storeId)
    status[b.key] = {}
    for (const date of calendar) {
      const d = days?.get(date)
      status[b.key][date] = d ? (d.csvTotal === 0 ? 'zero' : 'value') : invalidDates.get(b.storeId)?.has(date) ? 'invalid' : 'missing'
    }
  }

  const daily: TotersDailyPoint[] = calendar.map((date) => {
    const byBranch: Record<string, number | null> = {}
    const missingBranches: string[] = []
    const invalidBranches: string[] = []
    let total = 0
    let any = false
    for (const b of branches) {
      const d = byStore.get(b.storeId)?.get(date)
      byBranch[b.key] = d ? d.revenueUsd : null
      if (d) {
        total += d.revenueUsd
        any = true
      } else if (status[b.key][date] === 'invalid') invalidBranches.push(b.label)
      else missingBranches.push(b.label)
    }
    const gaps = missingBranches.length + invalidBranches.length
    return { date, totalUsd: any ? total : null, byBranch, status: !any ? 'missing' : gaps > 0 ? 'partial' : 'complete', missingBranches, invalidBranches }
  })

  const branchRows: TotersBranchRow[] = branches.map((b) => {
    const days = [...(byStore.get(b.storeId)?.values() ?? [])].sort((x, y) => x.date.localeCompare(y.date))
    const sum = (f: (d: TotersDay) => number) => days.reduce((a, d) => a + f(d), 0)
    const statuses = Object.values(status[b.key])
    let best: TotersBranchRow['best']
    let lowest: TotersBranchRow['lowest']
    for (const d of days) {
      if (!best || d.revenueUsd > best.revenueUsd) best = { date: d.date, revenueUsd: d.revenueUsd }
      if (!lowest || d.revenueUsd < lowest.revenueUsd) lowest = { date: d.date, revenueUsd: d.revenueUsd }
    }
    const revenueUsd = sum((d) => d.revenueUsd)
    return {
      info: b,
      csvTotal: sum((d) => d.csvTotal),
      revenueLbp: sum((d) => d.revenueLbp),
      revenueUsd,
      daysWithData: days.length,
      zeroDays: statuses.filter((s) => s === 'zero').length,
      missingDays: statuses.filter((s) => s === 'missing').length,
      invalidDays: statuses.filter((s) => s === 'invalid').length,
      averageDailyUsd: days.length > 0 ? revenueUsd / days.length : undefined,
      best,
      lowest,
    }
  })

  const totalUsd = branchRows.reduce((a, r) => a + r.revenueUsd, 0)
  const hasData = branchRows.some((r) => r.daysWithData > 0)
  for (const r of branchRows) r.share = hasData && totalUsd !== 0 ? r.revenueUsd / totalUsd : undefined
  const ranked = branchRows.filter((r) => r.daysWithData > 0).sort((a, b) => b.revenueUsd - a.revenueUsd)

  const brandIds = [...new Set(branches.map((b) => b.brandId))]
  const brandRows: TotersBrandRow[] = brandIds.map((id) => {
    const rows = branchRows.filter((r) => r.info.brandId === id)
    const revenueUsd = rows.reduce((a, r) => a + r.revenueUsd, 0)
    return {
      brandId: id,
      name: BRANDS[id].name,
      revenueUsd,
      revenueLbp: rows.reduce((a, r) => a + r.revenueLbp, 0),
      csvTotal: rows.reduce((a, r) => a + r.csvTotal, 0),
      share: hasData && totalUsd !== 0 ? revenueUsd / totalUsd : undefined,
      branches: rows.length,
      branchesWithData: rows.filter((r) => r.daysWithData > 0).length,
    }
  })

  const withData = daily.filter((d) => d.totalUsd !== null)
  const daysWithData = withData.length
  let extremes: TotersAnalytics['extremes']
  const complete = daily.filter((d) => d.status === 'complete' && d.totalUsd !== null)
  if (complete.length >= 2) {
    const sorted = [...complete].sort((a, b) => (b.totalUsd as number) - (a.totalUsd as number))
    const h = sorted[0]
    const l = sorted[sorted.length - 1]
    extremes = { highest: { date: h.date, revenueUsd: h.totalUsd as number }, lowest: { date: l.date, revenueUsd: l.totalUsd as number } }
  }

  // Period table for the selected granularity.
  const buckets = new Map<string, TotersPeriodRow>()
  for (const p of daily) {
    const b = bucketOf(p.date, filters.grain)
    const row = buckets.get(b.key) ?? { key: b.key, start: p.date, end: p.date, revenueUsd: 0, daysWithData: 0, calendarDays: 0, partial: false }
    row.end = p.date
    row.calendarDays++
    if (p.totalUsd !== null) {
      row.revenueUsd += p.totalUsd
      row.daysWithData++
    }
    if (p.status !== 'complete') row.partial = true
    if (range && (b.start < range.start || b.end > range.end)) row.partial = true
    buckets.set(b.key, row)
  }
  const periods = [...buckets.values()]
  periods.forEach((p, i) => {
    const prev = periods[i - 1]
    if (prev && prev.revenueUsd !== 0 && prev.daysWithData > 0 && p.daysWithData > 0) p.change = (p.revenueUsd - prev.revenueUsd) / prev.revenueUsd
  })

  const totals: TotersAnalytics['totals'] = {
    csvTotal: branchRows.reduce((a, r) => a + r.csvTotal, 0),
    revenueLbp: branchRows.reduce((a, r) => a + r.revenueLbp, 0),
    revenueUsd: totalUsd,
    daysWithData,
    calendarDays: calendar.length,
    averageDailyUsd: daysWithData > 0 ? totalUsd / daysWithData : undefined,
    branchesWithData: ranked.length,
    branchDaysWithData: branchRows.reduce((a, r) => a + r.daysWithData, 0),
    branchDaysExpected: branches.length * calendar.length,
    zeroDays: branchRows.reduce((a, r) => a + r.zeroDays, 0),
    missingDays: branchRows.reduce((a, r) => a + r.missingDays, 0),
    invalidDays: branchRows.reduce((a, r) => a + r.invalidDays, 0),
  }

  const quality: TotersQualityItem[] = []
  for (const r of branchRows) {
    if (!range) continue
    if (r.daysWithData === 0) quality.push({ level: 'warning', message: `${r.info.label}: no Toters data imported for ${range.start} to ${range.end}.` })
    else if (r.missingDays > 0) quality.push({ level: 'warning', message: `${r.info.label}: ${r.missingDays} day(s) without imported data (shown as missing, not zero).` })
    if (r.invalidDays > 0) quality.push({ level: 'error', message: `${r.info.label}: ${r.invalidDays} day(s) with invalid records in the export (not imported).` })
    if (r.zeroDays > 0) quality.push({ level: 'info', message: `${r.info.label}: ${r.zeroDays} day(s) with actual zero sales in the export.` })
  }
  const undatedInvalid = imports.reduce((a, i) => a + i.invalidRows.filter((r) => !r.date).length, 0)
  if (undatedInvalid > 0) quality.push({ level: 'error', message: `${undatedInvalid} row(s) with an invalid or missing date were not imported.` })
  const batches = new Map<string, TotersImport>()
  for (const i of imports) if (i.reconciliation && !batches.has(i.batchId)) batches.set(i.batchId, i)
  for (const i of batches.values()) {
    const r = i.reconciliation!
    quality.push(
      r.mismatches.length === 0
        ? { level: 'info', message: `“${i.fileName}”: branch rows reconcile with the export's combined totals (store_id 0) on all ${r.days} day(s). Combined rows are used for reconciliation only.` }
        : { level: 'warning', message: `“${i.fileName}”: branch rows differ from the export's combined totals (store_id 0) on ${r.mismatches.length} of ${r.days} day(s). Branch rows are used for all figures.` },
    )
  }
  const excluded = allImports.filter((i) => !included(i))
  if (excluded.length > 0)
    quality.push({ level: 'warning', message: `${excluded.length} Toters import(s) are excluded from analysis (${[...new Set(excluded.map((i) => i.fileName))].join(', ')}). Their days count as missing until included again.` })
  for (const u of unavailable) quality.push({ level: 'info', message: `${u.label}: not available — ${u.reason.toLowerCase()}. Excluded from Toters totals and availability.` })
  quality.push({ level: 'info', message: `Currency conversion: ${TOTERS_CONVERSION.description}. Applied to every Toters amount; never applied to Weevi.` })
  quality.push({ level: 'info', message: 'The Toters revenue export has no order counts, so orders and average order value are not reported.' })
  quality.push({ level: 'info', message: 'Toters revenue is reported separately and is never added to Weevi (app) revenue.' })

  return { filters, branches, unavailable, range, calendar, totals, highestBranch: ranked[0], extremes, daily, periods, branchRows, brandRows, status, imports, allImports, quality, hasData }
}
