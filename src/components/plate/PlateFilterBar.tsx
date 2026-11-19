import { RotateCcw } from 'lucide-react'
import { Field, Select, TextInput } from '@/components/ui/FormControls'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { PLATE_LOCATION_INFO } from '@/plate/analytics'
import { DEFAULT_PLATE_FILTERS, type PlateCompareMode, type PlateFilters, type PlateGrain } from '@/plate/types'
import { usePlateStore } from '@/state/plateStore'

const DAY = 86400000
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Plate filters: location, reservation-date range, granularity and a comparison period. */
export function PlateFilterBar({ latest }: { /** Last imported reservation date, for the quick ranges. */ latest?: string }) {
  const { filters, setFilters, resetFilters } = usePlateStore()
  const set = (patch: Partial<PlateFilters>) => setFilters({ ...filters, ...patch })
  const active = (Object.keys(DEFAULT_PLATE_FILTERS) as (keyof PlateFilters)[]).some((k) => filters[k] !== DEFAULT_PLATE_FILTERS[k])
  const quick = latest
    ? [
        { label: 'Last 7 days', from: iso(Date.parse(`${latest}T00:00:00Z`) - 6 * DAY), to: latest },
        { label: 'Last 30 days', from: iso(Date.parse(`${latest}T00:00:00Z`) - 29 * DAY), to: latest },
        { label: 'Latest month', from: `${latest.slice(0, 7)}-01`, to: latest },
      ]
    : []

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Location" htmlFor="p-loc" className="col-span-2 md:col-span-1">
          <Select id="p-loc" value={filters.location} onChange={(e) => set({ location: e.target.value })}>
            <option value="all">All Plate locations</option>
            {PLATE_LOCATION_INFO.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reservation date from" htmlFor="p-from">
          <TextInput id="p-from" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} />
        </Field>
        <Field label="Reservation date to" htmlFor="p-to">
          <TextInput id="p-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} />
        </Field>
        <div className="col-span-2 md:col-span-1">
          <span className="mb-1.5 block text-xs font-medium text-slate-700">View</span>
          <SegmentedControl<PlateGrain>
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
      <div className="mt-3 grid grid-cols-2 items-end gap-3 border-t border-slate-100 pt-3 md:grid-cols-4">
        <Field label="Compare with" htmlFor="p-compare" className="col-span-2 md:col-span-1">
          <Select id="p-compare" value={filters.compare} onChange={(e) => set({ compare: e.target.value as PlateCompareMode })}>
            <option value="previous">Previous period (same length)</option>
            <option value="custom">Custom comparison period</option>
            <option value="none">No comparison</option>
          </Select>
        </Field>
        {filters.compare === 'custom' && (
          <>
            <Field label="Comparison from" htmlFor="p-cfrom">
              <TextInput id="p-cfrom" type="date" value={filters.compareFrom} max={filters.compareTo || undefined} onChange={(e) => set({ compareFrom: e.target.value })} />
            </Field>
            <Field label="Comparison to" htmlFor="p-cto">
              <TextInput id="p-cto" type="date" value={filters.compareTo} min={filters.compareFrom || undefined} onChange={(e) => set({ compareTo: e.target.value })} />
            </Field>
          </>
        )}
        {quick.length > 0 && (
          <div className="col-span-2 flex flex-wrap gap-1.5 md:col-span-1">
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
