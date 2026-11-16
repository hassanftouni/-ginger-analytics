import type { BrandId, PlatformId } from '@/config/brands'
import type { ImportCategory } from '@/config/categories'
import type { Dataset, NormalizedRecord } from './dataset'
import type { Filters } from './filters'

/** A record joined with its dataset's context, after filters and the status policy are applied. */
export interface ScopedRecord extends NormalizedRecord {
  datasetId: string
  brandId: BrandId
  platformId: PlatformId
  country: string
  category: ImportCategory
  /** Row currency, falling back to the file currency. */
  currencyCode: string
  /** Branch under the selected branch view (a reporting group replaces its members). */
  reportingBranch?: string
  /** From a user-confirmed manual entry rather than an export. */
  userConfirmed: boolean
}

/** One revenue/order fact used for totals, after source precedence and de-duplication. */
export interface SalesFact extends ScopedRecord {
  /** Orders this fact represents: 1 for an order row, the reported count for summaries, undefined if unknown. */
  orders: number | undefined
}

export type OrderBasis = 'unique-ids' | 'rows' | 'reported' | 'mixed' | 'none'

export interface CurrencyTotals {
  currency: string
  revenue: number
  orders: number | undefined
  /** Only calculated when every fact in this currency has a known order count. */
  averageOrderValue: number | undefined
}

export interface Totals {
  byCurrency: CurrencyTotals[]
  orders: number | undefined
  orderBasis: OrderBasis
  /** Rows contributing to totals (before order de-duplication). */
  rowCount: number
  duplicateOrdersRemoved: number
  converted?: { currency: string; revenue: number; note: string }
}

export interface PeriodComparison {
  current: { start: string; end: string }
  previous: { start: string; end: string }
  revenue: { currency: string; current: number; previous: number; change: number | undefined }[]
  orders: { current: number | undefined; previous: number | undefined; change: number | undefined }
  /** False when there is no data at all in the previous period. */
  hasPreviousData: boolean
}

export interface DailyPoint {
  date: string
  currency: string
  revenue: number
  orders: number | undefined
}

export interface GroupRow {
  key: string
  label: string
  currency: string
  revenue: number
  orders: number | undefined
  averageOrderValue: number | undefined
  /** Share of revenue within the same currency, 0–1. */
  share: number
  /** Branch rows: whether data covers the whole analysed period (all members, for groups). */
  status?: 'complete' | 'incomplete'
  notes?: string[]
  userConfirmed?: boolean
  /** Source branches behind a reporting group. */
  members?: string[]
}

export interface GroupBreakdown {
  rows: GroupRow[]
  /** Where the figures come from, e.g. "Orders exports" or "Branch performance exports". */
  basis: string
  /** Expected branches with no data in the analysed period (branch breakdown only). */
  missing?: { label: string; reason: string }[]
  /** Period the branch figures were checked against. */
  checkedRange?: { start: string; end: string } | null
}

export interface ProductRow {
  productId?: string
  product: string
  category?: string
  quantity: number
  revenueByCurrency: Record<string, number>
  /** Share of product revenue within each currency, 0–1. */
  revenueShareByCurrency: Record<string, number>
  /** Share of all units sold, 0–1. */
  quantityShare: number
}

export interface PeriodRow {
  key: string
  start: string
  end: string
  currency: string
  /** Days with data in this bucket. */
  days: number
  revenue: number
  orders: number | undefined
  averageOrderValue: number | undefined
  revenueChange: number | undefined
  ordersChange: number | undefined
  /** The bucket extends beyond the analysed date range, so it is incomplete. */
  partial: boolean
}

export interface SalesExtremes {
  currency: string
  highest: DailyPoint
  lowest: DailyPoint
  days: number
}

export interface ActivityPoint {
  date: string
  newRegistrations?: number
  newCustomers?: number
  returningCustomers?: number
}

export interface CustomerActivity {
  daily: ActivityPoint[]
  totals: { newRegistrations?: number; newCustomers?: number; returningCustomerDays?: number }
  range: { start: string; end: string } | null
}

export interface CustomerRow {
  anonId: string
  /** Personal data — only shown when the user explicitly reveals names. */
  name?: string
  currency: string
  spend: number
  orders: number | undefined
  /** Spend ÷ orders, calculated. */
  averageOrderValue: number | undefined
  /** Average as printed in the export (may be rounded). */
  exportedAverage: number | undefined
}

export interface Bucket {
  label: string
  count: number
}

export interface CustomerInsights {
  rows: CustomerRow[]
  count: number
  spendByCurrency: Record<string, number>
  totalOrders: number | undefined
  spendDistribution: { currency: string; buckets: Bucket[] }[]
  frequencyDistribution: Bucket[]
}

export interface ReconciliationItem {
  brandId: BrandId
  currency: string
  source: 'Products' | 'Customers'
  fileName: string
  period: string
  salesPeriod: string
  salesRevenue: number
  otherAmount: number
  difference: number
  /** otherAmount / salesRevenue − 1 */
  ratio: number | undefined
  salesOrders?: number
  otherOrders?: number
  periodsMatch: boolean
}

export interface RatingSummary {
  count: number
  average: number | undefined
  distribution: { rating: number; count: number }[]
  byBranch: { branch: string; average: number; count: number }[]
  byPlatform: { platformId: PlatformId; brandId: BrandId; average: number; count: number }[]
  comments: { date?: string; branch?: string; rating: number; comment: string }[]
}

export type InsightTone = 'positive' | 'negative' | 'neutral' | 'warning'

export interface Insight {
  id: string
  tone: InsightTone
  title: string
  detail: string
}

export interface QualityItem {
  level: 'error' | 'warning' | 'info'
  message: string
}

export interface StatusSummary {
  statusMapped: boolean
  distinctStatuses: string[]
  cancelledRows: number
  refundedRows: number
  excludedRows: number
}

export interface AnalyticsResult {
  filters: Filters
  datasetsInScope: Dataset[]
  dateRange: { start: string; end: string } | null
  hasSales: boolean
  totals: Totals
  comparison: PeriodComparison | null
  daily: DailyPoint[]
  branches: GroupBreakdown
  platforms: GroupBreakdown
  channels: GroupBreakdown
  products: ProductRow[]
  ratings: RatingSummary
  uniqueCustomers: number | undefined
  weekly: PeriodRow[]
  monthly: PeriodRow[]
  extremes: SalesExtremes[]
  customerActivity: CustomerActivity
  customers: CustomerInsights
  reconciliation: ReconciliationItem[]
  /** Rows attributed to a branch from a single-branch import scope (not from a branch column). */
  branchFromScopeRows: number
  status: StatusSummary
  insights: Insight[]
  quality: QualityItem[]
  /** All in-scope records after filters and policy, for the Cleaned Data export. */
  records: ScopedRecord[]
  /** Categories that supplied totals for each source, e.g. "Ginger & Co · Weevi → Orders". */
  sourceBasis: { brandId: BrandId; platformId: PlatformId; country: string; category: ImportCategory; datasets: number }[]
}
