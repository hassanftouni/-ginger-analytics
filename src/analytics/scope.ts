import { PLATFORMS, reportingBranch } from '@/config/brands'
import type { ScopedRecord, StatusSummary } from '@/types/analytics'
import type { Dataset } from '@/types/dataset'
import type { Filters } from '@/types/filters'
import type { ReportingSettings } from '@/types/settings'

/**
 * Datasets that are included and match the brand / platform / country filters. Datasets of a
 * separately reported platform (Toters) are never analysed here, so their revenue cannot be
 * mixed into Weevi totals.
 */
export function datasetsInScope(datasets: Dataset[], filters: Filters): Dataset[] {
  return datasets.filter((d) => {
    if (!d.included) return false
    if (PLATFORMS[d.metadata.platformId]?.separate) return false
    const m = d.metadata
    if (filters.brandId !== 'all' && m.brandId !== filters.brandId) return false
    if (filters.platformId !== 'all' && m.platformId !== filters.platformId) return false
    if (filters.country !== 'all' && m.country !== filters.country) return false
    return true
  })
}

const norm = (s: string) => s.trim().toLowerCase()

export function classifyStatus(status: string | undefined, settings: ReportingSettings): 'cancelled' | 'refunded' | null {
  if (!status) return null
  const value = norm(status)
  if (settings.cancelledStatuses.some((s) => norm(s) === value)) return 'cancelled'
  if (settings.refundedStatuses.some((s) => norm(s) === value)) return 'refunded'
  return null
}

function inDateRange(date: string | undefined, dataset: Dataset, filters: Filters): boolean {
  if (!filters.from && !filters.to) return true
  if (date) {
    if (filters.from && date < filters.from) return false
    if (filters.to && date > filters.to) return false
    return true
  }
  // Undated row: include only if the file's declared period lies entirely within the range.
  const { periodStart, periodEnd } = dataset.metadata
  if (!periodStart || !periodEnd) return false
  if (filters.from && periodStart < filters.from) return false
  if (filters.to && periodEnd > filters.to) return false
  return true
}

export interface ScopeResult {
  records: ScopedRecord[]
  status: StatusSummary
  undatedExcluded: number
  branchFromScopeRows: number
}

/**
 * Branch for a row: its own branch column, or — only when the user declared the file covers
 * exactly one branch — that branch. Multi-branch and "all branches" files are never split.
 */
export function effectiveBranch(branch: string | undefined, dataset: Dataset): { branch: string | undefined; fromScope: boolean } {
  if (branch) return { branch, fromScope: false }
  const scope = dataset.metadata.branchScope
  if (scope?.mode === 'selected' && scope.branches.length === 1) return { branch: scope.branches[0], fromScope: true }
  return { branch: undefined, fromScope: false }
}

/**
 * Join records with dataset context and apply the branch / channel / date filters and the
 * cancelled / refunded policy. Records without a branch (or channel) are excluded when a
 * branch (or channel) filter is active.
 */
export function scopeRecords(datasets: Dataset[], filters: Filters, settings: ReportingSettings): ScopeResult {
  const records: ScopedRecord[] = []
  const statuses = new Set<string>()
  let statusMapped = false
  let cancelledRows = 0
  let refundedRows = 0
  let excludedRows = 0
  let undatedExcluded = 0
  let branchFromScopeRows = 0

  for (const d of datasets) {
    if (d.mapping.status) statusMapped = true
    for (const r of d.records) {
      const eb = effectiveBranch(r.branch, d)
      // Grouping (e.g. Hamra + Discount) is a reporting view: the source branch is kept on the row.
      const rb = eb.branch ? reportingBranch(d.metadata.brandId, eb.branch, filters.branchView) : undefined
      if (filters.branch !== 'all' && rb !== filters.branch) continue
      if (filters.channel !== 'all' && r.channel !== filters.channel) continue
      if (!inDateRange(r.date, d, filters)) {
        if (!r.date) undatedExcluded++
        continue
      }
      if (r.status) statuses.add(r.status)
      const kind = classifyStatus(r.status, settings)
      if (kind === 'cancelled') {
        cancelledRows++
        if (settings.cancelledTreatment === 'exclude') {
          excludedRows++
          continue
        }
      } else if (kind === 'refunded') {
        refundedRows++
        if (settings.refundedTreatment === 'exclude') {
          excludedRows++
          continue
        }
      }
      if (eb.fromScope) branchFromScopeRows++
      records.push({
        ...r,
        branch: eb.branch,
        reportingBranch: rb,
        userConfirmed: d.source.kind === 'manual',
        datasetId: d.id,
        brandId: d.metadata.brandId,
        platformId: d.metadata.platformId,
        country: d.metadata.country,
        category: d.metadata.category,
        currencyCode: r.currency ?? (d.metadata.currency || 'UNSPECIFIED'),
      })
    }
  }

  return {
    records,
    undatedExcluded,
    branchFromScopeRows,
    status: {
      statusMapped,
      distinctStatuses: [...statuses].sort((a, b) => a.localeCompare(b)),
      cancelledRows,
      refundedRows,
      excludedRows,
    },
  }
}

/** Branch and channel values available under the current brand / platform / country filters. */
export function filterOptions(datasets: Dataset[], filters: Filters): { branches: string[]; channels: string[] } {
  const branches = new Set<string>()
  const channels = new Set<string>()
  for (const d of datasetsInScope(datasets, { ...filters, branch: 'all', channel: 'all' })) {
    for (const r of d.records) {
      const b = effectiveBranch(r.branch, d).branch
      if (b) branches.add(reportingBranch(d.metadata.brandId, b, filters.branchView))
      if (r.channel) channels.add(r.channel)
    }
  }
  const sort = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b))
  return { branches: sort(branches), channels: sort(channels) }
}

/** Every status value present in imported data, for the reporting-policy settings. */
export function allStatusValues(datasets: Dataset[]): string[] {
  const values = new Set<string>()
  for (const d of datasets) for (const r of d.records) if (r.status) values.add(r.status)
  return [...values].sort((a, b) => a.localeCompare(b))
}
