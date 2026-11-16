import { Bike, CheckCircle2, CircleSlash } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { Panel } from '@/components/ui/Panel'
import { FOODY_CURRENCY, FOODY_RULES, foodyStoreById } from '@/config/foody'
import { foodyBranchLabel } from '@/foody/analytics'
import { planFoodyImport } from '@/foody/merge'
import { orderNet, type FoodyParseResult } from '@/foody/parse'
import type { FoodyImportResult } from '@/foody/types'
import { hrefFor } from '@/hooks/useHashRoute'
import { useFoodyStore } from '@/state/foodyStore'
import { formatCount, formatMoney } from '@/utils/format'

interface FoodyImportPanelProps {
  file: File
  parsed: FoodyParseResult
  done?: FoodyImportResult
  onDone: (result: FoodyImportResult) => void
  onCancel: () => void
}

const eur = (v: number) => formatMoney(v, FOODY_CURRENCY)

export const FOODY_IDENTICAL_MESSAGE = 'Every order in this file is already stored with identical values — skipped, nothing changed. If that import is excluded, include it again in Foody import history.'

/** Review and confirm a Foody export: branch, file totals, validation and overlapping orders. */
export function FoodyImportPanel({ file, parsed, done, onDone, onCancel }: FoodyImportPanelProps) {
  const { state, commitImport } = useFoodyStore()
  const blocked = parsed.issues.some((i) => i.level === 'error')
  const plan = useMemo(() => (blocked ? null : planFoodyImport(state, parsed)), [blocked, state, parsed])
  const identical = !done && plan?.kind === 'identical'
  useEffect(() => {
    if (identical) onDone({ kind: 'skipped', message: FOODY_IDENTICAL_MESSAGE })
  }, [identical, onDone])

  const confirm = (choice: 'replace' | 'keep') => {
    const entry = commitImport(parsed, choice, {
      id: crypto.randomUUID(),
      fileName: file.name,
      fileSize: file.size,
      importedAt: Date.now(),
      warnings: parsed.issues.filter((i) => i.level === 'warning').map((i) => i.message),
    })
    if (!entry) return onDone({ kind: 'skipped', message: FOODY_IDENTICAL_MESSAGE })
    onDone({
      kind: 'imported',
      entry,
      message: `${entry.ordersAdded} new order(s)${entry.ordersReplaced ? `, ${entry.ordersReplaced} replaced` : ''}${entry.ordersKept ? `, ${entry.ordersKept} kept at stored values` : ''}${entry.ordersUnchanged ? `, ${entry.ordersUnchanged} already stored` : ''}.`,
    })
  }

  if (done) {
    return (
      <Panel>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            {done.kind === 'imported' ? <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" aria-hidden="true" /> : <CircleSlash className="mt-0.5 size-5 text-slate-400" aria-hidden="true" />}
            <div>
              <p className="text-sm font-semibold text-slate-900">
                “{file.name}” {done.kind === 'imported' ? 'has been imported' : 'was skipped'}
              </p>
              <p className="text-xs text-slate-500">{done.message}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <a href={hrefFor('/foody/history')} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              Foody import history
            </a>
            <a href={hrefFor('/platforms/foody')} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              Open Foody analytics
            </a>
          </div>
        </div>
      </Panel>
    )
  }

  const c = parsed.control
  const stores = parsed.storeIds.map((id) => foodyStoreById(id)).filter((s) => s !== undefined)
  return (
    <div className="space-y-4">
      <Panel
        title={
          <span className="flex items-center gap-2">
            <Bike className="size-4 text-accent-600" aria-hidden="true" /> Foody order export (Cyprus · EUR)
          </span>
        }
        description="Recognised from its headers (Order ID, Store ID, Order status, Subtotal, Discount, Voucher). Imported into Foody analytics only — never into Weevi or Toters."
      >
        <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">Order rows in file</dt>
            <dd className="font-medium text-slate-900">{formatCount(parsed.sourceRows)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Branch (from Store ID)</dt>
            <dd className="font-medium text-slate-900">{stores.length > 0 ? stores.map((s) => `${foodyBranchLabel(s.brandId, s.branch)} · ${s.storeId}`).join(', ') : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Order dates</dt>
            <dd className="font-medium text-slate-900">{parsed.periodStart ? `${parsed.periodStart} → ${parsed.periodEnd}` : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Currency</dt>
            <dd className="font-medium text-slate-900">EUR (no conversion)</dd>
          </div>
        </dl>
        {(parsed.restaurantNames.length > 0 || parsed.addresses.length > 0) && (
          <p className="mb-4 text-xs text-slate-500">
            In the export: {parsed.restaurantNames.join(', ')}
            {parsed.addresses.length > 0 && ` · ${parsed.addresses.map((a) => a.replace(/\s*\n\s*/g, ', ')).join(' | ')}`}
          </p>
        )}

        <DataTable
          columns={[
            { key: 'm', header: 'File totals (computed from its rows)', render: (r) => <span className="font-medium text-slate-800">{r.label}</span> },
            { key: 'v', header: 'Value', align: 'right', render: (r) => r.value },
            { key: 'n', header: 'Rule', render: (r) => <span className="text-xs text-slate-500">{r.note}</span> },
          ]}
          rows={[
            { label: 'Valid orders', value: formatCount(c.validOrders), note: FOODY_RULES.valid },
            { label: 'Gross sales', value: eur(c.gross), note: 'Subtotal of valid orders' },
            { label: 'Discounts', value: eur(c.discount), note: 'Valid orders' },
            { label: 'Vouchers', value: eur(c.voucher), note: 'Valid orders' },
            { label: 'Net sales', value: eur(c.net), note: FOODY_RULES.net },
            { label: 'Average order value', value: c.validOrders > 0 ? eur(c.net / c.validOrders) : '—', note: FOODY_RULES.aov },
            { label: 'Cancelled orders', value: formatCount(c.cancelledOrders), note: `Excluded from sales · subtotal ${eur(parsed.orders.filter((o) => o.outcome === 'cancelled').reduce((a, o) => a + o.subtotal, 0))}` },
            ...(c.otherOrders > 0 ? [{ label: 'Other statuses', value: formatCount(c.otherOrders), note: 'No configured meaning — excluded' }] : []),
          ]}
          rowKey={(r) => r.label}
          empty={null}
        />

        {plan && plan.kind !== 'identical' && (
          <p className="mt-3 text-xs text-slate-600">
            Against stored Foody data: <span className="font-medium">{plan.newOrders.length} new</span>
            {plan.unchanged.length > 0 && ` · ${plan.unchanged.length} already stored (counted once)`}
            {plan.conflicts.length > 0 && <span className="font-medium text-amber-800"> · {plan.conflicts.length} stored with different values</span>}
          </p>
        )}

        {parsed.issues.length > 0 && (
          <div className="mt-4 space-y-2">
            {parsed.issues.map((i, k) => (
              <Alert key={k} level={i.level}>
                {i.message}
              </Alert>
            ))}
          </div>
        )}

        {parsed.invalid.length > 0 && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-xs font-medium text-slate-700">Rows not imported ({parsed.invalid.length}) — never treated as zero</summary>
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {parsed.invalid.map((r) => (
                <li key={`${r.row}-${r.orderId ?? ''}`}>
                  Row {r.row}
                  {r.orderId ? ` · order ${r.orderId}` : ''}
                  {r.date ? ` · ${r.date}` : ''}: {r.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Panel>

      {plan && plan.kind === 'conflict' && (
        <Panel title="Orders already stored with different values" description="The same order IDs exist with other values (e.g. a later status). Choose which to keep — an order is never counted twice.">
          <div className="max-h-80 overflow-y-auto">
            <DataTable
              columns={[
                { key: 'id', header: 'Order ID', render: (x) => x.orderId },
                { key: 'd', header: 'Date', render: (x) => x.incoming.date },
                { key: 's', header: 'Status (stored → file)', render: (x) => `${x.existing.status} → ${x.incoming.status}` },
                { key: 'n', header: 'Net (stored → file)', align: 'right', render: (x) => `${eur(orderNet(x.existing))} → ${eur(orderNet(x.incoming))}` },
              ]}
              rows={plan.conflicts}
              rowKey={(x) => x.orderId}
              empty={null}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => confirm('replace')}>
              Use the values in this file
            </Button>
            <Button onClick={() => confirm('keep')}>Keep stored values</Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel import
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">New orders in the file are added either way. Orders already stored with identical values are left unchanged.</p>
        </Panel>
      )}

      {plan && plan.kind === 'clean' && (
        <Panel>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={() => confirm('keep')}>
              Confirm import
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <span className="text-xs text-slate-500">
              Adds {formatCount(plan.newOrders.length)} new order(s).{plan.unchanged.length > 0 && ` ${plan.unchanged.length} order(s) already stored are not added again.`}
            </span>
          </div>
        </Panel>
      )}
      {blocked && (
        <div className="flex">
          <Badge tone="danger">Import blocked — fix the errors above</Badge>
        </div>
      )}
    </div>
  )
}
