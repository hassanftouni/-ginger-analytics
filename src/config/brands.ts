/**
 * Brand / platform registry — the single source of truth for which data sources exist.
 * Only facts supplied in the project brief are recorded here (no export column names).
 * Adding a source means adding an entry here; pages and the analytics engine read from it.
 */
import type { ImportCategory } from './categories'

export type BrandId = 'ginger-and-co' | 'pertutti'

export type PlatformId = 'weevi' | 'toters' | 'foody' | 'table4' | 'plate'

export interface PlatformDefinition {
  id: PlatformId
  name: string
  description: string
  /** Planned platforms appear as "coming soon" and cannot receive imports. */
  status: 'active' | 'planned'
  /**
   * Reported in its own module (own import, storage, dashboard and Excel report) and never
   * combined with the other platforms' figures. Toters: config/toters.ts · Foody: config/foody.ts ·
   * Plate: config/plate.ts.
   */
  separate?: boolean
  /** Import categories this platform's exports can be tagged with. */
  categories: ImportCategory[]
}

/**
 * Sources analysed by the main (Weevi) analytics engine. Toters and Foody are deliberately not
 * listed: their revenue lives in separate modules and is never added to these sources.
 */
export interface BrandSource {
  platformId: PlatformId
  country: string
}

export interface BrandDefinition {
  id: BrandId
  name: string
  sources: BrandSource[]
  /** Independent branches. Not assumed to appear in any file. */
  branches: string[]
  /** Optional notes shown next to a branch name. */
  branchNotes?: Record<string, string>
  /**
   * Reporting-only groups. Members are never merged in stored data; a group is shown in place
   * of its members only when the user selects the combined branch view.
   */
  branchGroups?: BranchGroup[]
}

export interface BranchGroup {
  name: string
  members: string[]
  /** Label for the toggle, e.g. "Combine Hamra + Discount". */
  toggleLabel: string
}

export const PLATFORMS: Record<PlatformId, PlatformDefinition> = {
  weevi: {
    id: 'weevi',
    name: 'Weevi',
    description: 'Branches, delivery, pickup and other available channels',
    status: 'active',
    categories: ['sales-summary', 'customer-activity', 'products', 'customers', 'orders', 'branch-performance', 'ratings', 'delivery-pickup'],
  },
  toters: {
    id: 'toters',
    name: 'Toters',
    description: 'Delivery platform — reported separately in Toters analytics',
    status: 'active',
    separate: true,
    categories: [],
  },
  foody: {
    id: 'foody',
    name: 'Foody',
    description: 'Delivery platform (Cyprus, EUR) — reported separately in Foody analytics',
    status: 'active',
    separate: true,
    categories: [],
  },
  table4: { id: 'table4', name: 'Table 4', description: 'Reservation reports', status: 'planned', categories: [] },
  plate: {
    id: 'plate',
    name: 'Plate',
    description: 'Reservations — reported separately in Plate reservations (never combined with sales)',
    status: 'active',
    separate: true,
    categories: [],
  },
}

export const BRANDS: Record<BrandId, BrandDefinition> = {
  'ginger-and-co': {
    id: 'ginger-and-co',
    name: 'Ginger & Co',
    // Foody (Cyprus, EUR) is a separate module (config/foody.ts) and is not a source of this engine.
    sources: [{ platformId: 'weevi', country: 'Lebanon' }],
    branches: ['Hazmieh', 'Jal El Dib', 'Hamra', 'Discount'],
    branchNotes: { Discount: 'Hospital location in Hamra' },
    branchGroups: [{ name: 'Hamra + Discount', members: ['Hamra', 'Discount'], toggleLabel: 'Combine Hamra + Discount' }],
  },
  pertutti: {
    id: 'pertutti',
    name: 'Pertutti',
    sources: [{ platformId: 'weevi', country: 'Lebanon' }],
    branches: ['Hamra', 'Hazmieh'],
  },
}

export const BRAND_LIST: BrandDefinition[] = Object.values(BRANDS)
/** Platforms handled by the main analytics engine (separately reported platforms excluded). */
export const ACTIVE_PLATFORMS: PlatformDefinition[] = Object.values(PLATFORMS).filter((p) => p.status === 'active' && !p.separate)
export const PLANNED_PLATFORMS: PlatformDefinition[] = Object.values(PLATFORMS).filter((p) => p.status === 'planned')
export const COUNTRIES: string[] = [...new Set(BRAND_LIST.flatMap((b) => b.sources.map((s) => s.country)))]

export function getBrandSource(brandId: BrandId, platformId: PlatformId): BrandSource | undefined {
  return BRANDS[brandId].sources.find((s) => s.platformId === platformId)
}

/** Every configured brand × platform pair, used for coverage checks. */
export function allSources(): { brandId: BrandId; platformId: PlatformId; country: string }[] {
  return BRAND_LIST.flatMap((b) => b.sources.map((s) => ({ brandId: b.id, platformId: s.platformId, country: s.country })))
}

export type BranchView = 'separate' | 'combined'

/** The reporting branch for a source branch under the selected view. Source data is never changed. */
export function reportingBranch(brandId: BrandId, branch: string, view: BranchView): string {
  if (view !== 'combined') return branch
  const group = BRANDS[brandId].branchGroups?.find((g) => g.members.includes(branch))
  return group ? group.name : branch
}

/** Branches expected for a brand under the selected view (groups replace their members). */
export function expectedBranches(brandId: BrandId, view: BranchView): string[] {
  const seen = new Set<string>()
  for (const b of BRANDS[brandId].branches) seen.add(reportingBranch(brandId, b, view))
  return [...seen]
}

export function branchGroup(brandId: BrandId, name: string): BranchGroup | undefined {
  return BRANDS[brandId].branchGroups?.find((g) => g.name === name)
}
