import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART, SERIES, axisProps } from '@/components/charts/chartTheme'
import type { PlateDailyPoint, PlateLocationInfo, PlatePeriodRow } from '@/plate/analytics'
import type { PlateGrain } from '@/plate/types'
import { formatCount, formatPercent } from '@/utils/format'
import { plateLocationColor } from './colors'

const MISSING_FILL = '#fde68a'
/** Completed reservations: secondary series (first categorical hue). */
const BOOKINGS = SERIES[0]
const count = (v: number) => formatCount(v)

function Box({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">{children}</div>
}

function Row({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <p className="flex items-center gap-2 text-slate-600">
      <span className="inline-block size-2 rounded-full" style={{ background: color }} aria-hidden="true" /> {label}
      <span className="ml-auto pl-3 font-medium tabular-nums text-slate-900">{value}</span>
    </p>
  )
}

/** Daily guests (columns) and completed reservations (line), with markers for days without data. */
export function PlateDailyChart({ daily }: { daily: PlateDailyPoint[] }) {
  const data = daily.map((d) => ({ ...d, gap: d.status === 'complete' ? null : 1 }))
  const hasGaps = data.some((d) => d.gap)
  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="date" {...axisProps} minTickGap={24} />
          <YAxis yAxisId="n" {...axisProps} axisLine={false} allowDecimals={false} width={40} />
          <YAxis yAxisId="gap" orientation="right" hide domain={[0, 1]} />
          <Tooltip
            cursor={{ fill: '#f1f5f9' }}
            content={(p) => {
              const d = p.payload?.[0]?.payload as PlateDailyPoint | undefined
              if (!p.active || !d) return null
              return (
                <Box>
                  <p className="mb-1 font-medium text-slate-900">{d.date}</p>
                  {d.covers === null ? (
                    <p className="text-amber-800">No Plate export imported for this day</p>
                  ) : (
                    <>
                      <Row color={CHART.primary} label="Guests (completed)" value={count(d.covers)} />
                      <Row color={BOOKINGS} label="Completed reservations" value={count(d.completed ?? 0)} />
                      <p className="mt-1 text-slate-500">
                        {count(d.bookings ?? 0)} booking(s){d.cancelled ? ` · ${d.cancelled} cancelled` : ''}
                        {d.declined ? ` · ${d.declined} declined` : ''}
                      </p>
                      {d.missingLocations.length > 0 && <p className="mt-1 text-amber-800">Missing: {d.missingLocations.join(', ')}</p>}
                    </>
                  )}
                </Box>
              )
            }}
          />
          <Bar yAxisId="gap" dataKey="gap" fill={MISSING_FILL} isAnimationActive={false} maxBarSize={14} />
          <Bar yAxisId="n" dataKey="covers" name="Guests" fill={CHART.primary} isAnimationActive={false} radius={[3, 3, 0, 0]} maxBarSize={18} />
          <Line yAxisId="n" type="linear" dataKey="completed" name="Completed reservations" stroke={BOOKINGS} strokeWidth={2} dot={data.length <= 62 ? { r: 2.5, strokeWidth: 0, fill: BOOKINGS } : false} isAnimationActive={false} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: CHART.primary }} aria-hidden="true" /> Guests (completed reservations)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: BOOKINGS }} aria-hidden="true" /> Completed reservations
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: MISSING_FILL }} aria-hidden="true" />
          {hasGaps ? 'Day without imported data (not zero)' : 'No days without imported data in this range'}
        </span>
      </div>
    </div>
  )
}

/** Weekly or monthly guests as columns. */
export function PlatePeriodChart({ periods, grain }: { periods: PlatePeriodRow[]; grain: PlateGrain }) {
  const data = periods.map((p) => ({ ...p, label: grain === 'week' ? p.start : p.key, covers: p.metrics.covers }))
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 20, right: 12, left: 0, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} axisLine={false} allowDecimals={false} width={40} />
        <Tooltip
          cursor={{ fill: '#f1f5f9' }}
          content={(p) => {
            const d = p.payload?.[0]?.payload as PlatePeriodRow | undefined
            if (!p.active || !d) return null
            return (
              <Box>
                <p className="mb-1 font-medium text-slate-900">{d.start === d.end ? d.start : `${d.start} – ${d.end}`}</p>
                <Row color={CHART.primary} label="Guests" value={count(d.metrics.covers)} />
                <Row color={BOOKINGS} label="Completed reservations" value={count(d.metrics.completed)} />
                <p className="mt-1 text-slate-500">
                  {d.daysCovered} of {d.calendarDays} day(s) with data{d.partial ? ' · partial period' : ''}
                </p>
              </Box>
            )
          }}
        />
        <Bar dataKey="covers" name="Guests" fill={CHART.primary} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
          <LabelList dataKey="covers" position="top" style={{ fill: CHART.text, fontSize: 12 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Daily guests per location. */
export function PlateLocationLinesChart({ daily, locations }: { daily: PlateDailyPoint[]; locations: PlateLocationInfo[] }) {
  const data = daily.map((d) => ({ date: d.date, ...d.byLocation }))
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="date" {...axisProps} minTickGap={24} />
        <YAxis {...axisProps} axisLine={false} allowDecimals={false} width={40} />
        <Tooltip
          content={(p) => {
            if (!p.active || !p.label) return null
            const row = p.payload?.[0]?.payload as Record<string, number | null> | undefined
            return (
              <Box>
                <p className="mb-1 font-medium text-slate-900">{p.label}</p>
                {locations.map((l) => {
                  const v = row?.[l.id]
                  return <Row key={l.id} color={plateLocationColor(l)} label={l.label} value={typeof v === 'number' ? `${count(v)} guests` : 'No data'} />
                })}
              </Box>
            )
          }}
        />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: CHART.axis }} />
        {locations.map((l) => (
          <Line key={l.id} isAnimationActive={false} type="linear" dataKey={l.id} name={l.label} stroke={plateLocationColor(l)} strokeWidth={2} dot={false} connectNulls={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

export interface PlateBar {
  key: string
  label: string
  value: number
  share?: number
  color?: string
}

/** Horizontal count bars with value and share. One hue unless colours are given. */
export function PlateBars({ rows, measure, labelWidth = 150 }: { rows: PlateBar[]; measure: string; labelWidth?: number }) {
  const height = Math.max(110, rows.length * 34 + 30)
  const data = rows.map((r) => ({ ...r, tag: `${count(r.value)}${r.share !== undefined ? ` · ${formatPercent(r.share)}` : ''}` }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 96, left: 0, bottom: 0 }} barCategoryGap="26%">
        <CartesianGrid horizontal={false} stroke={CHART.grid} />
        <XAxis type="number" {...axisProps} allowDecimals={false} />
        <YAxis type="category" dataKey="label" {...axisProps} axisLine={false} width={labelWidth} interval={0} />
        <Tooltip
          cursor={{ fill: '#f1f5f9' }}
          content={(p) => {
            const d = p.payload?.[0]?.payload as PlateBar | undefined
            if (!p.active || !d) return null
            return (
              <Box>
                <p className="mb-1 font-medium text-slate-900">{d.label}</p>
                <Row color={d.color ?? CHART.primary} label={measure} value={count(d.value)} />
                {d.share !== undefined && <p className="mt-1 text-slate-500">{formatPercent(d.share)} of the selection</p>}
              </Box>
            )
          }}
        />
        <Bar dataKey="value" name={measure} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
          {data.map((r) => (
            <Cell key={r.key} fill={r.color ?? CHART.primary} />
          ))}
          <LabelList dataKey="tag" position="right" style={{ fill: CHART.text, fontSize: 12 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
