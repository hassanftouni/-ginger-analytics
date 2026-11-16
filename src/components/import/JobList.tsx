import { CircleAlert, CircleCheck, FileSpreadsheet, Loader2, X } from 'lucide-react'
import type { ImportJob } from '@/import/job'
import { cn, formatFileSize } from '@/utils/format'

interface JobListProps {
  jobs: ImportJob[]
  selectedId: string | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
}

const STATUS: Record<ImportJob['state'], string> = {
  reading: 'Reading…',
  ready: 'Needs review',
  failed: 'Could not read',
  imported: 'Imported',
  skipped: 'Skipped — identical',
}

export function JobList({ jobs, selectedId, onSelect, onRemove }: JobListProps) {
  if (jobs.length === 0) return null
  return (
    <ul className="space-y-1.5">
      {jobs.map((job) => {
        const Icon = job.state === 'reading' ? Loader2 : job.state === 'failed' ? CircleAlert : job.state === 'imported' || job.state === 'skipped' ? CircleCheck : FileSpreadsheet
        return (
          <li key={job.id}>
            <div
              className={cn(
                'flex items-center gap-3 rounded-lg border px-3 py-2',
                job.id === selectedId ? 'border-accent-500 bg-accent-50' : 'border-slate-200 bg-white hover:bg-slate-50',
              )}
            >
              <button type="button" onClick={() => onSelect(job.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Icon
                  className={cn(
                    'size-4 shrink-0',
                    job.state === 'reading' && 'animate-spin text-slate-400',
                    job.state === 'failed' && 'text-red-600',
                    job.state === 'imported' && 'text-emerald-600',
                    job.state === 'skipped' && 'text-slate-400',
                    job.state === 'ready' && 'text-accent-600',
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-800">{job.file.name}</span>
                  <span className="block text-xs text-slate-500">
                    {formatFileSize(job.file.size)}{job.toters ? ' · Toters' : job.foody ? ' · Foody' : ''} · {STATUS[job.state]}
                  </span>
                </span>
              </button>
              <button type="button" onClick={() => onRemove(job.id)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Remove ${job.file.name} from the queue`}>
                <X className="size-4" />
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
