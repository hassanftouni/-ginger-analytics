import { Upload } from 'lucide-react'
import { useMemo } from 'react'
import { FoodyHistoryPanel } from '@/components/foody/FoodyHistoryPanel'
import { foodyBranchColor } from '@/components/foody/colors'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { DataTable } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { FOODY_CURRENCY } from '@/config/foody'
import { FOODY_BRANCHES, computeFoodyAnalytics, metricsOf } from '@/foody/analytics'
import { DEFAULT_FOODY_FILTERS } from '@/foody/types'
import { hrefFor } from '@/hooks/useHashRoute'
import { useDataStore } from '@/state/dataStore'
import { useFoodyStore } from '@/state/foodyStore'
import { formatCount, formatMoney } from '@/utils/format'

/** Foody import history — separate from the Weevi and Toters histories. */
export function FoodyHistoryPage() {
  const { state } = useFoodyStore()
  const { persistDatasets } = useDataStore()
  const reconciliation = useMemo(() => computeFoodyAnalytics(state, DEFAULT_FOODY_FILTERS).reconciliation, [state])
  const excludedIds = new Set(state.imports.filter((i) => i.included === false).map((i) => i.id))

  const coverage = FOODY_BRANCHES.map((b) => {
    const orders = state.orders.filter((o) => o.storeId === b.storeId)
    const inAnalysis = orders.filter((o) => !excludedIds.has(o.importId))
    const dates = orders.map((o) => o.date).sort()
    return {
      branch: b,
      first: dates[0],
      last: dates[dates.length - 1],
      stored: orders.length,
      included: inAnalysis.length,
      net: metricsOf(inAnalysis).net,
      imports: state.imports.filter((i) => i.storeIds.includes(b.storeId)).length,
    }
  })

  return (
    <>
      <PageHeader
        title="Foody import history"
        description="Every Foody (Cyprus) import. Exclude an import to leave it out of Foody analytics and reports without deleting it. Weevi files are listed in Import history, Toters files in Toters import history."
        actions={
          <a href={hrefFor('/import')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            <Upload className="size-4" aria-hidden="true" /> Import Foody Excel
          </a>
        }
      />
      {!persistDatasets && (
        <Alert level="info" className="mb-6">
          Foody data is kept for this browser session only. To keep it between visits, turn on “Keep imported data on this device” in <a className="font-medium underline" href={hrefFor('/history')}>Import history</a> (one setting for Weevi, Toters and Foody).
        </Alert>
      )}

      <Panel title="Stored Foody orders by branch" description="One record per order ID — overlapping files never add an order twice · EUR" className="mb-6">
        <DataTable
          columns={[
            {
              key: 'b',
              header: 'Branch',
              render: (r) => (
                <span className="flex items-center gap-2 font-medium text-slate-800">
                  <span className="inline-block size-2.5 rounded-full" style={{ background: foodyBranchColor(r.branch) }} aria-hidden="true" />
                  {r.branch.label}
                  <span className="text-xs font-normal text-slate-500">store {r.branch.storeId}</span>
                </span>
              ),
            },
            { key: 'p', header: 'Order dates stored', render: (r) => (r.first ? `${r.first} → ${r.last}` : '—') },
            { key: 's', header: 'Orders stored', align: 'right', render: (r) => formatCount(r.stored) },
            { key: 'i', header: 'Orders in analysis', align: 'right', render: (r) => (r.included < r.stored ? <span className="font-medium text-amber-700">{formatCount(r.included)}</span> : formatCount(r.included)) },
            { key: 'n', header: 'Net sales in analysis', align: 'right', render: (r) => (r.included > 0 ? formatMoney(r.net, FOODY_CURRENCY) : '—') },
            { key: 'm', header: 'Imports', align: 'right', render: (r) => formatCount(r.imports) },
            {
              key: 'st',
              header: 'Status',
              render: (r) =>
                r.stored === 0 ? <Badge>No data</Badge> : r.included === 0 ? <Badge tone="warning">Excluded</Badge> : r.included < r.stored ? <Badge tone="warning">Partly excluded</Badge> : <Badge tone="success">In analysis</Badge>,
            },
          ]}
          rows={coverage}
          rowKey={(r) => r.branch.key}
          empty={null}
        />
      </Panel>

      <FoodyHistoryPanel allowClear reconciliation={reconciliation} />
    </>
  )
}
