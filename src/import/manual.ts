import { BRANDS, PLATFORMS, getBrandSource, type BrandId, type PlatformId } from '@/config/brands'
import type { Dataset, Issue, NormalizedRecord } from '@/types/dataset'
import { fingerprintRecords } from '@/utils/hash'
import { findOverlaps } from './validation'

export interface ManualBranchRow {
  branch: string
  revenue: number | undefined
  orders: number | undefined
}

export interface ManualBranchInput {
  brandId: BrandId
  platformId: PlatformId
  currency: string
  periodStart: string
  periodEnd: string
  rows: ManualBranchRow[]
  note: string
}

/**
 * Validate user-confirmed branch figures. Each entry is tied to an explicit period and is
 * only ever used for that exact period — it is never extrapolated to another one.
 */
export function validateManualBranches(input: ManualBranchInput, existing: Dataset[]): Issue[] {
  const issues: Issue[] = []
  const known = BRANDS[input.brandId].branches
  if (!getBrandSource(input.brandId, input.platformId)) issues.push({ level: 'error', message: `${PLATFORMS[input.platformId].name} is not a source for ${BRANDS[input.brandId].name}.` })
  if (!input.periodStart || !input.periodEnd) issues.push({ level: 'error', message: 'Enter the exact reporting period these figures cover.' })
  else if (input.periodEnd < input.periodStart) issues.push({ level: 'error', message: 'The reporting period ends before it starts.' })
  if (!/^[A-Z]{3}$/.test(input.currency)) issues.push({ level: 'error', message: 'Enter a three-letter currency code.' })
  const rows = input.rows.filter((r) => r.branch)
  if (rows.length === 0) issues.push({ level: 'error', message: 'Add at least one branch.' })
  const seen = new Set<string>()
  for (const r of rows) {
    if (!known.includes(r.branch)) issues.push({ level: 'error', message: `“${r.branch}” is not a configured ${BRANDS[input.brandId].name} branch.` })
    if (seen.has(r.branch)) issues.push({ level: 'error', message: `${r.branch} is listed twice.` })
    seen.add(r.branch)
    if (r.revenue === undefined || !Number.isFinite(r.revenue) || r.revenue < 0) issues.push({ level: 'error', message: `Enter a revenue of 0 or more for ${r.branch}.` })
    if (r.orders === undefined || !Number.isInteger(r.orders) || r.orders < 0) issues.push({ level: 'error', message: `Enter a whole number of orders for ${r.branch}.` })
  }
  if (issues.length === 0) {
    const draft = buildManualBranchDataset(input, 'draft')
    const { overlapping } = findOverlaps({ ...draft, branches: new Set(rows.map((r) => r.branch)) }, existing)
    for (const d of overlapping) {
      const shared = rows.map((r) => r.branch).filter((b) => d.records.some((x) => x.branch === b))
      issues.push({ level: 'error', message: `Figures for ${shared.join(', ')} already exist for an overlapping period (“${d.source.fileName}”). Delete or exclude them in Import history first.` })
    }
  }
  return issues
}

export function buildManualBranchDataset(input: ManualBranchInput, id: string, now = Date.now()): Dataset {
  const records: NormalizedRecord[] = input.rows
    .filter((r) => r.branch)
    .map((r) => ({ branch: r.branch, revenue: r.revenue, orderCount: r.orders, currency: input.currency }))
  const fileName = `User-confirmed branch figures · ${records.map((r) => r.branch).join(', ')} · ${input.periodStart} to ${input.periodEnd}`
  return {
    id,
    metadata: {
      brandId: input.brandId,
      platformId: input.platformId,
      country: getBrandSource(input.brandId, input.platformId)?.country ?? '',
      category: 'branch-performance',
      currency: input.currency,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    },
    source: { fileName, fileSize: 0, lastModified: now, sheetName: 'Manual entry', headerRow: 0, kind: 'manual', note: input.note || 'User-confirmed; not backed by a branch export' },
    mapping: { branch: 'Branch', revenue: 'Revenue', orderCount: 'Orders' },
    parseOptions: { dateFormat: 'auto', decimalSeparator: '.' },
    records,
    stats: { sourceRows: records.length, importedRows: records.length, skippedRows: 0, invalidDates: 0, invalidNumbers: 0, duplicateOrderIdsInFile: 0, valueCurrencies: [] },
    fingerprint: fingerprintRecords([input.brandId, input.periodStart, input.periodEnd, ...records]),
    warnings: [{ level: 'warning', message: 'User-confirmed figures, not backed by a branch export.' }],
    included: true,
    importedAt: now,
  }
}
