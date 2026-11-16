import type { BrandId, PlatformId } from '@/config/brands'
import type { ImportCategory, StandardField } from '@/config/categories'
import type { ExportFormatId } from '@/config/exportFormats'

/** Source column header chosen for each standardized field. */
export type ColumnMapping = Partial<Record<StandardField, string>>

export type DateFormat = 'auto' | 'dmy' | 'mdy' | 'ymd'
export type DecimalSeparator = '.' | ','

export interface ParseOptions {
  dateFormat: DateFormat
  decimalSeparator: DecimalSeparator
}

/**
 * Which branches a file covers when it has no branch column. "all" = all selected branches
 * combined. A single listed branch lets its rows be attributed to that branch (user-declared);
 * several listed branches are never split.
 */
export interface BranchScope {
  mode: 'all' | 'selected'
  branches: string[]
}

export interface DatasetMetadata {
  /** Verified export format, when detected. */
  formatId?: ExportFormatId
  brandId: BrandId
  platformId: PlatformId
  country: string
  category: ImportCategory
  /** File-level currency code; a mapped currency column overrides it per row. */
  currency: string
  /** Optional reporting period; required when no date column is mapped. ISO yyyy-mm-dd. */
  periodStart: string
  periodEnd: string
  /** Required when the file has no branch column. */
  branchScope?: BranchScope
}

/** One row after mapping — only standardized fields are kept, never the raw row. */
export interface NormalizedRecord {
  orderId?: string
  date?: string
  branch?: string
  channel?: string
  status?: string
  revenue?: number
  orderCount?: number
  currency?: string
  productName?: string
  productCategory?: string
  quantity?: number
  rating?: number
  comment?: string
  customerId?: string
  customerName?: string
  productId?: string
  averageOrderValue?: number
  newRegistrations?: number
  newCustomers?: number
  returningCustomers?: number
}

export type IssueLevel = 'error' | 'warning' | 'info'

export interface Issue {
  level: IssueLevel
  message: string
}

export interface NormalizationStats {
  sourceRows: number
  importedRows: number
  skippedRows: number
  invalidDates: number
  invalidNumbers: number
  duplicateOrderIdsInFile: number
  minDate?: string
  maxDate?: string
  /** Currency codes found inside monetary values (e.g. "USD 2,209"). */
  valueCurrencies: string[]
}

export interface Dataset {
  id: string
  metadata: DatasetMetadata
  source: {
    fileName: string
    fileSize: number
    lastModified: number
    sheetName: string
    headerRow: number
    /** "manual" = figures entered and confirmed by a user, not read from an export. */
    kind?: 'file' | 'manual'
    note?: string
  }
  mapping: ColumnMapping
  parseOptions: ParseOptions
  records: NormalizedRecord[]
  stats: NormalizationStats
  warnings: Issue[]
  /** Content fingerprint of the normalized records. */
  fingerprint: string
  /** Excluded datasets are kept but ignored by analytics (e.g. overlapping exports). */
  included: boolean
  exclusionReason?: string
  importedAt: number
}

/** A saved column mapping for one platform + category. */
export interface MappingTemplate {
  id: string
  platformId: PlatformId
  category: ImportCategory
  name: string
  headerRow: number
  mapping: ColumnMapping
  parseOptions: ParseOptions
  updatedAt: number
}
