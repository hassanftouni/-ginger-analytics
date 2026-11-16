import { RotateCcw } from 'lucide-react'
import { Field, Select, TextInput } from '@/components/ui/FormControls'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { BRANDS } from '@/config/brands'
import { useTotersStore } from '@/state/totersStore'
import { TOTERS_BRANDS, totersBranchOptions } from '@/toters/analytics'
import { DEFAULT_TOTERS_FILTERS, type TotersFilters, type TotersGrain } from '@/toters/types'

/** Toters filters: brand, branch (follows the brand), date range and granularity. Applies to every figure. */
export function TotersFilterBar() {
  const { filters, setFilters, resetFilters } = useTotersStore()
  const branches = totersBranchOptions(filters.brandId)
  const set = (patch: Partial<TotersFilters>) => {
    const next = { ...filters, ...patch }
    // A branch that does not belong to the new brand is cleared.
    if (patch.brandId !== undefined && !totersBranchOptions(next.brandId).some((b) => b.key === next.branch)) next.branch = 'all'
    setFilters(next)
  }
  const active = (Object.keys(DEFAULT_TOTERS_FILTERS) as (keyof TotersFilters)[]).some((k) => filters[k] !== DEFAULT_TOTERS_FILTERS[k])

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
        <Field label="Brand" htmlFor="t-brand">
          <Select id="t-brand" value={filters.brandId} onChange={(e) => set({ brandId: e.target.value as TotersFilters['brandId'] })}>
            <option value="all">All brands</option>
            {TOTERS_BRANDS.map((id) => (
              <option key={id} value={id}>
                {BRANDS[id].name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Branch" htmlFor="t-branch">
          <Select id="t-branch" value={filters.branch} onChange={(e) => set({ branch: e.target.value })}>
            <option value="all">All available branches</option>
            {branches.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From" htmlFor="t-from">
          <TextInput id="t-from" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} />
        </Field>
        <Field label="To" htmlFor="t-to">
          <TextInput id="t-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} />
        </Field>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-slate-700">View</span>
          <SegmentedControl<TotersGrain>
            label="Granularity"
            value={filters.grain}
            onChange={(grain) => set({ grain })}
            options={[
              { value: 'day', label: 'Daily' },
              { value: 'week', label: 'Weekly' },
              { value: 'month', label: 'Monthly' },
            ]}
          />
        </div>
      </div>
      {active && (
        <button type="button" onClick={resetFilters} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent-700 hover:underline">
          <RotateCcw className="size-3.5" aria-hidden="true" /> Reset filters
        </button>
      )}
    </div>
  )
}
