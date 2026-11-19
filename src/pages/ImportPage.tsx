import { FileSpreadsheet, History } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ImportWorkbench } from '@/components/import/ImportWorkbench'
import { FOODY_IDENTICAL_MESSAGE, FoodyImportPanel } from '@/components/foody/FoodyImportPanel'
import { TotersImportPanel } from '@/components/toters/TotersImportPanel'
import { PLATE_IDENTICAL_MESSAGE, PlateImportPanel } from '@/components/plate/PlateImportPanel'
import { planPlateImport } from '@/plate/merge'
import { checkPlateTarget, detectPlate, parsePlate } from '@/plate/parse'
import { usePlateStore } from '@/state/plateStore'
import { JobList } from '@/components/import/JobList'
import { MultiFileDropzone } from '@/components/import/MultiFileDropzone'
import { Alert } from '@/components/ui/Alert'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { DEFAULT_PARSE_OPTIONS, configureFromFile, type ImportJob } from '@/import/job'
import { readFile } from '@/parsers'
import { planFoodyImport } from '@/foody/merge'
import { detectFoody, parseFoody } from '@/foody/parse'
import { useFoodyStore } from '@/state/foodyStore'
import { useTotersStore } from '@/state/totersStore'
import { planTotersImport } from '@/toters/merge'
import { detectToters, parseToters, resolveStores, type TotersParseResult } from '@/toters/parse'
import type { TotersState } from '@/toters/types'

/** A Toters file whose rows are all already stored with identical values is skipped without review. */
function identicalToStored(parsed: TotersParseResult, state: TotersState): boolean {
  const r = resolveStores(parsed)
  if (r.stores.length === 0 || [...parsed.issues, ...r.issues].some((i) => i.level === 'error')) return false
  return planTotersImport(state, r.stores).kind === 'identical'
}
import { hrefFor } from '@/hooks/useHashRoute'
import { useDataStore } from '@/state/dataStore'

export function ImportPage() {
  const { persistDatasets, storageError } = useDataStore()
  const [jobs, setJobs] = useState<ImportJob[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { state: totersState } = useTotersStore()
  const totersRef = useRef(totersState)
  useEffect(() => {
    totersRef.current = totersState
  }, [totersState])
  const { state: foodyState } = useFoodyStore()
  const foodyRef = useRef(foodyState)
  useEffect(() => {
    foodyRef.current = foodyState
  }, [foodyState])
  const { state: plateState } = usePlateStore()
  const plateRef = useRef(plateState)
  useEffect(() => {
    plateRef.current = plateState
  }, [plateState])

  const patchJob = (id: string, patch: Partial<ImportJob>) => setJobs((current) => current.map((j) => (j.id === id ? { ...j, ...patch } : j)))

  const addFiles = (files: File[]) => {
    // Nothing is carried over between files: brand, currency and period are chosen per file.
    const created: ImportJob[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      state: 'reading',
      sheetIndex: 0,
      headerRow: 1,
      metadata: {},
      mapping: {},
      parseOptions: DEFAULT_PARSE_OPTIONS,
      saveTemplate: true,
    }))
    setJobs((current) => [...current, ...created])
    // Always move to the first new file, so the form being edited is the file just added.
    if (created[0]) setSelectedId(created[0].id)

    for (const job of created) {
      readFile(job.file)
        .then((raw) => {
          // Plate reservation exports go to the separate Plate importer; they never become sales data.
          const plateDetection = detectPlate(raw)
          if (plateDetection) {
            const plate = parsePlate(raw, plateDetection)
            const f = plate.fileNameInfo
            const ready = f.locationId && f.periodStart && f.periodEnd && ![...plate.issues, ...checkPlateTarget(plate, f.locationId, f.periodStart, f.periodEnd)].some((i) => i.level === 'error')
            const identical = ready && planPlateImport(plateRef.current, plate, { locationId: f.locationId!, periodStart: f.periodStart!, periodEnd: f.periodEnd! }).kind === 'identical'
            return patchJob(job.id, identical ? { raw, plate, state: 'skipped', plateResult: { kind: 'skipped', message: PLATE_IDENTICAL_MESSAGE } } : { raw, plate, state: 'ready' })
          }
          // Foody exports go to the separate Foody importer; they never become Weevi datasets.
          const foodyDetection = detectFoody(raw)
          if (foodyDetection) {
            const foody = parseFoody(raw, foodyDetection)
            const identical = !foody.issues.some((i) => i.level === 'error') && planFoodyImport(foodyRef.current, foody).kind === 'identical'
            return patchJob(job.id, identical ? { raw, foody, state: 'skipped', foodyResult: { kind: 'skipped', message: FOODY_IDENTICAL_MESSAGE } } : { raw, foody, state: 'ready' })
          }
          // Toters exports go to the separate Toters importer; they never become Weevi datasets.
          const detection = detectToters(raw)
          if (!detection) return patchJob(job.id, configureFromFile(raw))
          const toters = parseToters(raw, detection)
          if (identicalToStored(toters, totersRef.current)) {
            patchJob(job.id, { raw, toters, state: 'skipped', totersResult: { kind: 'skipped', entries: [], message: 'Identical to data already imported for every branch in the file — skipped automatically, nothing changed. If that import is excluded, include it again in Toters import history.' } })
          } else {
            patchJob(job.id, { raw, state: 'ready', toters })
          }
        })
        .catch((error: unknown) => patchJob(job.id, { state: 'failed', error: error instanceof Error ? error.message : 'The file could not be read.' }))
    }
  }

  const removeJob = (id: string) => {
    setJobs((current) => current.filter((j) => j.id !== id))
    if (selectedId === id) setSelectedId(jobs.find((j) => j.id !== id)?.id ?? null)
  }

  const selected = jobs.find((j) => j.id === selectedId)
  const nextPending = (afterId: string) => jobs.find((j) => j.id !== afterId && j.state === 'ready')?.id

  return (
    <>
      <PageHeader
        title="Import data"
        description="Upload Weevi, Toters, Foody and Plate exports. All are recognised from their headers — Toters files go to the separate Toters analytics, Foody (Cyprus, EUR) files to Foody analytics and Plate reservation CSVs to Plate reservations. Everything stays in your browser."
        actions={
          <a href={hrefFor('/history')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            <History className="size-4" aria-hidden="true" /> Import history
          </a>
        }
      />

      {storageError && (
        <Alert level="warning" className="mb-4" title="Local storage unavailable">
          {storageError} Imports will work for this session only.
        </Alert>
      )}
      {!persistDatasets && (
        <Alert level="info" className="mb-6">
          Imported data is kept for this browser session only. To keep it on this device between visits, turn on local storage in Import history.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        <div className="space-y-4 xl:col-span-1">
          <MultiFileDropzone onFiles={addFiles} />
          <JobList jobs={jobs} selectedId={selectedId} onSelect={setSelectedId} onRemove={removeJob} />
        </div>

        <div className="xl:col-span-3">
          {!selected ? (
            <Panel>
              <EmptyState icon={FileSpreadsheet} title="No file selected" description="Add one or more exports. Each file is described, mapped and confirmed separately." />
            </Panel>
          ) : selected.state === 'reading' ? (
            <Panel>
              <EmptyState icon={FileSpreadsheet} title={`Reading ${selected.file.name}…`} description="Large workbooks can take a few seconds." />
            </Panel>
          ) : selected.state === 'failed' ? (
            <Alert level="error" title={`“${selected.file.name}” could not be read`}>
              {selected.error}
            </Alert>
          ) : selected.plate ? (
            <PlateImportPanel
              key={selected.id}
              file={selected.file}
              parsed={selected.plate}
              done={selected.plateResult}
              onDone={(result) => {
                patchJob(selected.id, { state: result.kind, plateResult: result })
                const next = nextPending(selected.id)
                if (next) setSelectedId(next)
              }}
              onCancel={() => removeJob(selected.id)}
            />
          ) : selected.foody ? (
            <FoodyImportPanel
              key={selected.id}
              file={selected.file}
              parsed={selected.foody}
              done={selected.foodyResult}
              onDone={(result) => {
                patchJob(selected.id, { state: result.kind, foodyResult: result })
                const next = nextPending(selected.id)
                if (next) setSelectedId(next)
              }}
              onCancel={() => removeJob(selected.id)}
            />
          ) : selected.toters ? (
            <TotersImportPanel
              key={selected.id}
              file={selected.file}
              parsed={selected.toters}
              done={selected.totersResult}
              onDone={(result) => {
                patchJob(selected.id, { state: result.kind, totersResult: result })
                const next = nextPending(selected.id)
                if (next) setSelectedId(next)
              }}
              onCancel={() => removeJob(selected.id)}
            />
          ) : (
            <ImportWorkbench
              key={selected.id}
              job={selected}
              onChange={(patch) => patchJob(selected.id, patch)}
              onImported={() => {
                patchJob(selected.id, { state: 'imported' })
                const next = nextPending(selected.id)
                if (next) setSelectedId(next)
              }}
            />
          )}
        </div>
      </div>
    </>
  )
}
