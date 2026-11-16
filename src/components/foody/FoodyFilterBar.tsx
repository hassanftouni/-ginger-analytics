import { RotateCcw } from 'lucide-react'
import { Field, Select, TextInput } from '@/components/ui/FormControls'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { BRANDS } from '@/config/brands'
import { FOODY_BRANDS, foodyBranchOptions } from '@/foody/analytics'
import { DEFAULT_FOODY_FILTERS, type FoodyCompareMode, type FoodyFilters, type FoodyGrain } from '@/foody/types'
import { useFoodyStore } from '@/state/foodyStore'

const DAY = 86400000
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/**
 * Foody filters: brand, branch (follows the brand), date range, granularity and a comparison
 * period for campaign analysis. Applies to every Foody figure and the Foody Excel report.
 */
export function FoodyFilterBar({ latest }: { /** Last imported order date, for the quick ranges. */ latest?: string }) {
  const { filters, setFilters, resetFilters } = useFoodyStore()
  const branches = foodyBranchOptions(filters.brandId)
  const set = (patch: Partial<FoodyFilters>) => {
    const next = { ...filters, ...patch }
    if (patch.brandId !== undefined && !foodyBranchOptions(next.brandId).some((b) => b.key === next.branch)) next.branch = 'all'
    setFilters(next)
  }
  const active = (Object.keys(DEFAULT_FOODY_FILTERS) as (keyof FoodyFilters)[]).some((k) => filters[k] !== DEFAULT_FOODY_FILTERS[k])

  // Quick ranges end on the last imported order date, so they never run into days without data.
  const quick = latest
    ? [
        { label: 'Last 7 days', from: iso(Date.parse(`${latest}T00:00:00Z`) - 6 * DAY), to: latest },
        { label: 'Last 30 days', from: iso(Date.parse(`${latest}T00:00:00Z`) - 29 * DAY), to: latest },
        { label: 'Latest month', from: `${latest.slice(0, 7)}-01`, to: latest },
      ]
    : []

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
        <Field label="Brand" htmlFor="f-brand">
          <Select id="f-brand" value={filters.brandId} onChange={(e) => set({ brandId: e.target.value as FoodyFilters['brandId'] })}>
            <option value="all">All brands</option>
            {FOODY_BRANDS.map((id) => (
              <option key={id} value={id}>
                {BRANDS[id].name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Branch" htmlFor="f-branch">
          <Select id="f-branch" value={filters.branch} onChange={(e) => set({ branch: e.target.value })}>
            <option value="all">All Foody branches</option>
            {branches.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From" htmlFor="f-from">
          <TextInput id="f-from" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} />
        </Field>
        <Field label="To" htmlFor="f-to">
          <TextInput id="f-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} />
        </Field>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-slate-700">View</span>
          <SegmentedControl<FoodyGrain>
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

      <div className="mt-3 grid grid-cols-2 items-end gap-3 border-t border-slate-100 pt-3 md:grid-cols-4 xl:grid-cols-5">
        <Field label="Compare with" htmlFor="f-compare" className="col-span-2">
          <Select id="f-compare" value={filters.compare} onChange={(e) => set({ compare: e.target.value as FoodyCompareMode })}>
            <option value="previous">Previous period (same length)</option>
            <option value="custom">Custom comparison period</option>
            <option value="none">No comparison</option>
          </Select>
        </Field>
        {filters.compare === 'custom' && (
          <>
            <Field label="Comparison from" htmlFor="f-cfrom">
              <TextInput id="f-cfrom" type="date" value={filters.compareFrom} max={filters.compareTo || undefined} onChange={(e) => set({ compareFrom: e.target.value })} />
            </Field>
            <Field label="Comparison to" htmlFor="f-cto">
              <TextInput id="f-cto" type="date" value={filters.compareTo} min={filters.compareFrom || undefined} onChange={(e) => set({ compareTo: e.target.value })} />
            </Field>
          </>
        )}
        {quick.length > 0 && (
          <div className="col-span-2 flex flex-wrap gap-1.5 md:col-span-2">
            {quick.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => set({ from: q.from, to: q.to })}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                aria-pressed={filters.from === q.from && filters.to === q.to}
              >
                {q.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {active && (
        <button type="button" onClick={resetFilters} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent-700 hover:underline">
          <RotateCcw className="size-3.5" aria-hidden="true" /> Reset filters
        </button>
      )}
    </div>
  )
}
