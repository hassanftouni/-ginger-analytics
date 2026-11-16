import { BRANDS, branchGroup, expectedBranches, type BrandId } from '@/config/brands'
import type { GroupBreakdown, SalesFact, ScopedRecord } from '@/types/analytics'
import type { Dataset } from '@/types/dataset'
import type { Filters } from '@/types/filters'
import { groupFacts, addDays } from './metrics'

type Interval = [string, string]

function merge(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a[0].localeCompare(b[0]))
  const out: Interval[] = []
  for (const iv of sorted) {
    const last = out[out.length - 1]
    if (last && iv[0] <= addDays(last[1], 1)) {
      if (iv[1] > last[1]) last[1] = iv[1]
    } else out.push([iv[0], iv[1]])
  }
  return out
}

const covers = (intervals: Interval[], range: { start: string; end: string }) =>
  merge(intervals).some(([s, e]) => s <= range.start && e >= range.end)

/**
 * Branch breakdown under the selected branch view. Filters (including the date range) are
 * applied before this runs, so grouping happens on already-scoped rows. Each row is checked
 * against the analysed period: a branch, or any member of a group, without data covering the
 * whole period is marked incomplete — values are never assumed or carried over from another period.
 */
export function branchBreakdown(
  facts: SalesFact[],
  records: ScopedRecord[],
  datasets: Dataset[],
  filters: Filters,
  range: { start: string; end: string } | null,
  basisLabel: string,
): GroupBreakdown {
  const byId = new Map(datasets.map((d) => [d.id, d]))
  // Prefer branch-level sales facts; otherwise fall back to branch performance rows (exports or user-confirmed entries).
  let rows: SalesFact[] = facts.filter((f) => f.reportingBranch)
  let basis = basisLabel
  if (rows.length === 0) {
    rows = records.filter((r) => r.category === 'branch-performance' && r.reportingBranch).map((r) => ({ ...r, orders: r.orderCount }))
    const manual = rows.filter((r) => r.userConfirmed).length
    basis = manual === 0 ? 'Branch performance exports' : manual === rows.length ? 'User-confirmed branch figures' : 'Branch performance exports and user-confirmed figures'
  }

  const brands = new Set(rows.map((r) => r.brandId))
  const multiBrand = brands.size > 1 || filters.brandId === 'all'
  const keyOf = (brandId: BrandId, branch: string) => `${brandId}|${branch}`
  const label = (key: string) => {
    const [brandId, branch] = key.split('|') as [BrandId, string]
    return multiBrand ? `${BRANDS[brandId].name} · ${branch}` : branch
  }

  // Coverage per source branch (not per group): each file contributes its declared period
  // (undated rows) or its first–last date for that branch (dated rows).
  const spans = new Map<string, { key: string; iv: Interval }>()
  const confirmed = new Set<string>()
  for (const r of rows) {
    const d = byId.get(r.datasetId)
    const k = keyOf(r.brandId, r.branch ?? (r.reportingBranch as string))
    if (r.userConfirmed) confirmed.add(keyOf(r.brandId, r.reportingBranch as string))
    const iv: Interval | null = r.date ? [r.date, r.date] : d?.metadata.periodStart && d.metadata.periodEnd ? [d.metadata.periodStart, d.metadata.periodEnd] : null
    if (!iv) continue
    const id = `${k}|${r.datasetId}`
    const cur = spans.get(id)
    spans.set(id, { key: k, iv: cur ? [iv[0] < cur.iv[0] ? iv[0] : cur.iv[0], iv[1] > cur.iv[1] ? iv[1] : cur.iv[1]] : iv })
  }
  const coverage = new Map<string, Interval[]>()
  for (const { key, iv } of spans.values()) coverage.set(key, [...(coverage.get(key) ?? []), iv])
  const hasRows = (brandId: BrandId, branch: string) => rows.some((r) => r.brandId === brandId && r.branch === branch)
  const isComplete = (brandId: BrandId, branch: string) => (range ? covers(coverage.get(keyOf(brandId, branch)) ?? [], range) : hasRows(brandId, branch))

  const grouped = groupFacts(rows, (f) => keyOf(f.brandId, f.reportingBranch as string), label, basis)
  for (const row of grouped.rows) {
    const [brandId, name] = row.key.split('|') as [BrandId, string]
    const group = filters.branchView === 'combined' ? branchGroup(brandId, name) : undefined
    const sourceBranches = group ? group.members : [name]
    const missingMembers = sourceBranches.filter((b) => !isComplete(brandId, b))
    row.members = group?.members
    row.userConfirmed = confirmed.has(row.key)
    row.status = missingMembers.length === 0 ? 'complete' : 'incomplete'
    row.notes = []
    if (group) row.notes.push(`Reporting group: ${group.members.join(' + ')} (source data kept separate)`)
    if (missingMembers.length > 0) {
      row.notes.push(group ? `Incomplete data: no ${missingMembers.join(', ')} figures covering this period` : 'Incomplete data: figures do not cover the whole period')
    }
    if (row.userConfirmed) row.notes.push('Includes user-confirmed figures not backed by a branch export')
  }

  // Expected branches with no data at all in the period.
  const expectedBrands: BrandId[] = filters.brandId === 'all' ? (Object.keys(BRANDS) as BrandId[]) : [filters.brandId]
  const present = new Set(grouped.rows.map((r) => r.key))
  const missing: { label: string; reason: string }[] = []
  for (const brandId of expectedBrands) {
    if (filters.branch !== 'all') continue
    for (const b of expectedBranches(brandId, filters.branchView)) {
      if (!present.has(keyOf(brandId, b))) missing.push({ label: label(keyOf(brandId, b)), reason: 'Incomplete data: no branch figures for this period' })
    }
  }
  return { ...grouped, basis: grouped.rows.length > 0 ? basis : grouped.basis, missing, checkedRange: range }
}
