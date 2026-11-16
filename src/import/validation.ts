import { BRANDS, PLATFORMS, getBrandSource } from '@/config/brands'
import { CATEGORIES, FIELDS, categoryHasMoney } from '@/config/categories'
import type { ColumnMapping, Dataset, DatasetMetadata, Issue, NormalizationStats } from '@/types/dataset'
import { formatCount } from '@/utils/format'

export type MetadataDraft = Partial<DatasetMetadata>

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((i) => i.level === 'error')
}

/** Checks the brand / platform / category / currency / period chosen for a file. */
export function validateMetadata(meta: MetadataDraft, mapping: ColumnMapping): Issue[] {
  const issues: Issue[] = []
  if (!meta.brandId) issues.push({ level: 'error', message: 'Select a brand.' })
  if (!meta.platformId) issues.push({ level: 'error', message: 'Select a platform.' })
  if (meta.brandId && meta.platformId && !getBrandSource(meta.brandId, meta.platformId)) {
    issues.push({ level: 'error', message: `${PLATFORMS[meta.platformId].name} is not a source for ${BRANDS[meta.brandId].name}.` })
  }
  if (!meta.country?.trim()) issues.push({ level: 'error', message: 'Select the country.' })
  if (!meta.category) {
    issues.push({ level: 'error', message: 'Select a report type.' })
  } else if (meta.platformId && !PLATFORMS[meta.platformId].categories.includes(meta.category)) {
    issues.push({ level: 'error', message: `${CATEGORIES[meta.category].name} is not a supported report type for ${PLATFORMS[meta.platformId].name}.` })
  }

  if (meta.category && categoryHasMoney(meta.category) && mapping.revenue && !mapping.currency && !meta.currency?.trim()) {
    issues.push({ level: 'error', message: 'Enter the currency of this file, or map a currency column. Currencies are never assumed.' })
  }
  if (meta.currency && !/^[A-Z]{3}$/.test(meta.currency)) {
    issues.push({ level: 'error', message: 'Currency must be a three-letter code.' })
  }

  const hasPeriod = Boolean(meta.periodStart && meta.periodEnd)
  if (!mapping.date && !hasPeriod) {
    issues.push({ level: 'error', message: 'No date column is mapped, so enter the reporting period this file covers.' })
  }
  if ((meta.periodStart && !meta.periodEnd) || (!meta.periodStart && meta.periodEnd)) {
    issues.push({ level: 'error', message: 'Enter both the start and end of the reporting period.' })
  }
  if (hasPeriod && (meta.periodEnd as string) < (meta.periodStart as string)) {
    issues.push({ level: 'error', message: 'The reporting period ends before it starts.' })
  }
  return issues
}

/** Checks that required standardized fields are mapped to columns that exist. */
export function validateMapping(meta: MetadataDraft, mapping: ColumnMapping, headers: string[]): Issue[] {
  if (!meta.category) return []
  const issues: Issue[] = []
  const headerSet = new Set(headers)
  for (const rule of CATEGORIES[meta.category].fields) {
    const header = mapping[rule.field]
    if (!header) {
      if (rule.required) issues.push({ level: 'error', message: `Map a column to the required field “${FIELDS[rule.field].label}”.` })
    } else if (!headerSet.has(header)) {
      issues.push({ level: 'error', message: `“${FIELDS[rule.field].label}” is mapped to “${header}”, which is not in this file.` })
    }
  }
  const used = new Map<string, string[]>()
  for (const [field, header] of Object.entries(mapping)) {
    if (!header) continue
    used.set(header, [...(used.get(header) ?? []), FIELDS[field as keyof typeof FIELDS].label])
  }
  for (const [header, fields] of used) {
    if (fields.length > 1) issues.push({ level: 'warning', message: `Column “${header}” is mapped to several fields: ${fields.join(', ')}.` })
  }
  if (meta.category === 'orders' && !mapping.orderId) {
    issues.push({
      level: 'info',
      message: 'No Order ID mapped: orders will be counted as rows, and duplicates across overlapping files cannot be detected.',
    })
  }
  return issues
}

/** Currency checks once values are parsed: mismatches between the selected currency and the values. */
export function validateCurrency(meta: MetadataDraft, mapping: ColumnMapping, stats: NormalizationStats): Issue[] {
  const issues: Issue[] = []
  const found = stats.valueCurrencies
  if (found.length > 1) {
    issues.push({ level: 'warning', message: `Amounts use several currencies (${found.join(', ')}). They will be reported separately.` })
  }
  if (meta.currency && found.length > 0 && !mapping.currency && !found.includes(meta.currency)) {
    issues.push({
      level: 'error',
      message: `Currency mismatch: the amounts in this file are in ${found.join(', ')}, but ${meta.currency} is selected. Correct the file currency.`,
    })
  }
  return issues
}

/** Branch scope is required when the file has no branch column. */
export function validateBranchScope(meta: MetadataDraft, mapping: ColumnMapping): Issue[] {
  if (mapping.branch || !meta.category) return []
  const scope = meta.branchScope
  if (!scope) {
    return [{ level: 'error', message: 'This file has no branch column. Choose the branch scope: all selected branches, or the specific branches it covers.' }]
  }
  if (scope.mode === 'selected' && scope.branches.length === 0) {
    return [{ level: 'error', message: 'Select at least one branch, or choose “All selected branches”.' }]
  }
  const issues: Issue[] = []
  if (scope.mode === 'selected' && scope.branches.length > 1) {
    issues.push({ level: 'info', message: `Branch scope: ${scope.branches.join(', ')} combined. Results are not split by branch.` })
  }
  if (scope.mode === 'all' && meta.brandId) {
    const known = BRANDS[meta.brandId].branches
    issues.push({ level: 'info', message: `Branch scope: all selected branches${known.length ? ` (${known.join(', ')})` : ''} combined. No branch-level results are produced from this file.` })
  }
  return issues
}

/** Summarises parsing problems found when applying the mapping. */
export function assessNormalization(stats: NormalizationStats): Issue[] {
  const issues: Issue[] = []
  if (stats.sourceRows === 0) {
    issues.push({ level: 'error', message: 'There are no data rows below the header row.' })
    return issues
  }
  if (stats.importedRows === 0) {
    issues.push({ level: 'error', message: 'No rows could be imported — check the header row, the mapping and the date / number formats.' })
  }
  if (stats.skippedRows > 0) {
    issues.push({ level: 'warning', message: `${formatCount(stats.skippedRows)} of ${formatCount(stats.sourceRows)} rows will be skipped because a required value is missing or invalid.` })
  }
  if (stats.invalidDates > 0) {
    issues.push({ level: 'warning', message: `${formatCount(stats.invalidDates)} date value(s) could not be read. If dates look like 03/04/2026, choose the date format explicitly.` })
  }
  if (stats.invalidNumbers > 0) {
    issues.push({ level: 'warning', message: `${formatCount(stats.invalidNumbers)} numeric value(s) could not be read. Check the decimal separator.` })
  }
  if (stats.duplicateOrderIdsInFile > 0) {
    issues.push({
      level: 'warning',
      message: `${formatCount(stats.duplicateOrderIdsInFile)} row(s) repeat an Order ID already seen in this file. Unique orders and row counts will differ.`,
    })
  }
  return issues
}

/** Effective date coverage of a dataset: mapped dates if present, otherwise the declared period. */
export function datasetPeriod(meta: Pick<DatasetMetadata, 'periodStart' | 'periodEnd'>, stats: Pick<NormalizationStats, 'minDate' | 'maxDate'>) {
  return {
    start: stats.minDate ?? meta.periodStart,
    end: stats.maxDate ?? meta.periodEnd,
  }
}

/** Branch values present in a dataset's rows. */
export function branchesInRecords(d: Pick<Dataset, 'records'>): Set<string> {
  return new Set(d.records.map((r) => r.branch).filter((b): b is string => Boolean(b)))
}

/**
 * Branches a file covers: its branch column values, otherwise its declared branch scope.
 * "all" means every branch combined (or unknown), which conflicts with any branch.
 */
export function coveredBranches(meta: Pick<DatasetMetadata, 'branchScope'>, rowBranches: Set<string> | undefined): Set<string> | 'all' {
  if (rowBranches && rowBranches.size > 0) return rowBranches
  const scope = meta.branchScope
  if (scope?.mode === 'selected' && scope.branches.length > 0) return new Set(scope.branches)
  return 'all'
}

export function branchesConflict(a: Set<string> | 'all', b: Set<string> | 'all'): boolean {
  if (a === 'all' || b === 'all') return true
  return [...a].some((x) => b.has(x))
}

export interface OverlapResult {
  sameFile: Dataset | undefined
  /** Same brand and identical cleaned content under a different file name. */
  sameContent: Dataset | undefined
  overlapping: Dataset[]
}

/** Finds an identical earlier upload, and included datasets of the same source and type whose periods overlap. */
export function findOverlaps(
  candidate: {
    metadata: DatasetMetadata
    stats: NormalizationStats
    fingerprint: string
    source: { fileName: string; fileSize: number; lastModified: number; sheetName: string }
    /** Branches in the candidate (for branch-performance overlap checks). */
    branches?: Set<string>
  },
  existing: Dataset[],
): OverlapResult {
  const period = datasetPeriod(candidate.metadata, candidate.stats)
  const sameFile = existing.find(
    (d) =>
      d.source.fileName === candidate.source.fileName &&
      d.source.fileSize === candidate.source.fileSize &&
      d.source.lastModified === candidate.source.lastModified &&
      d.source.sheetName === candidate.source.sheetName,
  )
  const sameContent = sameFile
    ? undefined
    : existing.find((d) => d.fingerprint === candidate.fingerprint && d.metadata.brandId === candidate.metadata.brandId && d.metadata.category === candidate.metadata.category)
  const overlapping = existing.filter((d) => {
    if (!d.included) return false
    const m = d.metadata
    if (m.brandId !== candidate.metadata.brandId || m.platformId !== candidate.metadata.platformId) return false
    if (m.category !== candidate.metadata.category || m.country !== candidate.metadata.country) return false
    // Files for different branches (e.g. one daily-sales export per branch) do not overlap.
    if (!branchesConflict(coveredBranches(candidate.metadata, candidate.branches), coveredBranches(m, branchesInRecords(d)))) return false
    const p = datasetPeriod(m, d.stats)
    if (!period.start || !period.end || !p.start || !p.end) return true // unknown coverage — treat as overlapping
    return period.start <= p.end && p.start <= period.end
  })
  return { sameFile, sameContent, overlapping }
}

/**
 * Overlapping exports are only safe to keep together when orders can be de-duplicated by
 * Order ID. Otherwise the newer file is excluded by default to avoid double counting.
 */
export function shouldExcludeOnOverlap(category: DatasetMetadata['category'], mapping: ColumnMapping, overlapping: Dataset[]): boolean {
  if (overlapping.length === 0) return false
  if (category === 'orders' && mapping.orderId && overlapping.every((d) => d.mapping.orderId)) return false
  return true
}
