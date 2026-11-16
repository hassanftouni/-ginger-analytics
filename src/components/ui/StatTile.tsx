import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { formatSignedPercent } from '@/utils/format'

interface StatTileProps {
  label: string
  /** Formatted value. Omit when the metric cannot be calculated from imported data. */
  value?: string
  hint?: string
  /** Change versus the previous period, as a ratio. */
  change?: number
  changeLabel?: string
}

/**
 * KPI tile. Without a value it renders an explicit "not available" state rather than a
 * zero, so an absent metric is never mistaken for a real result.
 */
export function StatTile({ label, value, hint, change, changeLabel = 'vs previous period' }: StatTileProps) {
  const hasValue = value !== undefined
  const ChangeIcon = change === undefined ? null : change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus
  const tone = change === undefined || change === 0 ? 'text-slate-600 bg-slate-100' : change > 0 ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={hasValue ? 'mt-2 truncate text-2xl font-semibold tabular-nums text-slate-900' : 'mt-2 text-2xl font-semibold text-slate-300'} title={value}>
        {hasValue ? value : '—'}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {ChangeIcon && change !== undefined && (
          <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-medium ${tone}`}>
            <ChangeIcon className="size-3" aria-hidden="true" />
            {formatSignedPercent(change)}
            <span className="sr-only"> {changeLabel}</span>
          </span>
        )}
        <span>{hint ?? (hasValue ? (change !== undefined ? changeLabel : '') : 'Not available in imported data')}</span>
      </div>
    </div>
  )
}
