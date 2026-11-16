import { CircleCheck, CircleMinus, Download, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { InsightsPanel } from '@/components/dashboard/InsightsPanel'
import { KpiRow } from '@/components/dashboard/KpiRow'
import { NoDataBanner } from '@/components/dashboard/NoDataBanner'
import { QualityPanel } from '@/components/dashboard/QualityPanel'
import { BranchViewToggle } from '@/components/filters/BranchViewToggle'
import { GlobalFilterBar } from '@/components/filters/GlobalFilterBar'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/FormControls'
import { PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { describeFilters } from '@/export/describe'
import { buildAnalyticalWorkbook, downloadWorkbook, plannedSheets } from '@/export/workbook'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useDataStore } from '@/state/dataStore'
import { hrefFor } from '@/hooks/useHashRoute'

const DEFAULT_TITLE = 'Ginger & Co / Pertutti — Analytical Report'

export function ReportsPage() {
  const result = useAnalytics()
  const { settings } = useDataStore()
  const [title, setTitle] = useState(DEFAULT_TITLE)
  const [includeNames, setIncludeNames] = useState(false)
  const [status, setStatus] = useState<{ kind: 'idle' | 'working' | 'done' | 'error'; message?: string }>({ kind: 'idle' })
  const sheets = plannedSheets(result)
  const canExport = result.records.length > 0
  const warnings = result.quality.filter((q) => q.level !== 'info').length

  const handleExport = async () => {
    setStatus({ kind: 'working' })
    try {
      const generatedAt = new Date()
      const wb = await buildAnalyticalWorkbook(result, { title: title.trim() || DEFAULT_TITLE, generatedAt, settings, includeCustomerNames: includeNames })
      const stamp = generatedAt.toISOString().slice(0, 10)
      await downloadWorkbook(wb, `analytical-report-${stamp}.xlsx`)
      setStatus({ kind: 'done', message: `Downloaded analytical-report-${stamp}.xlsx with ${wb.worksheets.length} sheets.` })
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'The report could not be generated.' })
    }
  }

  return (
    <>
      <PageHeader title="Report generator" description="Set the scope with the filters, review the figures, then export a formatted Excel report calculated from your data." />
      <Alert level="info" className="mb-4">
        This report covers Weevi data only. Toters revenue is reported separately — use <a href={hrefFor('/platforms/toters')} className="font-medium underline">Toters analytics → Export Toters report</a>. Foody (Cyprus, EUR) has its own report — use <a href={hrefFor('/platforms/foody')} className="font-medium underline">Foody analytics → Export Foody report</a>.
      </Alert>
      <GlobalFilterBar />
      <NoDataBanner result={result} />

      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Analytical Excel report" className="xl:col-span-2">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium text-slate-700">Branch view in the report</span>
              <BranchViewToggle />
            </div>
            <Field label="Report title" htmlFor="report-title">
              <TextInput id="report-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-500">Scope</dt>
                <dd className="font-medium text-slate-800">{describeFilters(result.filters)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Date range</dt>
                <dd className="font-medium text-slate-800">{result.dateRange ? `${result.dateRange.start} → ${result.dateRange.end}` : 'All available dates'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Datasets</dt>
                <dd className="font-medium text-slate-800">{result.datasetsInScope.length}</dd>
              </div>
            </dl>
            {result.customers.count > 0 && (
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-0.5 size-4 rounded border-slate-300" checked={includeNames} onChange={(e) => setIncludeNames(e.target.checked)} />
                <span>
                  Include customer names (personal data)
                  <span className="block text-xs text-slate-500">Off by default — customers appear as anonymised IDs in management reports.</span>
                </span>
              </label>
            )}
            {includeNames && <Alert level="warning">The workbook will contain customer names. Share it only with people authorised to see personal data.</Alert>}
            {warnings > 0 && (
              <Alert level="warning">
                The data has {warnings} quality warning(s) for this selection. They are listed below and in the report's Data Quality sheet.
              </Alert>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" onClick={handleExport} disabled={!canExport || status.kind === 'working'}>
                {status.kind === 'working' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
                Export Analytical Report
              </Button>
              <span className="text-xs text-slate-500">{canExport ? 'Generated in your browser with ExcelJS.' : 'Import data in this scope to enable the export.'}</span>
            </div>
            {status.kind === 'done' && <Alert level="info">{status.message}</Alert>}
            {status.kind === 'error' && <Alert level="error" title="Export failed">{status.message}</Alert>}
          </div>
        </Panel>

        <Panel title="Workbook contents" description="Sheets are only created when supporting data exists">
          <ul className="space-y-2">
            {sheets.map((s, i) => (
              <li key={s.name} className="flex items-start gap-2 text-sm">
                {s.included ? (
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="Included" />
                ) : (
                  <CircleMinus className="mt-0.5 size-4 shrink-0 text-slate-300" aria-label="Not included" />
                )}
                <div>
                  <p className={s.included ? 'font-medium text-slate-800' : 'text-slate-400'}>
                    {i + 1}. {s.name}
                  </p>
                  {!s.included && s.reason && <p className="text-xs text-slate-400">{s.reason}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-slate-900">Preview</h2>
      <KpiRow result={result} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <InsightsPanel insights={result.insights} />
        <QualityPanel items={result.quality} />
      </div>
    </>
  )
}
