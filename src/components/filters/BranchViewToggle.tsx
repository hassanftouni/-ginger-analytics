import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { BRAND_LIST, BRANDS, type BranchView } from '@/config/brands'
import { useFilters } from '@/state/filters'

/**
 * "Separate branches | Combine Hamra + Discount". Shown only when the selected brand defines a
 * reporting group. The choice applies to charts, tables, insights and the Excel export.
 */
export function BranchViewToggle() {
  const { filters, setFilters } = useFilters()
  const brands = filters.brandId === 'all' ? BRAND_LIST : [BRANDS[filters.brandId]]
  const groups = brands.flatMap((b) => b.branchGroups ?? [])
  if (groups.length === 0) return null
  return (
    <SegmentedControl<BranchView>
      label="Branch view"
      value={filters.branchView}
      onChange={(branchView) => setFilters({ ...filters, branchView, branch: 'all' })}
      options={[
        { value: 'separate', label: 'Separate branches' },
        { value: 'combined', label: groups.map((g) => g.toggleLabel).join(' · ') },
      ]}
    />
  )
}
