import { Upload } from 'lucide-react'
import { BRANDS, PLATFORMS } from '@/config/brands'
import { hrefFor } from '@/hooks/useHashRoute'
import { useDataStore } from '@/state/dataStore'
import type { AnalyticsResult } from '@/types/analytics'

/** Explains an empty dashboard: nothing imported at all, or nothing matching the filters. */
export function NoDataBanner({ result }: { result: AnalyticsResult }) {
  const { datasets } = useDataStore()
  if (result.records.length > 0) return null
  const nothingImported = datasets.length === 0
  // A brand with no Weevi datasets at all: say so explicitly (Toters and Foody data are reported separately).
  const brandId = result.filters.brandId
  const brandWithoutApp = !nothingImported && brandId !== 'all' && !datasets.some((d) => d.metadata.brandId === brandId && !PLATFORMS[d.metadata.platformId]?.separate)
  if (brandWithoutApp) {
    return (
      <div className="mb-6 flex flex-col items-start gap-3 rounded-xl border border-accent-100 bg-accent-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-900">App data not imported</p>
          <p className="text-xs text-slate-600">No Weevi exports have been imported for {BRANDS[brandId].name}. Toters revenue is reported separately in Toters analytics and is not shown here.</p>
        </div>
        <a href={hrefFor('/import')} className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-accent-700">
          <Upload className="size-4" aria-hidden="true" /> Import data
        </a>
      </div>
    )
  }
  return (
    <div className="mb-6 flex flex-col items-start gap-3 rounded-xl border border-accent-100 bg-accent-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-slate-900">{nothingImported ? 'No data imported yet' : 'No data matches the current filters'}</p>
        <p className="text-xs text-slate-600">
          {nothingImported
            ? 'Import Weevi exports to see app metrics (Toters and Foody have their own analytics). Nothing is estimated or filled in.'
            : 'Adjust the filters, or import exports covering this selection.'}
        </p>
      </div>
      {nothingImported && (
        <a href={hrefFor('/import')} className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-accent-700">
          <Upload className="size-4" aria-hidden="true" /> Import data
        </a>
      )}
    </div>
  )
}
