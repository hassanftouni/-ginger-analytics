import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART, axisProps } from '@/components/charts/chartTheme'
import type { TotersBranchInfo, TotersDailyPoint, TotersPeriodRow } from '@/toters/analytics'
import type { TotersGrain } from '@/toters/types'
import { formatCompactMoney, formatMoney, formatPercent } from '@/utils/format'

const usd = (v: number) => formatMoney(v, 'USD')
const usdTick = (v: number) => formatCompactMoney(v, 'USD')
/** Missing-data markers use a neutral warm tint, distinct from every series hue. */
const MISSING_FILL = '#fde68a'

import { branchColor } from './colors'

function Box({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">{children}</div>
}

function Swatch({ color }: { color: string }) {
  return <span className="inline-block size-2 rounded-full" style={{ background: color }} aria-hidden="true" />
}

interface DailyDatum extends TotersDailyPoint {
  /** 1 on days with missing or invalid data — drawn as a marker strip. */
  gap: number | null
}

/** Daily total revenue (USD) with markers for days without complete imported data. */
export function TotersDailyChart({ daily }: { daily: TotersDailyPoint[] }) {
  const data: DailyDatum[] = daily.map((d) => ({ ...d, gap: d.status === 'complete' ? null : 1 }))
  const hasGaps = data.some((d) => d.gap)
  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="date" {...axisProps} minTickGap={24} />
          <YAxis yAxisId="usd" {...axisProps} axisLine={false} tickFormatter={usdTick} width={80} />
          <YAxis yAxisId="gap" orientation="right" hide domain={[0, 1]} />
          <Tooltip
            cursor={{ stroke: CHART.grid }}
            content={(p) => {
              const d = p.payload?.[0]?.payload as DailyDatum | undefined
              if (!p.active || !d) return null
              return (
                <Box>
                  <p className="mb-1 font-medium text-slate-900">{d.date}</p>
                  <p className="flex items-center gap-2 text-slate-600">
                    <Swatch color={CHART.primary} /> Toters revenue (USD)
                    <span className="ml-auto pl-3 font-medium tabular-nums text-slate-900">{d.totalUsd === null ? 'No data imported' : usd(d.totalUsd)}</span>
                  </p>
                  {d.missingBranches.length > 0 && d.totalUsd !== null && <p className="mt-1 text-amber-800">Missing: {d.missingBranches.join(', ')}</p>}
                  {d.invalidBranches.length > 0 && <p className="mt-1 text-red-700">Invalid records: {d.invalidBranches.join(', ')}</p>}
                </Box>
              )
            }}
          />
          <Bar yAxisId="gap" dataKey="gap" name="Missing / incomplete data" fill={MISSING_FILL} isAnimationActive={false} maxBarSize={14} />
          <Line
            yAxisId="usd"
            isAnimationActive={false}
            type="linear"
            dataKey="totalUsd"
            name="Toters revenue (USD)"
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
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: CHART.primary }} aria-hidden="true" /> Toters revenue (USD)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: MISSING_FILL }} aria-hidden="true" />
          {hasGaps ? 'Day with missing or invalid data (not counted as zero)' : 'No days with missing data in this range'}
        </span>
      </div>
    </div>
  )
}

/** Weekly or monthly totals as columns; partial buckets are labelled in the tooltip. */
export function TotersPeriodChart({ periods, grain }: { periods: TotersPeriodRow[]; grain: TotersGrain }) {
  const data = periods.map((p) => ({ ...p, label: grain === 'week' ? `${p.start}` : p.key }))
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} axisLine={false} tickFormatter={usdTick} width={80} />
        <Tooltip
          cursor={{ fill: '#f1f5f9' }}
          content={(p) => {
            const d = p.payload?.[0]?.payload as TotersPeriodRow | undefined
            if (!p.active || !d) return null
            return (
              <Box>
                <p className="mb-1 font-medium text-slate-900">{d.start === d.end ? d.start : `${d.start} – ${d.end}`}</p>
                <p className="flex items-center gap-2 text-slate-600">
                  <Swatch color={CHART.primary} /> Toters revenue (USD)
                  <span className="ml-auto pl-3 font-medium tabular-nums text-slate-900">{d.daysWithData > 0 ? usd(d.revenueUsd) : 'No data imported'}</span>
                </p>
                <p className="mt-1 text-slate-500">
                  {d.daysWithData} of {d.calendarDays} day(s) with data{d.partial ? ' · partial period' : ''}
                </p>
              </Box>
            )
          }}
        />
        <Bar isAnimationActive={false} dataKey="revenueUsd" name="Toters revenue (USD)" fill={CHART.primary} radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Several branches on one daily chart. Each branch keeps its registry colour on every chart. */
export function TotersBranchLinesChart({ daily, branches }: { daily: TotersDailyPoint[]; branches: TotersBranchInfo[] }) {
  const data = daily.map((d) => ({ date: d.date, ...d.byBranch }))
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="date" {...axisProps} minTickGap={24} />
        <YAxis {...axisProps} axisLine={false} tickFormatter={usdTick} width={80} />
        <Tooltip
          content={(p) => {
            if (!p.active || !p.label) return null
            const row = p.payload?.[0]?.payload as Record<string, number | null> | undefined
            return (
              <Box>
                <p className="mb-1 font-medium text-slate-900">{p.label}</p>
                {branches.map((b) => {
                  const v = row?.[b.key]
                  return (
                    <p key={b.key} className="flex items-center gap-2 text-slate-600">
                      <Swatch color={branchColor(b)} /> {b.label}
                      <span className="ml-auto pl-3 font-medium tabular-nums text-slate-900">{typeof v === 'number' ? usd(v) : 'No data'}</span>
                    </p>
                  )
                })}
              </Box>
            )
          }}
        />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: CHART.axis }} />
        {branches.map((b) => (
          <Line
            key={b.key}
            isAnimationActive={false}
            type="linear"
            dataKey={b.key}
            name={b.label}
            stroke={branchColor(b)}
            strokeWidth={2}
            dot={data.length <= 31 ? { r: 2.5, strokeWidth: 0, fill: branchColor(b) } : false}
            activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
            connectNulls={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

export interface ShareBar {
  key: string
  label: string
  value: number
  share?: number
  color: string
}

/** Horizontal revenue bars with value and share of total on each bar. */
export function TotersShareBars({ rows, labelWidth = 170 }: { rows: ShareBar[]; /** Space for category labels — smaller in narrow panels. */ labelWidth?: number }) {
  const height = Math.max(120, rows.length * 44 + 30)
  // Narrow panels show a compact value on the bar; the exact amount is in the tooltip.
  const compact = labelWidth < 120
  const data = rows.map((r) => ({ ...r, tag: `${compact ? usdTick(r.value) : usd(r.value)}${r.share !== undefined ? ` · ${formatPercent(r.share)}` : ''}` }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: compact ? 128 : 150, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid horizontal={false} stroke={CHART.grid} />
        <XAxis type="number" {...axisProps} tickFormatter={usdTick} />
        <YAxis type="category" dataKey="label" {...axisProps} axisLine={false} width={labelWidth} interval={0} />
        <Tooltip
          cursor={{ fill: '#f1f5f9' }}
          content={(p) => {
            const d = p.payload?.[0]?.payload as ShareBar | undefined
            if (!p.active || !d) return null
            return (
              <Box>
                <p className="mb-1 font-medium text-slate-900">{d.label}</p>
                <p className="flex items-center gap-2 text-slate-600">
                  <Swatch color={d.color} /> Toters revenue (USD)
                  <span className="ml-auto pl-3 font-medium tabular-nums text-slate-900">{usd(d.value)}</span>
                </p>
                {d.share !== undefined && <p className="mt-1 text-slate-500">{formatPercent(d.share)} of Toters revenue in this selection</p>}
              </Box>
            )
          }}
        />
        <Bar isAnimationActive={false} dataKey="value" name="Toters revenue (USD)" radius={[0, 4, 4, 0]} maxBarSize={24}>
          {data.map((r) => (
            <Cell key={r.key} fill={r.color} />
          ))}
          <LabelList dataKey="tag" position="right" style={{ fill: CHART.text, fontSize: 12 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
