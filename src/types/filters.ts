import type { BranchView, BrandId, PlatformId } from '@/config/brands'

/** Global filter selection. 'all' / empty string means "no restriction". */
export interface Filters {
  brandId: BrandId | 'all'
  platformId: PlatformId | 'all'
  country: string | 'all'
  branch: string | 'all'
  channel: string | 'all'
  from: string
  to: string
  /** Separate branches, or reporting groups (e.g. Hamra + Discount) shown in place of their members. */
  branchView: BranchView
}

/** Brands are never combined by default: "all" is an explicit cross-brand selection. */
export const DEFAULT_FILTERS: Filters = {
  brandId: 'ginger-and-co',
  platformId: 'all',
  country: 'all',
  branch: 'all',
  channel: 'all',
  from: '',
  to: '',
  branchView: 'separate',
}

export type FilterKey = keyof Filters
