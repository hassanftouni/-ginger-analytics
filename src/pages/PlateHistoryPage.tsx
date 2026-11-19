import { Upload } from 'lucide-react'
import { useMemo } from 'react'
import { PlateHistoryPanel } from '@/components/plate/PlateHistoryPanel'
import { plateLocationColor } from '@/components/plate/colors'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { DataTable } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { PLATE_LOCATION_INFO, computePlateAnalytics, metricsOf } from '@/plate/analytics'
import { DEFAULT_PLATE_FILTERS } from '@/plate/types'
import { hrefFor } from '@/hooks/useHashRoute'
import { useDataStore } from '@/state/dataStore'
import { usePlateStore } from '@/state/plateStore'
import { formatCount } from '@/utils/format'

/** Plate import history — separate from the Weevi, Toters and Foody histories. */
export function PlateHistoryPage() {
  const { state } = usePlateStore()
  const { persistDatasets } = useDataStore()
  const reconciliation = useMemo(() => computePlateAnalytics(state, DEFAULT_PLATE_FILTERS).reconciliation, [state])
  const excludedIds = new Set(state.imports.filter((i) => i.included === false).map((i) => i.id))

  const coverage = PLATE_LOCATION_INFO.map((l) => {
    const own = state.bookings.filter((b) => b.locationId === l.id)
    const inAnalysis = own.filter((b) => !excludedIds.has(b.importId))
    const periods = state.imports.filter((i) => i.locationId === l.id && i.included !== false).map((i) => [i.periodStart, i.periodEnd]).sort()
    const m = metricsOf(inAnalysis)
    return {
      location: l,
      first: periods[0]?.[0],
      last: periods.length > 0 ? periods.map((p) => p[1]).sort().slice(-1)[0] : undefined,
      stored: own.length,
      included: inAnalysis.length,
      covers: m.covers,
      imports: state.imports.filter((i) => i.locationId === l.id).length,
    }
  })

  return (
    <>
      <PageHeader
        title="Plate import history"
        description="Every Plate reservations import. Exclude an import to leave it out of Plate analytics and reports without deleting it."
        actions={
          <a href={hrefFor('/import')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            <Upload className="size-4" aria-hidden="true" /> Import Plate CSV
          </a>
        }
      />
      {!persistDatasets && (
        <Alert level="info" className="mb-6">
          Plate data is kept for this browser session only. To keep it between visits, turn on “Keep imported data on this device” in <a className="font-medium underline" href={hrefFor('/history')}>Import history</a> (one setting for every source).
        </Alert>
      )}
      <Panel title="Stored Plate reservations by location" description="One record per Booking ID — overlapping files never add a booking twice" className="mb-6">
        <DataTable
          columns={[
            {
              key: 'l',
              header: 'Location',
              render: (r) => (
                <span className="flex items-center gap-2 font-medium text-slate-800">
                  <span className="inline-block size-2.5 rounded-full" style={{ background: plateLocationColor(r.location) }} aria-hidden="true" />
                  {r.location.label}
                </span>
              ),
            },
            { key: 'p', header: 'Periods covered', render: (r) => (r.first ? `${r.first} → ${r.last}` : '—') },
            { key: 's', header: 'Bookings stored', align: 'right', render: (r) => formatCount(r.stored) },
            { key: 'i', header: 'In analysis', align: 'right', render: (r) => (r.included < r.stored ? <span className="font-medium text-amber-700">{formatCount(r.included)}</span> : formatCount(r.included)) },
            { key: 'c', header: 'Guests in analysis', align: 'right', render: (r) => (r.included > 0 ? formatCount(r.covers) : '—') },
            { key: 'm', header: 'Imports', align: 'right', render: (r) => formatCount(r.imports) },
            {
              key: 'st',
              header: 'Status',
              render: (r) =>
                r.imports === 0 ? <Badge>No data</Badge> : r.included === 0 && r.stored > 0 ? <Badge tone="warning">Excluded</Badge> : r.included < r.stored ? <Badge tone="warning">Partly excluded</Badge> : <Badge tone="success">In analysis</Badge>,
            },
          ]}
          rows={coverage}
          rowKey={(r) => r.location.id}
          empty={null}
        />
      </Panel>
      <PlateHistoryPanel allowClear reconciliation={reconciliation} />
    </>
  )
}
