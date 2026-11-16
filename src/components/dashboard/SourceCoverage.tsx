import { CircleCheck, CircleDashed } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Panel } from '@/components/ui/Panel'
import { BRANDS, PLATFORMS, allSources, type BrandId, type PlatformId } from '@/config/brands'
import { CATEGORIES } from '@/config/categories'
import { useDataStore } from '@/state/dataStore'

interface SourceCoverageProps {
  brandId?: BrandId
  platformId?: PlatformId
  className?: string
}

/** Which configured sources have included datasets, and of which report types. */
export function SourceCoverage({ brandId, platformId, className }: SourceCoverageProps) {
  const { datasets } = useDataStore()
  const sources = allSources().filter((s) => (!brandId || s.brandId === brandId) && (!platformId || s.platformId === platformId))

  return (
    <Panel title="Data sources" description="Included datasets per brand and platform" className={className}>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {sources.map((s) => {
          const files = datasets.filter((d) => d.included && d.metadata.brandId === s.brandId && d.metadata.platformId === s.platformId)
          const types = [...new Set(files.map((d) => CATEGORIES[d.metadata.category].name))]
          return (
            <li key={`${s.brandId}-${s.platformId}`} className="flex items-center gap-3 px-4 py-3">
              {files.length > 0 ? <CircleCheck className="size-4 shrink-0 text-emerald-600" aria-hidden="true" /> : <CircleDashed className="size-4 shrink-0 text-slate-300" aria-hidden="true" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">
                  {brandId ? PLATFORMS[s.platformId].name : `${BRANDS[s.brandId].name} · ${PLATFORMS[s.platformId].name}`}
                  <span className="ml-2 text-xs font-normal text-slate-500">{s.country}</span>
                </p>
                <p className="truncate text-xs text-slate-500">{types.length > 0 ? types.join(', ') : 'No exports imported'}</p>
              </div>
              <Badge tone={files.length > 0 ? 'success' : 'neutral'}>
                {files.length} file{files.length === 1 ? '' : 's'}
              </Badge>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
