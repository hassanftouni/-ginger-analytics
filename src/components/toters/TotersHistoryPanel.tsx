import { History, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { Panel } from '@/components/ui/Panel'
import { BRANDS } from '@/config/brands'
import { useTotersStore } from '@/state/totersStore'
import type { TotersImport } from '@/toters/types'
import { formatCount, formatDateTime } from '@/utils/format'

interface TotersHistoryPanelProps {
  /** Limit to these stores (e.g. the branches in the current filter). All imports when omitted. */
  storeIds?: string[]
  className?: string
  /** Show the "delete all Toters data" control. */
  allowClear?: boolean
}

/** Toters import history: file, branch, period, timestamp, conversion rule and what changed. */
export function TotersHistoryPanel({ storeIds, className, allowClear }: TotersHistoryPanelProps) {
  const { state, removeImport, setImportIncluded, clear } = useTotersStore()
  const [confirm, setConfirm] = useState<string | null>(null)
  const rows = state.imports.filter((i) => !storeIds || storeIds.includes(i.storeId))

  return (
    <Panel
      title="Toters import history"
      description={`${rows.length} import(s) · ${rows.filter((i) => i.included !== false).length} included in analysis · each branch in a file is recorded separately`}
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
                Delete all Toters data
              </Button>
            </>
          ) : (
            <Button onClick={() => setConfirm('all')}>
              <Trash2 className="size-4" aria-hidden="true" /> Clear Toters data
            </Button>
          )
        ) : undefined
      }
    >
      <DataTable<TotersImport>
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
                {BRANDS[i.brandId].name} — {i.branch}
                <span className="block text-xs text-slate-500">
                  Store {i.storeId} · {i.storeIdSource === 'file' ? 'from store ID' : 'selected manually'}
                </span>
              </span>
            ),
          },
          {
            key: 'period',
            header: 'Period · conversion',
            render: (i) => (
              <span className="text-xs">
                {`${i.periodStart} → ${i.periodEnd}`}
                <span className="block text-slate-500">
                  × {formatCount(i.conversion.lbpMultiplier)} ÷ {formatCount(i.conversion.lbpPerUsd)}
                </span>
              </span>
            ),
          },
          {
            key: 'rows',
            header: 'Rows',
            align: 'right',
            render: (i) => (
              <span className="text-xs">
                {formatCount(i.validRows)} valid
                {i.invalidRows.length > 0 && <span className="block text-red-700">{formatCount(i.invalidRows.length)} invalid</span>}
              </span>
            ),
          },
          {
            key: 'changes',
            header: 'Changes',
            render: (i) => (
              <span className="text-xs">
                +{i.daysAdded} new
                {i.daysReplaced > 0 && ` · ${i.daysReplaced} replaced`}
                {i.daysKept > 0 && ` · ${i.daysKept} kept existing`}
                {i.daysUnchanged > 0 && ` · ${i.daysUnchanged} unchanged`}
              </span>
            ),
          },
          {
            key: 'rec',
            header: 'Reconciliation',
            render: (i) =>
              !i.reconciliation ? (
                <span className="text-xs text-slate-400">—</span>
              ) : i.reconciliation.mismatches.length === 0 ? (
                <Badge tone="success">{i.reconciliation.days} days</Badge>
              ) : (
                <Badge tone="warning">
                  {i.reconciliation.mismatches.length}/{i.reconciliation.days} days differ
                </Badge>
              ),
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
                  aria-label={`Include ${i.fileName} (${i.branch}) in analysis`}
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
                <button type="button" onClick={() => setConfirm(i.id)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-700" aria-label={`Delete import of ${i.fileName} for ${i.branch}`}>
                  <Trash2 className="size-4" />
                </button>
              ),
          },
        ]}
        rows={rows}
        rowKey={(i) => i.id}
        empty={<EmptyState icon={History} title="No Toters imports yet" description="Imported Toters files appear here with their branch, period and conversion rule." compact />}
      />
      {rows.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          Excluding keeps the import but leaves its days out of every Toters figure and report (they count as missing) — tick it again to restore. Deleting removes the days it supplied; values it had replaced are not restored — re-import the earlier file to bring them back.
        </p>
      )}
    </Panel>
  )
}
