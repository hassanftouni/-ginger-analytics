import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART, SERIES, axisProps } from '@/components/charts/chartTheme'
import { FOODY_CURRENCY } from '@/config/foody'
import type { FoodyBranchInfo, FoodyDailyPoint, FoodyPeriodRow } from '@/foody/analytics'
import type { FoodyGrain } from '@/foody/types'
import { formatCompactMoney, formatCount, formatMoney, formatPercent } from '@/utils/format'
import { foodyBranchColor } from './colors'

const eur = (v: number) => formatMoney(v, FOODY_CURRENCY)
const eurTick = (v: number) => formatCompactMoney(v, FOODY_CURRENCY)
/** Missing-data markers use a neutral warm tint, distinct from every series hue. */
const MISSING_FILL = '#fde68a'
/** Gross sales: the secondary series (first categorical hue — never the brand magenta). */
const GROSS = SERIES[0]

function Box({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">{children}</div>
}

function Swatch({ color }: { color: string }) {
  return <span className="inline-block size-2 rounded-full" style={{ background: color }} aria-hidden="true" />
}

function Line2({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <p className="flex items-center gap-2 text-slate-600">
      <Swatch color={color} /> {label}
      <span className="ml-auto pl-3 font-medium tabular-nums text-slate-900">{value}</span>
    </p>
  )
}

/** Daily net sales (primary) and gross sales, with markers for days without imported data. */
export function FoodyDailyChart({ daily }: { daily: FoodyDailyPoint[] }) {
  const data = daily.map((d) => ({ ...d, gap: d.status === 'complete' ? null : 1 }))
  const hasGaps = data.some((d) => d.gap)
  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="date" {...axisProps} minTickGap={24} />
          <YAxis yAxisId="eur" {...axisProps} axisLine={false} tickFormatter={eurTick} width={80} />
          <YAxis yAxisId="gap" orientation="right" hide domain={[0, 1]} />
          <Tooltip
            cursor={{ stroke: CHART.grid }}
            content={(p) => {
              const d = p.payload?.[0]?.payload as (FoodyDailyPoint & { gap: number | null }) | undefined
              if (!p.active || !d) return null
              return (
                <Box>
                  <p className="mb-1 font-medium text-slate-900">{d.date}</p>
                  {d.net === null ? (
                    <p className="text-amber-800">No Foody data imported for this day</p>
                  ) : (
                    <>
                      <Line2 color={CHART.primary} label="Net sales" value={eur(d.net)} />
                      <Line2 color={GROSS} label="Gross sales" value={eur(d.gross ?? 0)} />
                      <p className="mt-1 text-slate-500">
                        {formatCount(d.orders ?? 0)} valid order(s){d.cancelled ? ` · ${d.cancelled} cancelled` : ''}
                      </p>
                      {d.missingBranches.length > 0 && <p className="mt-1 text-amber-800">Missing: {d.missingBranches.join(', ')}</p>}
                    </>
                  )}
                </Box>
              )
            }}
          />
          <Bar yAxisId="gap" dataKey="gap" name="No imported data" fill={MISSING_FILL} isAnimationActive={false} maxBarSize={14} />
          <Line yAxisId="eur" isAnimationActive={false} type="linear" dataKey="gross" name="Gross sales" stroke={GROSS} strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls={false} />
          <Line
            yAxisId="eur"
            isAnimationActive={false}
            type="linear"
            dataKey="net"
            name="Net sales"
            stroke={CHART.primary}
            strokeWidth={2}
            dot={data.length <= 62 ? { r: 3, strokeWidth: 0, fill: CHART.primary } : false}
            activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: CHART.primary }} aria-hidden="true" /> Net sales (EUR)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: GROSS }} aria-hidden="true" /> Gross sales (EUR)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: MISSING_FILL }} aria-hidden="true" />
          {hasGaps ? 'Day without imported data (not counted as zero)' : 'No days without imported data in this range'}
        </span>
      </div>
    </div>
  )
}

/** Weekly or monthly net sales as columns. */
export function FoodyPeriodChart({ periods, grain }: { periods: FoodyPeriodRow[]; grain: FoodyGrain }) {
  const data = periods.map((p) => ({ ...p, label: grain === 'week' ? p.start : p.key, net: p.metrics.net }))
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} axisLine={false} tickFormatter={eurTick} width={80} />
        <Tooltip
          cursor={{ fill: '#f1f5f9' }}
          content={(p) => {
            const d = p.payload?.[0]?.payload as FoodyPeriodRow | undefined
            if (!p.active || !d) return null
            return (
              <Box>
                <p className="mb-1 font-medium text-slate-900">{d.start === d.end ? d.start : `${d.start} – ${d.end}`}</p>
                {d.daysCovered === 0 ? (
                  <p className="text-amber-800">No Foody data imported</p>
                ) : (
                  <>
                    <Line2 color={CHART.primary} label="Net sales" value={eur(d.metrics.net)} />
                    <Line2 color={GROSS} label="Gross sales" value={eur(d.metrics.gross)} />
                    <p className="mt-1 text-slate-500">
                      {formatCount(d.metrics.validOrders)} order(s) · AOV {d.metrics.aov !== undefined ? eur(d.metrics.aov) : '—'}
                    </p>
                  </>
                )}
                <p className="mt-1 text-slate-500">
                  {d.daysCovered} of {d.calendarDays} day(s) with data{d.partial ? ' · partial period' : ''}
                </p>
              </Box>
            )
          }}
        />
        <Bar isAnimationActive={false} dataKey="net" name="Net sales (EUR)" fill={CHART.primary} radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Net sales of several branches on one daily chart. */
export function FoodyBranchLinesChart({ daily, branches }: { daily: FoodyDailyPoint[]; branches: FoodyBranchInfo[] }) {
  const data = daily.map((d) => ({ date: d.date, ...d.byBranch }))
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="date" {...axisProps} minTickGap={24} />
        <YAxis {...axisProps} axisLine={false} tickFormatter={eurTick} width={80} />
        <Tooltip
          content={(p) => {
            if (!p.active || !p.label) return null
            const row = p.payload?.[0]?.payload as Record<string, number | null> | undefined
            return (
              <Box>
                <p className="mb-1 font-medium text-slate-900">{p.label}</p>
                {branches.map((b) => {
                  const v = row?.[b.key]
                  return <Line2 key={b.key} color={foodyBranchColor(b)} label={b.label} value={typeof v === 'number' ? eur(v) : 'No data'} />
                })}
              </Box>
            )
          }}
        />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: CHART.axis }} />
        {branches.map((b) => (
          <Line key={b.key} isAnimationActive={false} type="linear" dataKey={b.key} name={b.label} stroke={foodyBranchColor(b)} strokeWidth={2} dot={false} connectNulls={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

export interface FoodyBar {
  key: string
  label: string
  value: number
  share?: number
  color: string
  /** Formats the value on the bar and in the tooltip (EUR by default). */
  format?: (v: number) => string
}

/** Horizontal bars with value and share on each bar. */
export function FoodyShareBars({ rows, labelWidth = 170, measure = 'Net sales' }: { rows: FoodyBar[]; labelWidth?: number; measure?: string }) {
  const height = Math.max(120, rows.length * 44 + 30)
  const data = rows.map((r) => ({ ...r, tag: `${(r.format ?? eur)(r.value)}${r.share !== undefined ? ` · ${formatPercent(r.share)}` : ''}` }))
  const money = rows.every((r) => !r.format)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 150, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid horizontal={false} stroke={CHART.grid} />
        <XAxis type="number" {...axisProps} tickFormatter={money ? eurTick : (v: number) => formatCount(v)} />
        <YAxis type="category" dataKey="label" {...axisProps} axisLine={false} width={labelWidth} interval={0} />
        <Tooltip
          cursor={{ fill: '#f1f5f9' }}
          content={(p) => {
            const d = p.payload?.[0]?.payload as FoodyBar | undefined
            if (!p.active || !d) return null
            return (
              <Box>
                <p className="mb-1 font-medium text-slate-900">{d.label}</p>
                <Line2 color={d.color} label={measure} value={(d.format ?? eur)(d.value)} />
                {d.share !== undefined && <p className="mt-1 text-slate-500">{formatPercent(d.share)} of the selection</p>}
              </Box>
            )
          }}
        />
        <Bar isAnimationActive={false} dataKey="value" name={measure} radius={[0, 4, 4, 0]} maxBarSize={24}>
          {data.map((r) => (
            <Cell key={r.key} fill={r.color} />
          ))}
          <LabelList dataKey="tag" position="right" style={{ fill: CHART.text, fontSize: 12 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
