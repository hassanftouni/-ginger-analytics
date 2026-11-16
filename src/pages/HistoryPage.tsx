import { Database, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { BRANDS, PLATFORMS } from '@/config/brands'
import { CATEGORIES, FIELDS, type StandardField } from '@/config/categories'
import { useDataStore } from '@/state/dataStore'
import type { BranchScope, Dataset, MappingTemplate } from '@/types/dataset'
import { BranchScopeField } from '@/components/import/BranchScopeField'
import { useFoodyStore } from '@/state/foodyStore'
import { useTotersStore } from '@/state/totersStore'
import { hrefFor } from '@/hooks/useHashRoute'
import { branchesConflict, branchesInRecords, coveredBranches, datasetPeriod } from '@/import/validation'
import { formatCount, formatDateTime, formatFileSize } from '@/utils/format'

export function HistoryPage() {
  const { datasets, templates, persistDatasets, setPersistDatasets, updateDataset, removeDataset, clearDatasets, removeTemplate, storageError } = useDataStore()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const columns: Column<Dataset>[] = [
    {
      key: 'file',
      header: 'File',
      render: (d) => (
        <button type="button" onClick={() => setExpanded(expanded === d.id ? null : d.id)} className="text-left">
          <span className="block font-medium text-slate-800 hover:text-accent-700">{d.source.fileName}</span>
          <span className="block text-xs text-slate-500">
            {d.source.sheetName !== d.source.fileName ? `${d.source.sheetName} · ` : ''}
            {formatFileSize(d.source.fileSize)}
          </span>
        </button>
      ),
    },
    { key: 'source', header: 'Source', render: (d) => `${BRANDS[d.metadata.brandId].name} · ${PLATFORMS[d.metadata.platformId].name}` },
    { key: 'country', header: 'Country', render: (d) => d.metadata.country },
    { key: 'type', header: 'Report type', render: (d) => CATEGORIES[d.metadata.category].name },
    { key: 'period', header: 'Period', render: (d) => `${d.stats.minDate ?? (d.metadata.periodStart || '?')} → ${d.stats.maxDate ?? (d.metadata.periodEnd || '?')}` },
    {
      key: 'branches',
      header: 'Branches',
      render: (d) => (
        <span className="text-xs">
          {d.mapping.branch || d.source.kind === 'manual'
            ? [...new Set(d.records.map((r) => r.branch).filter(Boolean))].join(', ') || '—'
            : d.metadata.branchScope?.mode === 'selected'
              ? d.metadata.branchScope.branches.join(', ')
              : 'All (combined)'}
        </span>
      ),
    },
    { key: 'currency', header: 'Currency', render: (d) => d.metadata.currency || (d.mapping.currency ? 'Per row' : '—') },
    { key: 'rows', header: 'Rows', align: 'right', render: (d) => formatCount(d.stats.importedRows) },
    {
      key: 'status',
      header: 'In analysis',
      render: (d) => (
        <label className="inline-flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            className="size-4 rounded border-slate-300"
            checked={d.included}
            onChange={(e) => updateDataset(d.id, { included: e.target.checked, exclusionReason: e.target.checked ? undefined : 'Excluded manually' })}
          />
          {d.included ? <Badge tone="success">Included</Badge> : <Badge tone="warning">Excluded</Badge>}
        </label>
      ),
    },
    { key: 'added', header: 'Imported', render: (d) => <span className="text-xs text-slate-500">{formatDateTime(d.importedAt)}</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (d) => (
        <Button variant="ghost" className="px-2 py-1" onClick={() => removeDataset(d.id)} aria-label={`Delete ${d.source.fileName}`}>
          <Trash2 className="size-4" />
        </Button>
      ),
    },
  ]

  const expandedDataset = datasets.find((d) => d.id === expanded)
  const totersImports = useTotersStore().state.imports.length
  const foodyImports = useFoodyStore().state.imports.length

  return (
    <>
      <PageHeader title="Import history" description="Every imported Weevi dataset. Exclude a file to leave it out of the analysis without deleting it." />

      <Alert level="info" className="mb-4">
        Toters imports are kept separately ({totersImports} import{totersImports === 1 ? '' : 's'}).{' '}
        <a href={hrefFor('/toters/history')} className="font-medium underline">
          Open Toters import history
        </a>
        . Foody (Cyprus) imports are kept separately too ({foodyImports} import{foodyImports === 1 ? '' : 's'}) —{' '}
        <a href={hrefFor('/foody/history')} className="font-medium underline">
          open Foody import history
        </a>
        . Include, exclude or delete them there.
      </Alert>

      {storageError && (
        <Alert level="warning" className="mb-4" title="Local storage unavailable">
          {storageError}
        </Alert>
      )}

      <Panel title="Local storage" className="mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Database className="mt-0.5 size-5 text-slate-400" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-slate-800">Keep imported data on this device</p>
              <p className="text-xs text-slate-500">
                Saves datasets in this browser's IndexedDB so they are still here next time. Nothing is uploaded. Turning this off deletes the saved copy.
              </p>
            </div>
          </div>
          <label className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" className="size-4 rounded border-slate-300" checked={persistDatasets} onChange={(e) => setPersistDatasets(e.target.checked)} />
            {persistDatasets ? 'On' : 'Off'}
          </label>
        </div>
      </Panel>

      <Panel
        title="Datasets"
        description={`${datasets.length} dataset(s) · ${datasets.filter((d) => d.included).length} included in analysis`}
        className="mb-6"
        bodyClassName="p-0 sm:p-2"
        actions={
          datasets.length > 0 &&
          (confirmClear ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600">Delete all datasets?</span>
              <Button
                variant="primary"
                className="bg-red-600 hover:bg-red-700"
                onClick={() => {
                  clearDatasets()
                  setConfirmClear(false)
                }}
              >
                Delete all
              </Button>
              <Button onClick={() => setConfirmClear(false)}>Cancel</Button>
            </div>
          ) : (
            <Button onClick={() => setConfirmClear(true)}>
              <Trash2 className="size-4" aria-hidden="true" /> Clear history
            </Button>
          ))
        }
      >
        <DataTable columns={columns} rows={datasets} rowKey={(d) => d.id} empty={<div className="p-5"><EmptyState title="No datasets imported" description="Imported files will be listed here." compact /></div>} />
      </Panel>

      {expandedDataset && <DatasetDetails dataset={expandedDataset} />}

      <Panel title="Saved column mappings" description="Templates are reused automatically for the same platform and report type">
        <DataTable<MappingTemplate>
          columns={[
            { key: 'name', header: 'Template', render: (t) => <span className="font-medium text-slate-800">{t.name}</span> },
            {
              key: 'mapping',
              header: 'Mapping',
              render: (t) => (
                <span className="block max-w-xl whitespace-normal text-xs text-slate-600">
                  {Object.entries(t.mapping)
                    .map(([f, h]) => `${FIELDS[f as StandardField].label} ← “${h}”`)
                    .join(' · ')}
                </span>
              ),
            },
            { key: 'updated', header: 'Updated', render: (t) => <span className="text-xs text-slate-500">{formatDateTime(t.updatedAt)}</span> },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (t) => (
                <Button variant="ghost" className="px-2 py-1" onClick={() => removeTemplate(t.id)} aria-label={`Delete template ${t.name}`}>
                  <Trash2 className="size-4" />
                </Button>
              ),
            },
          ]}
          rows={templates}
          rowKey={(t) => t.id}
          empty={<EmptyState title="No saved mappings" description="Tick “Save this mapping” when importing to create one." compact />}
        />
      </Panel>
    </>
  )
}

/** Change which branches a file without a branch column covers. Checked against other files for double counting. */
function BranchScopeEditor({ dataset: d }: { dataset: Dataset }) {
  const { datasets, updateDataset } = useDataStore()
  const [scope, setScope] = useState<BranchScope | undefined>(d.metadata.branchScope)
  const [message, setMessage] = useState<{ level: 'error' | 'info'; text: string } | null>(null)
  if (d.mapping.branch || d.source.kind === 'manual' || BRANDS[d.metadata.brandId].branches.length === 0) return null

  const save = () => {
    if (!scope || (scope.mode === 'selected' && scope.branches.length === 0)) {
      setMessage({ level: 'error', text: 'Choose “All selected branches” or at least one branch.' })
      return
    }
    const mine = coveredBranches({ branchScope: scope }, undefined)
    const p = datasetPeriod(d.metadata, d.stats)
    const conflicts = datasets.filter((o) => {
      if (o.id === d.id || !o.included || !d.included) return false
      const m = o.metadata
      if (m.brandId !== d.metadata.brandId || m.platformId !== d.metadata.platformId || m.category !== d.metadata.category) return false
      const q = datasetPeriod(m, o.stats)
      const overlap = !p.start || !p.end || !q.start || !q.end || (p.start <= q.end && q.start <= p.end)
      return overlap && branchesConflict(mine, coveredBranches(m, branchesInRecords(o)))
    })
    if (conflicts.length > 0) {
      setMessage({ level: 'error', text: `This would double count with ${conflicts.map((c) => `“${c.source.fileName}”`).join(', ')} for the same period. Exclude or change that file first.` })
      return
    }
    updateDataset(d.id, { metadata: { ...d.metadata, branchScope: scope } })
    setMessage({ level: 'info', text: 'Branch scope updated. Dashboards and reports now use it.' })
  }

  return (
    <div className="space-y-2">
      <BranchScopeField brandId={d.metadata.brandId} value={scope} onChange={setScope} />
      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={save}>
          Save branch scope
        </Button>
        {message && <span className={message.level === 'error' ? 'text-sm text-red-700' : 'text-sm text-emerald-700'}>{message.text}</span>}
      </div>
    </div>
  )
}

function DatasetDetails({ dataset: d }: { dataset: Dataset }) {
  return (
    <Panel title={`Details — ${d.source.fileName}`} className="mb-6">
      <div className="mb-6">
        <BranchScopeEditor key={d.id} dataset={d} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Column mapping</p>
          <ul className="space-y-1 text-sm">
            {Object.entries(d.mapping).map(([field, header]) => (
              <li key={field}>
                <span className="text-slate-500">{FIELDS[field as StandardField].label}</span> ← <code className="rounded bg-slate-100 px-1 text-xs">{header}</code>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            Header row {d.source.headerRow} · rows read {formatCount(d.stats.sourceRows)} · imported {formatCount(d.stats.importedRows)} · skipped {formatCount(d.stats.skippedRows)}
          </p>
          {!d.included && d.exclusionReason && <p className="mt-1 text-xs text-amber-700">Excluded: {d.exclusionReason}</p>}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Import notes</p>
          {d.warnings.length === 0 ? (
            <p className="text-sm text-slate-500">No warnings.</p>
          ) : (
            d.warnings.map((w, i) => (
              <Alert key={i} level={w.level}>
                {w.message}
              </Alert>
            ))
          )}
        </div>
      </div>
    </Panel>
  )
}
