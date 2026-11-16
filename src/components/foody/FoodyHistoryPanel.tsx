import { History, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { Panel } from '@/components/ui/Panel'
import { BRANDS } from '@/config/brands'
import type { FoodyReconciliation } from '@/foody/analytics'
import type { FoodyImport } from '@/foody/types'
import { useFoodyStore } from '@/state/foodyStore'
import { formatCount, formatDateTime, formatMoney } from '@/utils/format'

interface FoodyHistoryPanelProps {
  /** Limit to imports touching these stores. All imports when omitted. */
  storeIds?: string[]
  /** Validation results by import ID (from the analytics). */
  reconciliation?: FoodyReconciliation[]
  className?: string
  allowClear?: boolean
}

/** Foody import history: file, branch, period, totals, what changed and validation. */
export function FoodyHistoryPanel({ storeIds, reconciliation, className, allowClear }: FoodyHistoryPanelProps) {
  const { state, removeImport, setImportIncluded, clear } = useFoodyStore()
  const [confirm, setConfirm] = useState<string | null>(null)
  const rows = state.imports.filter((i) => !storeIds || i.storeIds.some((s) => storeIds.includes(s)))
  const rec = new Map((reconciliation ?? []).map((r) => [r.importId, r]))

  return (
    <Panel
      title="Foody import history"
      description={`${rows.length} import(s) · ${rows.filter((i) => i.included !== false).length} included in analysis · orders are stored once per order ID`}
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
                Delete all Foody data
              </Button>
            </>
          ) : (
            <Button onClick={() => setConfirm('all')}>
              <Trash2 className="size-4" aria-hidden="true" /> Clear Foody data
            </Button>
          )
        ) : undefined
      }
    >
      <DataTable<FoodyImport>
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
          {
            key: 'branch',
            header: 'Branch',
            render: (i) => (
              <span>
                {i.branches.map((b) => `${BRANDS[b.brandId].name} — ${b.branch}`).join(', ')}
                <span className="block text-xs text-slate-500">Store {i.storeIds.join(', ')}</span>
              </span>
            ),
          },
          { key: 'period', header: 'Order dates', render: (i) => <span className="text-xs">{`${i.periodStart} → ${i.periodEnd}`}</span> },
          {
            key: 'totals',
            header: 'File totals',
            align: 'right',
            render: (i) => (
              <span className="text-xs">
                {formatMoney(i.control.net, i.currency)} net
                <span className="block text-slate-500">
                  {formatCount(i.control.validOrders)} valid · {formatCount(i.control.cancelledOrders)} cancelled
                </span>
              </span>
            ),
          },
          {
            key: 'changes',
            header: 'Changes',
            render: (i) => (
              <span className="text-xs">
                +{i.ordersAdded} new
                {i.ordersReplaced > 0 && ` · ${i.ordersReplaced} replaced`}
                {i.ordersKept > 0 && ` · ${i.ordersKept} kept stored`}
                {i.ordersUnchanged > 0 && ` · ${i.ordersUnchanged} already stored`}
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
                <input
                  type="checkbox"
                  className="size-4 rounded border-slate-300"
                  checked={i.included !== false}
                  onChange={(e) => setImportIncluded(i.id, e.target.checked)}
                  aria-label={`Include ${i.fileName} in analysis`}
                />
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
        empty={<EmptyState icon={History} title="No Foody imports yet" description="Imported Foody order exports appear here with their branch, period and totals." compact />}
      />
      {rows.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          Excluding keeps the import but leaves the orders it supplied out of every Foody figure and report — tick it again to restore. Deleting removes those orders; values it had replaced are not restored — re-import the earlier file to bring them back.
        </p>
      )}
    </Panel>
  )
}
