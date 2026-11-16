import { Upload } from 'lucide-react'
import { TotersHistoryPanel } from '@/components/toters/TotersHistoryPanel'
import { branchColor } from '@/components/toters/colors'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { DataTable } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { TOTERS_CONVERSION } from '@/config/toters'
import { hrefFor } from '@/hooks/useHashRoute'
import { useDataStore } from '@/state/dataStore'
import { useTotersStore } from '@/state/totersStore'
import { TOTERS_BRANCHES } from '@/toters/analytics'
import { formatCount, formatMoney } from '@/utils/format'

/** Toters import history — separate from the Weevi and Foody histories. */
export function TotersHistoryPage() {
  const { state } = useTotersStore()
  const { persistDatasets } = useDataStore()
  const excludedIds = new Set(state.imports.filter((i) => i.included === false).map((i) => i.id))

  // Stored coverage per branch: what is in the Toters store, and how much of it is in analysis.
  const coverage = TOTERS_BRANCHES.map((b) => {
    const days = state.days.filter((d) => d.storeId === b.storeId)
    const inAnalysis = days.filter((d) => !excludedIds.has(d.importId))
    const dates = days.map((d) => d.date).sort()
    return {
      branch: b,
      first: dates[0],
      last: dates[dates.length - 1],
      stored: days.length,
      included: inAnalysis.length,
      revenueUsd: inAnalysis.reduce((a, d) => a + d.revenueUsd, 0),
      imports: state.imports.filter((i) => i.storeId === b.storeId).length,
    }
  })

  return (
    <>
      <PageHeader
        title="Toters import history"
        description="Every Toters import, per branch. Exclude an import to leave it out of Toters analytics and reports without deleting it. Weevi files are listed in Import history, Foody files in Foody import history."
        actions={
          <a href={hrefFor('/import')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            <Upload className="size-4" aria-hidden="true" /> Import Toters CSV
          </a>
        }
      />
      {!persistDatasets && (
        <Alert level="info" className="mb-6">
          Toters data is kept for this browser session only. To keep it between visits, turn on “Keep imported data on this device” in <a className="font-medium underline" href={hrefFor('/history')}>Import history</a> (one setting for Weevi and Toters).
        </Alert>
      )}

      <Panel title="Stored Toters data by branch" description={`Conversion for every import: ${TOTERS_CONVERSION.formula}`} className="mb-6">
        <DataTable
          columns={[
            {
              key: 'b',
              header: 'Branch',
              render: (r) => (
                <span className="flex items-center gap-2 font-medium text-slate-800">
                  <span className="inline-block size-2.5 rounded-full" style={{ background: branchColor(r.branch) }} aria-hidden="true" />
                  {r.branch.label}
                  <span className="text-xs font-normal text-slate-500">store {r.branch.storeId}</span>
                </span>
              ),
            },
            { key: 'p', header: 'Dates stored', render: (r) => (r.first ? `${r.first} → ${r.last}` : '—') },
            { key: 's', header: 'Days stored', align: 'right', render: (r) => formatCount(r.stored) },
            {
              key: 'i',
              header: 'Days in analysis',
              align: 'right',
              render: (r) => (r.included < r.stored ? <span className="font-medium text-amber-700">{formatCount(r.included)}</span> : formatCount(r.included)),
            },
            { key: 'u', header: 'Revenue in analysis (USD)', align: 'right', render: (r) => (r.included > 0 ? formatMoney(r.revenueUsd, 'USD') : '—') },
            { key: 'n', header: 'Imports', align: 'right', render: (r) => formatCount(r.imports) },
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
        <p className="mt-2 text-xs text-slate-500">Ginger &amp; Co Hazmieh and Discount have no Toters channel and are never imported.</p>
      </Panel>

      <TotersHistoryPanel allowClear />
    </>
  )
}
