import { CheckCircle2, ScanSearch } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextInput } from '@/components/ui/FormControls'
import { Panel } from '@/components/ui/Panel'
import { BRANDS, PLATFORMS } from '@/config/brands'
import { CATEGORIES, FIELDS, type StandardField } from '@/config/categories'
import { getExportFormat } from '@/config/exportFormats'
import { applyTemplate, findTemplate, pruneMapping, templateId, type ImportJob } from '@/import/job'
import { normalizeTable } from '@/import/normalize'
import {
  assessNormalization,
  datasetPeriod,
  findOverlaps,
  hasErrors,
  shouldExcludeOnOverlap,
  validateBranchScope,
  validateCurrency,
  validateMapping,
  validateMetadata,
  type MetadataDraft,
} from '@/import/validation'
import { guessHeaderRow, toSourceTable } from '@/parsers'
import { useDataStore } from '@/state/dataStore'
import type { Dataset, DatasetMetadata, Issue } from '@/types/dataset'
import { formatCount } from '@/utils/format'
import { fingerprintRecords } from '@/utils/hash'
import { ColumnMapper } from './ColumnMapper'
import { NormalizedPreview } from './NormalizedPreview'
import { RawPreview } from './RawPreview'
import { SourceForm } from './SourceForm'

function Step({ n, title }: { n: number; title: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex size-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">{n}</span>
      {title}
    </span>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{children}</dd>
    </div>
  )
}

interface ImportWorkbenchProps {
  job: ImportJob
  onChange: (patch: Partial<ImportJob>) => void
  onImported: () => void
}

/** Configure, validate and confirm one file. */
export function ImportWorkbench({ job, onChange, onImported }: ImportWorkbenchProps) {
  const { datasets, templates, addDataset, saveTemplate } = useDataStore()
  const raw = job.raw
  const sheet = raw?.sheets[job.sheetIndex] ?? raw?.sheets[0]
  const table = useMemo(() => (sheet ? toSourceTable(sheet, job.headerRow) : null), [sheet, job.headerRow])
  const meta = job.metadata
  const category = meta.category
  const format = getExportFormat(job.detection?.formatId)

  const metaIssues = validateMetadata(meta, job.mapping)
  const mapIssues = table ? validateMapping(meta, job.mapping, table.headers) : []
  const scopeIssues = validateBranchScope(meta, job.mapping)
  const mappingReady = Boolean(table && category) && !hasErrors(mapIssues)

  const normalization = useMemo(
    () => (table && category && mappingReady ? normalizeTable(table, category, job.mapping, job.parseOptions) : null),
    [table, category, mappingReady, job.mapping, job.parseOptions],
  )
  const fingerprint = useMemo(() => (normalization ? fingerprintRecords(normalization.records) : ''), [normalization])
  const normIssues = normalization ? [...assessNormalization(normalization.stats), ...validateCurrency(meta, job.mapping, normalization.stats)] : []

  const metaValid = !hasErrors(metaIssues) && !hasErrors(scopeIssues)
  const candidate = useMemo(() => {
    if (!normalization || !sheet || !metaValid) return null
    return {
      metadata: { ...(meta as DatasetMetadata), currency: meta.currency ?? '', periodStart: meta.periodStart ?? '', periodEnd: meta.periodEnd ?? '' },
      stats: normalization.stats,
      fingerprint,
      source: { fileName: job.file.name, fileSize: job.file.size, lastModified: job.file.lastModified, sheetName: sheet.name },
      branches: new Set(normalization.records.map((r) => r.branch).filter((b): b is string => Boolean(b))),
    }
  }, [normalization, sheet, metaValid, meta, job.file, fingerprint])

  const overlap = candidate ? findOverlaps(candidate, datasets) : null
  const exclude = candidate && overlap ? shouldExcludeOnOverlap(candidate.metadata.category, job.mapping, overlap.overlapping) : false
  const overlapIssues: Issue[] = []
  if (overlap?.sameFile) overlapIssues.push({ level: 'error', message: `This sheet of “${job.file.name}” has already been imported. Delete it from Import history to re-import.` })
  if (overlap?.sameContent) {
    overlapIssues.push({ level: 'error', message: `Duplicate upload: the cleaned contents are identical to “${overlap.sameContent.source.fileName}”, already imported for ${BRANDS[overlap.sameContent.metadata.brandId].name}.` })
  }
  if (overlap && overlap.overlapping.length > 0 && !overlap.sameFile && !overlap.sameContent) {
    const names = overlap.overlapping.map((d) => `“${d.source.fileName}”`).join(', ')
    overlapIssues.push(
      exclude
        ? { level: 'warning', message: `The period overlaps with ${names} for the same brand, source and report type. To avoid double counting, this file will be imported as excluded. You can switch which file is included in Import history.` }
        : { level: 'info', message: `The period overlaps with ${names}. Both files have Order IDs, so duplicate orders will be counted once.` },
    )
  }

  const allIssues = [...metaIssues, ...scopeIssues, ...mapIssues, ...normIssues, ...overlapIssues]
  const canConfirm = Boolean(candidate && normalization) && !hasErrors(allIssues) && job.state !== 'imported'
  const template = findTemplate(templates, meta.platformId, category)

  if (!raw || !sheet || !table) return null

  // An imported file is final here; its settings (e.g. branch scope) are changed in Import history.
  if (job.state === 'imported') {
    return (
      <Panel>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-slate-900">“{job.file.name}” has been imported</p>
              <p className="text-xs text-slate-500">
                {meta.brandId ? BRANDS[meta.brandId].name : ''} · {format?.name ?? (category ? CATEGORIES[category].name : '')} · Branch scope:{' '}
                {job.mapping.branch ? 'from branch column' : meta.branchScope?.mode === 'all' ? 'all selected branches' : meta.branchScope?.branches.join(', ')}
              </p>
              <p className="mt-1 text-xs text-slate-500">To change the branch or other details, use Import history. To import another file, add it on the left.</p>
            </div>
          </div>
          <a href="#/history" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            Open Import history
          </a>
        </div>
      </Panel>
    )
  }

  const changeMetadata = (next: MetadataDraft) => {
    const patch: Partial<ImportJob> = { metadata: next }
    // For manual mapping: a new platform / report type starts from its saved template, if any.
    if (!format && (next.category !== meta.category || next.platformId !== meta.platformId)) {
      const t = findTemplate(templates, next.platformId, next.category)
      if (t) {
        const { mapping, missing } = applyTemplate(t, table.headers)
        patch.mapping = mapping
        patch.parseOptions = t.parseOptions
        patch.templateNote = missing.length > 0 ? `Saved mapping applied; ${missing.length} saved column(s) not found in this file: ${missing.join(', ')}.` : 'Saved mapping applied.'
      } else {
        patch.mapping = {}
        patch.templateNote = undefined
      }
    }
    onChange(patch)
  }

  const switchToManual = () => onChange({ detection: undefined, metadata: { ...meta, formatId: undefined }, saveTemplate: true })

  const changeSheet = (index: number) => {
    const headerRow = guessHeaderRow(raw.sheets[index])
    onChange({ sheetIndex: index, headerRow, mapping: pruneMapping(job.mapping, toSourceTable(raw.sheets[index], headerRow).headers) })
  }

  const changeHeaderRow = (row: number) => {
    const headerRow = Math.min(Math.max(1, row), sheet.cells.length)
    onChange({ headerRow, mapping: pruneMapping(job.mapping, toSourceTable(sheet, headerRow).headers) })
  }

  const confirm = () => {
    if (!candidate || !normalization || !category) return
    const dataset: Dataset = {
      id: crypto.randomUUID(),
      metadata: { ...candidate.metadata, branchScope: job.mapping.branch ? undefined : candidate.metadata.branchScope },
      source: { fileName: candidate.source.fileName, fileSize: candidate.source.fileSize, lastModified: candidate.source.lastModified, sheetName: candidate.source.sheetName, headerRow: job.headerRow, kind: 'file' },
      mapping: job.mapping,
      parseOptions: job.parseOptions,
      records: normalization.records,
      stats: normalization.stats,
      fingerprint,
      warnings: allIssues.filter((i) => i.level !== 'error'),
      included: !exclude,
      exclusionReason: exclude ? `Overlaps with ${overlap?.overlapping.map((d) => d.source.fileName).join(', ')}` : undefined,
      importedAt: Date.now(),
    }
    addDataset(dataset)
    if (!format && job.saveTemplate && meta.platformId) {
      saveTemplate({
        id: templateId(meta.platformId, category),
        platformId: meta.platformId,
        category,
        name: `${PLATFORMS[meta.platformId].name} · ${CATEGORIES[category].name}`,
        headerRow: job.headerRow,
        mapping: job.mapping,
        parseOptions: job.parseOptions,
        updatedAt: Date.now(),
      })
    }
    onImported()
  }

  const stats = normalization?.stats
  const period = stats ? datasetPeriod({ periodStart: meta.periodStart ?? '', periodEnd: meta.periodEnd ?? '' }, stats) : null
  const currencyHint = format
    ? format.currency === 'from-values'
      ? stats?.valueCurrencies.length
        ? `Detected from the amounts: ${stats.valueCurrencies.join(', ')}`
        : 'Taken from the amounts'
      : format.currency === 'user'
        ? 'Not in the export — confirm the currency'
        : 'This export has no monetary values'
    : undefined

  return (
    <div className="space-y-6">
      {format ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <ScanSearch className="mt-0.5 size-5 text-emerald-700" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Detected: {format.name}</p>
                <p className="text-xs text-slate-600">
                  Recognised from its headers ({format.requiredHeaders.map((h) => `“${h}”`).join(', ')}) · {format.grain}
                </p>
              </div>
            </div>
            <Button variant="ghost" onClick={switchToManual}>
              Map manually instead
            </Button>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Fact label="Rows">{stats ? formatCount(stats.importedRows) : formatCount(table.rows.length)}</Fact>
            <Fact label="Reporting period">{period?.start ? `${period.start} → ${period.end}` : format.period === 'user' ? 'Not in file — enter below' : '—'}</Fact>
            <Fact label="Currency">{stats?.valueCurrencies.length ? stats.valueCurrencies.join(', ') : format.currency === 'none' ? 'n/a' : meta.currency || 'Not in file — enter below'}</Fact>
            <Fact label="Report type">{CATEGORIES[format.category].name}</Fact>
          </dl>
          <div className="mt-4">
            <p className="mb-1 text-xs font-medium text-slate-700">Column mapping</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
              {Object.entries(job.mapping).map(([field, header]) => (
                <li key={field}>
                  <code className="rounded bg-white px-1 ring-1 ring-slate-200">{header}</code> → {FIELDS[field as StandardField].label}
                </li>
              ))}
            </ul>
          </div>
          {format.notes.length > 0 && (
            <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-slate-600">
              {format.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <Alert level="info" title="No verified format recognised">
          Map the columns manually below. Verified formats currently exist for Weevi daily sales, daily customer activity, top products and top customers.
        </Alert>
      )}

      <Panel title={<Step n={1} title="Describe the export" />} description={job.file.name}>
        <SourceForm
          value={meta}
          onChange={changeMetadata}
          dateMapped={Boolean(job.mapping.date)}
          locked={Boolean(format)}
          branchMapped={Boolean(job.mapping.branch)}
          currencyHint={currencyHint}
          periodRequired={format?.period === 'user'}
        />
      </Panel>

      <Panel title={<Step n={2} title="Inspect the file" />} description="Detected columns and the first 20 rows as exported">
        {!format && (
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {raw.sheets.length > 1 && (
              <Field label="Sheet" htmlFor="job-sheet">
                <Select id="job-sheet" value={job.sheetIndex} onChange={(e) => changeSheet(Number(e.target.value))}>
                  {raw.sheets.map((s, i) => (
                    <option key={s.name} value={i}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Header row" htmlFor="job-header" hint="Row number containing the column names">
              <TextInput id="job-header" type="number" min={1} max={sheet.cells.length} value={job.headerRow} onChange={(e) => changeHeaderRow(Number(e.target.value) || 1)} />
            </Field>
          </div>
        )}
        <RawPreview table={table} hiddenHeaders={Object.entries(job.mapping).filter(([f]) => f === 'customerName' || f === 'comment').map(([, h]) => h as string)} />
      </Panel>

      {!format && (
        <Panel
          title={<Step n={3} title="Map columns" />}
          description={category ? `${CATEGORIES[category].name}: match each standard field to a column in this export` : 'Select a report type first'}
          actions={
            template && category ? (
              <Button
                onClick={() => {
                  const { mapping, missing } = applyTemplate(template, table.headers)
                  onChange({ mapping, parseOptions: template.parseOptions, templateNote: missing.length > 0 ? `${missing.length} saved column(s) not found: ${missing.join(', ')}.` : 'Saved mapping applied.' })
                }}
              >
                Apply saved mapping
              </Button>
            ) : undefined
          }
        >
          {category ? (
            <div className="space-y-4">
              {job.templateNote && <Alert level="info">{job.templateNote}</Alert>}
              <ColumnMapper
                category={category}
                table={table}
                mapping={job.mapping}
                onMappingChange={(mapping) => onChange({ mapping })}
                parseOptions={job.parseOptions}
                onParseOptionsChange={(parseOptions) => onChange({ parseOptions })}
              />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={job.saveTemplate} onChange={(e) => onChange({ saveTemplate: e.target.checked })} className="size-4 rounded border-slate-300" />
                Save this mapping as the template for {meta.platformId ? PLATFORMS[meta.platformId].name : 'this platform'} · {CATEGORIES[category].name}
              </label>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Choose the brand, platform and report type above to see the fields to map.</p>
          )}
        </Panel>
      )}

      <Panel title={<Step n={format ? 3 : 4} title="Validate and confirm" />} description="Nothing is added to the analysis until you confirm">
        <div className="space-y-4">
          {normalization && (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge tone="success">{formatCount(normalization.stats.importedRows)} rows ready</Badge>
                {normalization.stats.skippedRows > 0 && <Badge tone="warning">{formatCount(normalization.stats.skippedRows)} rows skipped</Badge>}
                {period?.start && <Badge>{`${period.start} → ${period.end}`}</Badge>}
                {meta.brandId && meta.platformId && <Badge>{`${BRANDS[meta.brandId].name} · ${PLATFORMS[meta.platformId].name}`}</Badge>}
              </div>
              {category && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-700">Cleaned preview — only mapped fields are stored</p>
                  <NormalizedPreview category={category} mapping={job.mapping} records={normalization.records} />
                </div>
              )}
            </>
          )}

          {allIssues.length > 0 && (
            <div className="space-y-2">
              {allIssues.map((issue, i) => (
                <Alert key={i} level={issue.level}>
                  {issue.message}
                </Alert>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <Button variant="primary" onClick={confirm} disabled={!canConfirm}>
              Confirm import
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  )
}
