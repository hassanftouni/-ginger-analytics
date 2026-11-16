import { CheckCircle2, CircleSlash, Truck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { Field, Select } from '@/components/ui/FormControls'
import { Panel } from '@/components/ui/Panel'
import { BRANDS } from '@/config/brands'
import { TOTERS_CONVERSION, storeById, totersToUsd } from '@/config/toters'
import { hrefFor } from '@/hooks/useHashRoute'
import { useTotersStore } from '@/state/totersStore'
import { TOTERS_BRANCHES, branchLabel } from '@/toters/analytics'
import { planTotersImport, type TotersBatchInput, type TotersConflict } from '@/toters/merge'
import { resolveStores, type TotersParseResult } from '@/toters/parse'
import type { TotersImport, TotersState } from '@/toters/types'
import { formatCount, formatMoney, formatNumber } from '@/utils/format'

interface TotersImportPanelProps {
  file: File
  parsed: TotersParseResult
  done?: { kind: 'imported' | 'skipped'; entries: TotersImport[]; message: string }
  onDone: (result: { kind: 'imported' | 'skipped'; entries: TotersImport[]; message: string }) => void
  onCancel: () => void
}

const usd = (v: number) => formatMoney(v, 'USD')

/** Review and confirm a Toters export: branch mapping, validation, reconciliation and overlaps. */
export function TotersImportPanel({ file, parsed, done, onDone, onCancel }: TotersImportPanelProps) {
  const { state, commitImport } = useTotersStore()
  const [manual, setManual] = useState('')
  const resolution = useMemo(() => resolveStores(parsed, manual || undefined), [parsed, manual])
  const issues = [...parsed.issues, ...resolution.issues]
  const blocked = issues.some((i) => i.level === 'error') || resolution.stores.length === 0
  const plan = useMemo(() => (blocked ? null : planTotersImport(state, resolution.stores)), [blocked, state, resolution])
  const conflicts: (TotersConflict & { label: string })[] = plan ? plan.stores.flatMap((p) => p.conflicts.map((c) => ({ ...c, label: branchLabel(p.store.brandId, p.store.branch) }))) : []

  // An identical re-import is detected and skipped automatically: nothing is changed.
  const identical = !done && plan?.kind === 'identical'
  useEffect(() => {
    if (identical) onDone({ kind: 'skipped', entries: [], message: 'Identical to data already imported for every branch in the file — skipped, nothing changed. If that import is excluded, include it again in Toters import history.' })
  }, [identical, onDone])

  const build = (current: TotersState): { plan: ReturnType<typeof planTotersImport>; input: TotersBatchInput } | null => {
    if (blocked) return null
    return {
      plan: planTotersImport(current, resolution.stores),
      input: {
        batchId: crypto.randomUUID(),
        fileName: file.name,
        fileSize: file.size,
        deliveryScope: parsed.deliveryScopes[0],
        importedAt: Date.now(),
        reconciliation: parsed.reconciliation,
        warnings: issues.filter((i) => i.level === 'warning').map((i) => i.message),
        newId: () => crypto.randomUUID(),
      },
    }
  }

  const confirm = (choice: 'replace' | 'keep') => {
    const entries = commitImport(build, choice)
    if (!entries) {
      onDone({ kind: 'skipped', entries: [], message: 'Identical to data already imported — skipped, nothing changed.' })
      return
    }
    const added = entries.reduce((a, e) => a + e.daysAdded, 0)
    const replaced = entries.reduce((a, e) => a + e.daysReplaced, 0)
    const kept = entries.reduce((a, e) => a + e.daysKept, 0)
    onDone({
      kind: 'imported',
      entries,
      message: `${entries.length} branch(es) imported: ${added} new day(s)${replaced ? `, ${replaced} replaced` : ''}${kept ? `, ${kept} kept at existing values` : ''}.`,
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
              {done.entries.length > 0 && <p className="mt-1 text-xs text-slate-500">{done.entries.map((e) => `${BRANDS[e.brandId].name} — ${e.branch}`).join(' · ')}</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <a href={hrefFor('/toters/history')} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              Toters import history
            </a>
            <a href={hrefFor('/platforms/toters')} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              Open Toters analytics
            </a>
          </div>
        </div>
      </Panel>
    )
  }

  return (
    <div className="space-y-4">
      <Panel
        title={
          <span className="flex items-center gap-2">
            <Truck className="size-4 text-accent-600" aria-hidden="true" /> Toters daily revenue export
          </span>
        }
        description="Recognised from its headers (store_id, period, total). Imported into Toters analytics only — never into Weevi."
      >
        <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">Rows in file</dt>
            <dd className="font-medium text-slate-900">{formatCount(parsed.sourceRows)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Branches</dt>
            <dd className="font-medium text-slate-900">{parsed.stores.length}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Reporting period</dt>
            <dd className="font-medium text-slate-900">{parsed.periodStart ? `${parsed.periodStart} → ${parsed.periodEnd}` : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Conversion</dt>
            <dd className="font-medium text-slate-900">× {formatCount(TOTERS_CONVERSION.lbpMultiplier)} ÷ {formatCount(TOTERS_CONVERSION.lbpPerUsd)}</dd>
          </div>
        </dl>

        {resolution.needsManualBranch && (
          <Field label="Toters branch" htmlFor="toters-branch" required hint="This file has no store ID. Choose the branch it was exported for — the file name is never used." className="mb-4 max-w-sm">
            <Select id="toters-branch" value={manual} onChange={(e) => setManual(e.target.value)}>
              <option value="">Select…</option>
              {TOTERS_BRANCHES.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label} (store {b.storeId})
                </option>
              ))}
            </Select>
          </Field>
        )}

        <DataTable
          columns={[
            {
              key: 'store',
              header: 'Store ID',
              render: (s) => {
                const store = s.storeId ? storeById(s.storeId) : resolution.stores[0]?.store
                return (
                  <span>
                    {s.storeId ?? '—'}
                    <span className="block text-xs text-slate-500">{store ? branchLabel(store.brandId, store.branch) : 'Branch required'}</span>
                  </span>
                )
              },
            },
            { key: 'ref', header: 'Name in export', render: (s) => <span className="text-xs">{s.storeLabel ?? '—'}</span> },
            { key: 'period', header: 'Period', render: (s) => <span className="text-xs">{s.periodStart ? `${s.periodStart} → ${s.periodEnd}` : '—'}</span> },
            { key: 'days', header: 'Valid days', align: 'right', render: (s) => formatCount(s.rows.length) },
            { key: 'inv', header: 'Invalid rows', align: 'right', render: (s) => (s.invalid.length > 0 ? <span className="text-red-700">{s.invalid.length}</span> : '0') },
            { key: 'csv', header: 'CSV total', align: 'right', render: (s) => formatNumber(s.rows.reduce((a, r) => a + r.csvTotal, 0), 2) },
            { key: 'usd', header: 'Revenue (USD)', align: 'right', render: (s) => usd(s.rows.reduce((a, r) => a + totersToUsd(r.csvTotal), 0)) },
            {
              key: 'plan',
              header: 'Against stored data',
              render: (s) => {
                const p = plan?.stores.find((x) => x.rows === s)
                if (!p) return <span className="text-xs text-slate-400">—</span>
                if (p.kind === 'identical') return <Badge>Already imported</Badge>
                return (
                  <span className="text-xs">
                    {p.newDays.length} new{p.unchanged.length > 0 && ` · ${p.unchanged.length} unchanged`}
                    {p.conflicts.length > 0 && <span className="font-medium text-amber-800"> · {p.conflicts.length} differ</span>}
                  </span>
                )
              },
            },
          ]}
          rows={parsed.stores}
          rowKey={(s) => s.storeId ?? 'manual'}
          empty={<p className="text-sm text-slate-500">No branch rows found.</p>}
        />

        {parsed.reconciliation && (
          <Alert level={parsed.reconciliation.mismatches.length === 0 ? 'info' : 'warning'} className="mt-4" title="Combined totals (store_id 0) — reconciliation only">
            {parsed.reconciliation.mismatches.length === 0
              ? `The branch rows add up to the export's combined total on all ${parsed.reconciliation.days} day(s) (${usd(totersToUsd(parsed.reconciliation.combinedCsvTotal))}). Combined rows are not imported and never added to revenue.`
              : `The branch rows differ from the combined total on ${parsed.reconciliation.mismatches.length} of ${parsed.reconciliation.days} day(s): ${parsed.reconciliation.mismatches
                  .slice(0, 5)
                  .map((m) => `${m.date} (combined ${formatNumber(m.combinedCsvTotal, 2)} vs branches ${formatNumber(m.branchCsvTotal, 2)})`)
                  .join(', ')}${parsed.reconciliation.mismatches.length > 5 ? '…' : ''}. Branch rows are used for all figures.`}
          </Alert>
        )}

        {issues.length > 0 && (
          <div className="mt-4 space-y-2">
            {issues.map((i, k) => (
              <Alert key={k} level={i.level}>
                {i.message}
              </Alert>
            ))}
          </div>
        )}

        {[...parsed.unattributed, ...parsed.stores.flatMap((s) => s.invalid)].length > 0 && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-xs font-medium text-slate-700">Invalid rows (not imported, never treated as zero)</summary>
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {[...parsed.unattributed, ...parsed.stores.flatMap((s) => s.invalid)]
                .sort((a, b) => a.row - b.row)
                .map((r) => (
                  <li key={r.row}>
                    Row {r.row}
                    {r.date ? ` · ${r.date}` : ''}: {r.reason}
                  </li>
                ))}
            </ul>
          </details>
        )}
      </Panel>

      {plan && plan.kind === 'conflict' && (
        <Panel title="Overlapping days with different values" description="These dates are already stored for the same branch. Choose how to resolve them — revenue is never added twice.">
          <DataTable
            columns={[
              { key: 'branch', header: 'Branch', render: (c) => c.label },
              { key: 'date', header: 'Date', render: (c) => c.date },
              { key: 'old', header: 'Stored (USD)', align: 'right', render: (c) => usd(c.existing.revenueUsd) },
              { key: 'new', header: 'In this file (USD)', align: 'right', render: (c) => usd(totersToUsd(c.incoming.csvTotal)) },
              { key: 'diff', header: 'Difference', align: 'right', render: (c) => usd(totersToUsd(c.incoming.csvTotal) - c.existing.revenueUsd) },
              { key: 'raw', header: 'CSV total (stored → new)', align: 'right', render: (c) => `${formatNumber(c.existing.csvTotal, 2)} → ${formatNumber(c.incoming.csvTotal, 2)}` },
            ]}
            rows={conflicts}
            rowKey={(c) => `${c.existing.storeId}|${c.date}`}
            empty={null}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => confirm('replace')}>
              Replace overlapping days with new values
            </Button>
            <Button onClick={() => confirm('keep')}>Keep existing values</Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel import
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">New days in the file are added either way. Overlapping days with identical values are left unchanged.</p>
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
              Adds {plan.stores.reduce((a, p) => a + p.newDays.length, 0)} new branch-day(s). Days already stored with identical values are left unchanged.
            </span>
          </div>
        </Panel>
      )}
    </div>
  )
}
