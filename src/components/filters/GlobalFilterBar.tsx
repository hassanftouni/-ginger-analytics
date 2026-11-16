import { RotateCcw } from 'lucide-react'
import { filterOptions } from '@/analytics'
import { Field, Select, TextInput } from '@/components/ui/FormControls'
import { ACTIVE_PLATFORMS, BRAND_LIST, COUNTRIES, getBrandSource } from '@/config/brands'
import { useDataStore } from '@/state/dataStore'
import { useFilters } from '@/state/filters'
import type { FilterKey, Filters } from '@/types/filters'

interface GlobalFilterBarProps {
  /** Values fixed by the current page (e.g. brand on a brand dashboard); those controls are hidden. */
  fixed?: Partial<Filters>
}

/** One row of filters shared by every analytics view. */
export function GlobalFilterBar({ fixed = {} }: GlobalFilterBarProps) {
  const { filters, setFilters, resetFilters } = useFilters()
  const { datasets } = useDataStore()
  const effective = { ...filters, ...fixed }
  const options = filterOptions(datasets, effective)
  const show = (key: FilterKey) => !(key in fixed)
  const set = <K extends FilterKey>(key: K, value: Filters[K]) => {
    const next = { ...filters, [key]: value }
    // Clear branch / channel selections that no longer exist under the new scope.
    if (key === 'brandId' || key === 'platformId' || key === 'country') {
      next.branch = 'all'
      next.channel = 'all'
    }
    setFilters(next)
  }

  const platforms = ACTIVE_PLATFORMS.filter((p) => effective.brandId === 'all' || getBrandSource(effective.brandId, p.id))
  const active = (Object.keys(filters) as FilterKey[]).some((k) => show(k) && k !== 'brandId' && k !== 'branchView' && filters[k] !== 'all' && filters[k] !== '')

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {show('brandId') && (
          <Field label="Brand" htmlFor="f-brand">
            <Select id="f-brand" value={filters.brandId} onChange={(e) => set('brandId', e.target.value as Filters['brandId'])}>
              <option value="all">Both brands (cross-brand)</option>
              {BRAND_LIST.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {show('platformId') && (
          <Field label="Platform" htmlFor="f-platform">
            <Select id="f-platform" value={filters.platformId} onChange={(e) => set('platformId', e.target.value as Filters['platformId'])}>
              <option value="all">All platforms</option>
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {show('country') && (
          <Field label="Country" htmlFor="f-country">
            <Select id="f-country" value={filters.country} onChange={(e) => set('country', e.target.value)}>
              <option value="all">All countries</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {show('branch') && (
          <Field label="Branch" htmlFor="f-branch">
            <Select id="f-branch" value={filters.branch} onChange={(e) => set('branch', e.target.value)} disabled={options.branches.length === 0}>
              <option value="all">{options.branches.length === 0 ? 'No branch data' : 'All branches'}</option>
              {options.branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {show('channel') && (
          <Field label="Sales channel" htmlFor="f-channel">
            <Select id="f-channel" value={filters.channel} onChange={(e) => set('channel', e.target.value)} disabled={options.channels.length === 0}>
              <option value="all">{options.channels.length === 0 ? 'No channel data' : 'All channels'}</option>
              {options.channels.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="From" htmlFor="f-from">
          <TextInput id="f-from" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set('from', e.target.value)} />
        </Field>
        <Field label="To" htmlFor="f-to">
          <TextInput id="f-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set('to', e.target.value)} />
        </Field>
      </div>
      {active && (
        <button type="button" onClick={resetFilters} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent-700 hover:underline">
          <RotateCcw className="size-3.5" aria-hidden="true" /> Reset filters
        </button>
      )}
    </div>
  )
}
