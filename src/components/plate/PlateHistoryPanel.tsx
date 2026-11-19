import { History, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { Panel } from '@/components/ui/Panel'
import { plateLocationLabel, type PlateReconciliation } from '@/plate/analytics'
import type { PlateImport } from '@/plate/types'
import { usePlateStore } from '@/state/plateStore'
import { formatCount, formatDateTime } from '@/utils/format'

interface PlateHistoryPanelProps {
  /** Limit to imports of these locations. All imports when omitted. */
  locationIds?: string[]
  reconciliation?: PlateReconciliation[]
  className?: string
  allowClear?: boolean
}

/** Plate import history: file, location, covered period, totals, changes and validation. */
export function PlateHistoryPanel({ locationIds, reconciliation, className, allowClear }: PlateHistoryPanelProps) {
  const { state, removeImport, setImportIncluded, clear } = usePlateStore()
  const [confirm, setConfirm] = useState<string | null>(null)
  const rows = state.imports.filter((i) => !locationIds || locationIds.includes(i.locationId))
  const rec = new Map((reconciliation ?? []).map((r) => [r.importId, r]))

  return (
    <Panel
      title="Plate import history"
      description={`${rows.length} import(s) · ${rows.filter((i) => i.included !== false).length} included in analysis · bookings are stored once per Booking ID`}
      className={className}
      actions={
        allowClear && state.imports.length > 0 ? (
          confirm === 'all' ? (
            <>
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  clear()
                  setConfirm(null)
                }}
              >
                Delete all Plate data
              </Button>
            </>
          ) : (
            <Button onClick={() => setConfirm('all')}>
              <Trash2 className="size-4" aria-hidden="true" /> Clear Plate data
            </Button>
          )
        ) : undefined
      }
    >
      <DataTable<PlateImport>
        columns={[
          {
            key: 'file',
            header: 'Source file',
            render: (i) => (
              <span className="block max-w-56">
                <span className="block truncate text-xs font-medium text-slate-800" title={i.fileName}>
                  {i.fileName}
                </span>
                <span className="block text-xs text-slate-500">Imported {formatDateTime(i.importedAt)}</span>
              </span>
            ),
          },
          { key: 'loc', header: 'Location', render: (i) => plateLocationLabel(i.locationId) },
          { key: 'period', header: 'Period covered', render: (i) => <span className="text-xs">{`${i.periodStart} → ${i.periodEnd}`}</span> },
          {
            key: 'totals',
            header: 'File totals',
            align: 'right',
            render: (i) => (
              <span className="text-xs">
                {formatCount(i.control.completed)} completed · {formatCount(i.control.covers)} guests
                <span className="block text-slate-500">
                  {formatCount(i.control.bookings)} bookings · {i.control.cancelled} cancelled · {i.control.declined} declined
                </span>
              </span>
            ),
          },
          {
            key: 'changes',
            header: 'Changes',
            render: (i) => (
              <span className="text-xs">
                +{i.bookingsAdded} new
                {i.bookingsReplaced > 0 && ` · ${i.bookingsReplaced} replaced`}
                {i.bookingsKept > 0 && ` · ${i.bookingsKept} kept stored`}
                {i.bookingsUnchanged > 0 && ` · ${i.bookingsUnchanged} already stored`}
                {i.invalidRows.length > 0 && <span className="block text-red-700">{i.invalidRows.length} row(s) not imported</span>}
              </span>
            ),
          },
          {
            key: 'rec',
            header: 'Validation',
            render: (i) => {
              const r = rec.get(i.id)
              if (!r) return <span className="text-xs text-slate-400">{i.included === false ? 'Excluded' : '—'}</span>
              return r.matches ? <Badge tone="success">Matches file</Badge> : <Badge tone="warning">Differs from file</Badge>
            },
          },
          {
            key: 'included',
            header: 'In analysis',
            render: (i) => (
              <label className="inline-flex items-center gap-2 text-xs">
                <input type="checkbox" className="size-4 rounded border-slate-300" checked={i.included !== false} onChange={(e) => setImportIncluded(i.id, e.target.checked)} aria-label={`Include ${i.fileName} in analysis`} />
                {i.included !== false ? <span className="text-emerald-700">Included</span> : <span className="font-medium text-amber-700">Excluded</span>}
              </label>
            ),
          },
          {
            key: 'del',
            header: '',
            render: (i) =>
              confirm === i.id ? (
                <span className="flex gap-1">
                  <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setConfirm(null)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    className="px-2 py-1 text-xs"
                    onClick={() => {
                      removeImport(i.id)
                      setConfirm(null)
                    }}
                  >
                    Delete
                  </Button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirm(i.id)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-700" aria-label={`Delete import of ${i.fileName}`}>
                  <Trash2 className="size-4" />
                </button>
              ),
          },
        ]}
        rows={rows}
        rowKey={(i) => i.id}
        empty={<EmptyState icon={History} title="No Plate imports yet" description="Imported Plate bookings exports appear here with their location, period and totals." compact />}
      />
      {rows.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          Excluding keeps the import but leaves its bookings out of every Plate figure and report — tick it again to restore. Deleting removes those bookings; values it had replaced are not restored.
        </p>
      )}
    </Panel>
  )
}
