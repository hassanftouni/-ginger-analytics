import { BRANDS, PLATFORMS } from '@/config/brands'
import type { OrderBasis } from '@/types/analytics'
import type { Filters } from '@/types/filters'

export function describeFilters(f: Filters): string {
  const parts = [
    f.brandId === 'all' ? 'Both brands (cross-brand)' : BRANDS[f.brandId].name,
    f.platformId === 'all' ? 'All platforms' : PLATFORMS[f.platformId].name,
  ]
  if (f.country !== 'all') parts.push(f.country)
  if (f.branch !== 'all') parts.push(`Branch: ${f.branch}`)
  if (f.channel !== 'all') parts.push(`Channel: ${f.channel}`)
  if (f.branchView === 'combined') parts.push('Branch view: reporting groups combined')
  return parts.join(' · ')
}

export function describeOrderBasis(basis: OrderBasis): string {
  switch (basis) {
    case 'unique-ids':
      return 'Orders counted as unique Order IDs'
    case 'rows':
      return 'Orders counted as rows (no Order ID mapped)'
    case 'reported':
      return 'Orders as reported in summary exports'
    case 'mixed':
      return 'Orders from a mix of unique IDs, rows and reported counts'
    case 'none':
      return 'No order counts available'
  }
}
