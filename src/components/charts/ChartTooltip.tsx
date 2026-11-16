interface TooltipEntry {
  name?: string | number
  value?: number | string | readonly (number | string)[]
  color?: string
}

interface ChartTooltipProps {
  active?: boolean
  label?: string | number
  payload?: readonly TooltipEntry[]
  formatValue: (value: number) => string
}

/** Tooltip rendered with text tokens; a colour swatch carries series identity. */
export function ChartTooltip({ active, label, payload, formatValue }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-slate-900">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-2 text-slate-600">
          <span className="inline-block size-2 rounded-full" style={{ background: entry.color }} aria-hidden="true" />
          <span>{entry.name}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums text-slate-900">{typeof entry.value === 'number' ? formatValue(entry.value) : '—'}</span>
        </p>
      ))}
    </div>
  )
}
