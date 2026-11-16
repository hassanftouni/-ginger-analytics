/**
 * Foody analytics (EUR). Works only on Foody orders — Weevi and Toters data are never read here,
 * and Foody figures are never passed to their engines.
 *
 * A date is "covered" for a branch when an included import's period (first to last order date
 * in the file) contains it. A covered date without orders is a real zero; a date outside every
 * imported period is missing and never shown as zero.
 */
import { BRANDS, BRAND_LIST, type BrandId } from '@/config/brands'
import { FOODY_CURRENCY, FOODY_RULES, FOODY_STORES, foodyBranchKey } from '@/config/foody'
import { controlTotals, orderNet } from './parse'
import type { FoodyControlTotals, FoodyFilters, FoodyGrain, FoodyImport, FoodyOrder, FoodyState } from './types'

const included = (i: FoodyImport) => i.included !== false

export interface FoodyBranchInfo {
  key: string
  brandId: BrandId
  branch: string
  storeId: string
  label: string
  /** Fixed position in the store registry — gives each branch a consistent colour. */
  index: number
}

export const foodyBranchLabel = (brandId: BrandId, branch: string) => `${BRANDS[brandId].name} — ${branch}`

export const FOODY_BRANCHES: FoodyBranchInfo[] = FOODY_STORES.map((s, index) => ({
  key: foodyBranchKey(s.brandId, s.branch),
  brandId: s.brandId,
  branch: s.branch,
  storeId: s.storeId,
  label: foodyBranchLabel(s.brandId, s.branch),
  index,
}))

export const FOODY_BRANDS: BrandId[] = BRAND_LIST.filter((b) => FOODY_STORES.some((s) => s.brandId === b.id)).map((b) => b.id)

export function foodyBranchOptions(brandId: FoodyFilters['brandId']): FoodyBranchInfo[] {
  return FOODY_BRANCHES.filter((b) => brandId === 'all' || b.brandId === brandId)
}

/** Sales figures for a set of orders. Only valid orders count towards sales, orders and AOV. */
export interface FoodyMetrics {
  validOrders: number
  gross: number
  discount: number
  voucher: number
  net: number
  /** Net ÷ valid orders; undefined without valid orders. */
  aov?: number
  /** Valid orders with a discount or voucher. */
  promoOrders: number
  /** (Discount + voucher) ÷ gross. */
  promoRate?: number
  cancelledOrders: number
  /** Subtotal of cancelled orders — lost sales, never part of revenue. */
  cancelledSubtotal: number
  /** Cancelled ÷ (valid + cancelled). */
  cancellationRate?: number
  otherOrders: number
  complaints: number
  minOrderFees: number
  packaging: number
}

export function metricsOf(orders: FoodyOrder[]): FoodyMetrics {
  const valid = orders.filter((o) => o.outcome === 'valid')
  const cancelled = orders.filter((o) => o.outcome === 'cancelled')
  const sum = (list: FoodyOrder[], f: (o: FoodyOrder) => number) => list.reduce((a, o) => a + f(o), 0)
  const gross = sum(valid, (o) => o.subtotal)
  const discount = sum(valid, (o) => o.discount)
  const voucher = sum(valid, (o) => o.voucher)
  const net = sum(valid, orderNet)
  const decided = valid.length + cancelled.length
  return {
    validOrders: valid.length,
    gross,
    discount,
    voucher,
    net,
    aov: valid.length > 0 ? net / valid.length : undefined,
    promoOrders: valid.filter((o) => o.discount !== 0 || o.voucher !== 0).length,
    promoRate: gross !== 0 ? (discount + voucher) / gross : undefined,
    cancelledOrders: cancelled.length,
    cancelledSubtotal: sum(cancelled, (o) => o.subtotal),
    cancellationRate: decided > 0 ? cancelled.length / decided : undefined,
    otherOrders: orders.filter((o) => o.outcome === 'other').length,
    complaints: valid.filter((o) => o.hasComplaint).length,
    minOrderFees: sum(valid, (o) => o.minOrderFee ?? 0),
    packaging: sum(valid, (o) => o.packaging ?? 0),
  }
}

export interface FoodyDailyPoint {
  date: string
  /** Null when no selected branch has imported data for the date. */
  net: number | null
  gross: number | null
  orders: number | null
  discount: number | null
  voucher: number | null
  cancelled: number | null
  byBranch: Record<string, number | null>
  status: 'complete' | 'partial' | 'missing'
  missingBranches: string[]
}

export interface FoodyPeriodRow {
  key: string
  start: string
  end: string
  metrics: FoodyMetrics
  daysCovered: number
  calendarDays: number
  /** Bucket cut by the date range, or with days without imported data. */
  partial: boolean
  /** Net sales change versus the previous bucket. */
  change?: number
}

export interface FoodyBranchRow {
  info: FoodyBranchInfo
  metrics: FoodyMetrics
  /** Share of net sales in the selection. */
  share?: number
  daysCovered: number
  daysWithOrders: number
  missingDays: number
  best?: { date: string; net: number }
}

export interface FoodyMixRow {
  label: string
  orders: number
  net: number
  share?: number
}

export interface FoodyItemRow {
  name: string
  quantity: number
  orders: number
}

export interface FoodyComparison {
  mode: 'previous' | 'custom'
  current: { start: string; end: string; metrics: FoodyMetrics; daysCovered: number; calendarDays: number }
  baseline: { start: string; end: string; metrics: FoodyMetrics; daysCovered: number; calendarDays: number }
  /** Relative change per metric (undefined when the baseline is zero or missing). */
  change: Partial<Record<'net' | 'gross' | 'validOrders' | 'aov' | 'discount' | 'voucher' | 'promoOrders' | 'cancelledOrders' | 'complaints', number>>
  /** Percentage-point change of rates. */
  pointChange: Partial<Record<'promoRate' | 'cancellationRate', number>>
  /** Baseline has days without imported data — the comparison is not like for like. */
  baselineIncomplete: boolean
  currentIncomplete: boolean
}

export interface FoodyQualityItem {
  level: 'error' | 'warning' | 'info'
  message: string
}

export interface FoodyReconciliation {
  importId: string
  fileName: string
  control: FoodyControlTotals
  stored: FoodyControlTotals
  matches: boolean
  /** Orders from the file whose stored values now come from another import. */
  suppliedElsewhere: number
}

export interface FoodyAnalytics {
  filters: FoodyFilters
  currency: string
  branches: FoodyBranchInfo[]
  range?: { start: string; end: string }
  calendar: string[]
  totals: FoodyMetrics & { daysCovered: number; calendarDays: number; daysWithOrders: number; missingBranchDays: number; averageDailyNet?: number }
  daily: FoodyDailyPoint[]
  periods: FoodyPeriodRow[]
  branchRows: FoodyBranchRow[]
  highestBranch?: FoodyBranchRow
  extremes?: { highest: { date: string; net: number }; lowest: { date: string; net: number } }
  comparison?: FoodyComparison
  mix: { deliveryType: FoodyMixRow[]; paymentType: FoodyMixRow[]; paymentMethod: FoodyMixRow[]; pro: FoodyMixRow[] }
  items: { rows: FoodyItemRow[]; unparsed: number; ordersWithItems: number }
  cancellations: { orders: FoodyOrder[]; byReason: { label: string; orders: number; subtotal: number }[]; byOwner: { label: string; orders: number; subtotal: number }[] }
  complaints: { orders: FoodyOrder[]; byReason: { label: string; orders: number }[] }
  /** Orders in range and scope (all outcomes), for drill-down and export. */
  orders: FoodyOrder[]
  reconciliation: FoodyReconciliation[]
  imports: FoodyImport[]
  allImports: FoodyImport[]
  quality: FoodyQualityItem[]
  hasData: boolean
}

const DAY = 86400000
const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function dateSpan(start: string, end: string): string[] {
  const out: string[] = []
  for (let t = toMs(start); t <= toMs(end); t += DAY) out.push(fromMs(t))
  return out
}

export const addDays = (iso: string, days: number) => fromMs(toMs(iso) + days * DAY)

/** Monday of the ISO week. */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

function bucketOf(date: string, grain: FoodyGrain): { key: string; start: string; end: string } {
  if (grain === 'week') {
    const start = weekStart(date)
    return { key: start, start, end: addDays(start, 6) }
  }
  if (grain === 'month') {
    const [y, m] = date.split('-').map(Number)
    return { key: date.slice(0, 7), start: `${date.slice(0, 7)}-01`, end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) }
  }
  return { key: date, start: date, end: date }
}

/**
 * Split an "Order items" text into items. Commas inside […] belong to modifiers
 * ("1 Salmon poke bowl [1 With rice]"); modifiers are not counted as items.
 */
export function parseItems(textValue: string): { items: { name: string; quantity: number }[]; unparsed: number } {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of textValue) {
    if (ch === '[') depth++
    if (ch === ']') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else current += ch
  }
  parts.push(current)
  const items: { name: string; quantity: number }[] = []
  let unparsed = 0
  for (const raw of parts) {
    const part = raw.trim()
    if (!part) continue
    const m = /^(\d+)\s*[x×]?\s+(.+?)\s*(\[.*\])?$/i.exec(part)
    if (!m || !m[2].trim()) {
      unparsed++
      continue
    }
    items.push({ name: m[2].trim(), quantity: Number(m[1]) })
  }
  return { items, unparsed }
}

const ratio = (a: number | undefined, b: number | undefined) => (a === undefined || b === undefined || b === 0 ? undefined : (a - b) / Math.abs(b))

function mixOf(orders: FoodyOrder[], key: (o: FoodyOrder) => string | undefined): FoodyMixRow[] {
  const valid = orders.filter((o) => o.outcome === 'valid')
  const map = new Map<string, FoodyMixRow>()
  for (const o of valid) {
    const label = key(o) ?? 'Not stated'
    const row = map.get(label) ?? { label, orders: 0, net: 0 }
    row.orders++
    row.net += orderNet(o)
    map.set(label, row)
  }
  const rows = [...map.values()].sort((a, b) => b.orders - a.orders || a.label.localeCompare(b.label))
  for (const r of rows) r.share = valid.length > 0 ? r.orders / valid.length : undefined
  return rows
}

function countBy<T>(list: T[], key: (x: T) => string | undefined, value: (x: T) => number = () => 0) {
  const map = new Map<string, { label: string; orders: number; subtotal: number }>()
  for (const x of list) {
    const label = key(x) ?? 'Not stated'
    const row = map.get(label) ?? { label, orders: 0, subtotal: 0 }
    row.orders++
    row.subtotal += value(x)
    map.set(label, row)
  }
  return [...map.values()].sort((a, b) => b.orders - a.orders || a.label.localeCompare(b.label))
}

export function computeFoodyAnalytics(state: FoodyState, filters: FoodyFilters): FoodyAnalytics {
  const branches = FOODY_BRANCHES.filter((b) => (filters.brandId === 'all' || b.brandId === filters.brandId) && (filters.branch === 'all' || b.key === filters.branch))
  const storeIds = new Set(branches.map((b) => b.storeId))
  const excludedIds = new Set(state.imports.filter((i) => !included(i)).map((i) => i.id))
  const scopeOrders = state.orders.filter((o) => storeIds.has(o.storeId) && !excludedIds.has(o.importId))
  const allImports = state.imports.filter((i) => i.storeIds.some((s) => storeIds.has(s)))
  const imports = allImports.filter(included)

  // Covered dates per store: the periods of the included imports that contain the store.
  const covered = new Map<string, Set<string>>()
  for (const i of imports) {
    if (!i.periodStart || !i.periodEnd) continue
    for (const s of i.storeIds) {
      const set = covered.get(s) ?? new Set<string>()
      for (const d of dateSpan(i.periodStart, i.periodEnd)) set.add(d)
      covered.set(s, set)
    }
  }
  const isCovered = (storeId: string, date: string) => covered.get(storeId)?.has(date) ?? false

  const coveredDates = [...new Set(branches.flatMap((b) => [...(covered.get(b.storeId) ?? [])]))].sort()
  const start = filters.from || coveredDates[0]
  const end = filters.to || coveredDates[coveredDates.length - 1]
  const range = start && end && start <= end ? { start, end } : undefined
  const calendar = range ? dateSpan(range.start, range.end) : []
  const inRange = (date: string, r = range) => Boolean(r && date >= r.start && date <= r.end)
  const orders = scopeOrders.filter((o) => inRange(o.date))

  const byDate = new Map<string, FoodyOrder[]>()
  for (const o of orders) byDate.set(o.date, [...(byDate.get(o.date) ?? []), o])

  const daily: FoodyDailyPoint[] = calendar.map((date) => {
    const dayOrders = byDate.get(date) ?? []
    const byBranch: Record<string, number | null> = {}
    const missingBranches: string[] = []
    let any = false
    for (const b of branches) {
      if (isCovered(b.storeId, date)) {
        any = true
        byBranch[b.key] = dayOrders.filter((o) => o.storeId === b.storeId && o.outcome === 'valid').reduce((a, o) => a + orderNet(o), 0)
      } else {
        byBranch[b.key] = null
        missingBranches.push(b.label)
      }
    }
    // Orders outside an import's covered period cannot exist (the period comes from the orders).
    const m = metricsOf(dayOrders.filter((o) => isCovered(o.storeId, date)))
    return {
      date,
      net: any ? m.net : null,
      gross: any ? m.gross : null,
      orders: any ? m.validOrders : null,
      discount: any ? m.discount : null,
      voucher: any ? m.voucher : null,
      cancelled: any ? m.cancelledOrders : null,
      byBranch,
      status: !any ? 'missing' : missingBranches.length > 0 ? 'partial' : 'complete',
      missingBranches,
    }
  })

  const branchRows: FoodyBranchRow[] = branches.map((b) => {
    const own = orders.filter((o) => o.storeId === b.storeId)
    const metrics = metricsOf(own)
    const daysCovered = calendar.filter((d) => isCovered(b.storeId, d)).length
    const perDay = new Map<string, number>()
    for (const o of own) if (o.outcome === 'valid') perDay.set(o.date, (perDay.get(o.date) ?? 0) + orderNet(o))
    let best: FoodyBranchRow['best']
    for (const [date, net] of perDay) if (!best || net > best.net) best = { date, net }
    return { info: b, metrics, daysCovered, daysWithOrders: perDay.size, missingDays: calendar.length - daysCovered, best }
  })

  const totalsMetrics = metricsOf(orders)
  const hasData = daily.some((d) => d.status !== 'missing')
  for (const r of branchRows) r.share = hasData && totalsMetrics.net !== 0 ? r.metrics.net / totalsMetrics.net : undefined
  const ranked = branchRows.filter((r) => r.daysCovered > 0).sort((a, b) => b.metrics.net - a.metrics.net)

  const withData = daily.filter((d) => d.net !== null)
  const complete = daily.filter((d) => d.status === 'complete' && d.net !== null)
  let extremes: FoodyAnalytics['extremes']
  if (complete.length >= 2) {
    const sorted = [...complete].sort((a, b) => (b.net as number) - (a.net as number))
    extremes = { highest: { date: sorted[0].date, net: sorted[0].net as number }, lowest: { date: sorted[sorted.length - 1].date, net: sorted[sorted.length - 1].net as number } }
  }

  // Period table for the selected granularity.
  const buckets = new Map<string, { row: FoodyPeriodRow; orders: FoodyOrder[] }>()
  for (const p of daily) {
    const b = bucketOf(p.date, filters.grain)
    const entry = buckets.get(b.key) ?? { row: { key: b.key, start: p.date, end: p.date, metrics: metricsOf([]), daysCovered: 0, calendarDays: 0, partial: false }, orders: [] }
    entry.row.end = p.date
    entry.row.calendarDays++
    if (p.status !== 'missing') entry.row.daysCovered++
    if (p.status !== 'complete') entry.row.partial = true
    if (range && (b.start < range.start || b.end > range.end)) entry.row.partial = true
    entry.orders.push(...(byDate.get(p.date) ?? []))
    buckets.set(b.key, entry)
  }
  const periods = [...buckets.values()].map(({ row, orders: list }) => ({ ...row, metrics: metricsOf(list) }))
  periods.forEach((p, i) => {
    const prev = periods[i - 1]
    if (prev && prev.daysCovered > 0 && p.daysCovered > 0) p.change = ratio(p.metrics.net, prev.metrics.net)
  })

  // Period comparison (campaign vs baseline).
  let comparison: FoodyComparison | undefined
  if (range && filters.compare !== 'none') {
    const days = calendar.length
    const baseRange =
      filters.compare === 'previous'
        ? { start: addDays(range.start, -days), end: addDays(range.start, -1) }
        : filters.compareFrom && filters.compareTo && filters.compareFrom <= filters.compareTo
          ? { start: filters.compareFrom, end: filters.compareTo }
          : undefined
    if (baseRange) {
      const baseCalendar = dateSpan(baseRange.start, baseRange.end)
      const coveredCount = (cal: string[]) => cal.filter((d) => branches.some((b) => isCovered(b.storeId, d))).length
      const fullyCovered = (cal: string[]) => cal.every((d) => branches.every((b) => isCovered(b.storeId, d)))
      const baseMetrics = metricsOf(scopeOrders.filter((o) => inRange(o.date, baseRange)))
      const cur = totalsMetrics
      comparison = {
        mode: filters.compare,
        current: { ...range, metrics: cur, daysCovered: coveredCount(calendar), calendarDays: calendar.length },
        baseline: { ...baseRange, metrics: baseMetrics, daysCovered: coveredCount(baseCalendar), calendarDays: baseCalendar.length },
        change: {
          net: ratio(cur.net, baseMetrics.net),
          gross: ratio(cur.gross, baseMetrics.gross),
          validOrders: ratio(cur.validOrders, baseMetrics.validOrders),
          aov: ratio(cur.aov, baseMetrics.aov),
          discount: ratio(cur.discount, baseMetrics.discount),
          voucher: ratio(cur.voucher, baseMetrics.voucher),
          promoOrders: ratio(cur.promoOrders, baseMetrics.promoOrders),
          cancelledOrders: ratio(cur.cancelledOrders, baseMetrics.cancelledOrders),
          complaints: ratio(cur.complaints, baseMetrics.complaints),
        },
        pointChange: {
          promoRate: cur.promoRate !== undefined && baseMetrics.promoRate !== undefined ? cur.promoRate - baseMetrics.promoRate : undefined,
          cancellationRate: cur.cancellationRate !== undefined && baseMetrics.cancellationRate !== undefined ? cur.cancellationRate - baseMetrics.cancellationRate : undefined,
        },
        baselineIncomplete: !fullyCovered(baseCalendar),
        currentIncomplete: !fullyCovered(calendar),
      }
    }
  }

  // Items (valid orders only).
  const itemMap = new Map<string, FoodyItemRow>()
  let unparsed = 0
  let ordersWithItems = 0
  for (const o of orders) {
    if (o.outcome !== 'valid' || !o.items) continue
    ordersWithItems++
    const parsed = parseItems(o.items)
    unparsed += parsed.unparsed
    const seen = new Set<string>()
    for (const it of parsed.items) {
      const row = itemMap.get(it.name) ?? { name: it.name, quantity: 0, orders: 0 }
      row.quantity += it.quantity
      if (!seen.has(it.name)) row.orders++
      seen.add(it.name)
      itemMap.set(it.name, row)
    }
  }
  const itemRows = [...itemMap.values()].sort((a, b) => b.quantity - a.quantity || b.orders - a.orders || a.name.localeCompare(b.name))

  const cancelledOrders = orders.filter((o) => o.outcome === 'cancelled')
  const complaintOrders = orders.filter((o) => o.hasComplaint)

  // Validation: each included file's own totals against the orders stored from it.
  const byId = new Map(state.orders.map((o) => [o.orderId, o]))
  const reconciliation: FoodyReconciliation[] = imports.map((i) => {
    const stored = i.orderIds.map((id) => byId.get(id)).filter((o): o is FoodyOrder => o !== undefined)
    const totals = controlTotals(stored)
    const close = (a: number, b: number) => Math.abs(a - b) < 0.005
    const c = i.control
    const matches =
      totals.orders === c.orders && totals.validOrders === c.validOrders && totals.cancelledOrders === c.cancelledOrders && close(totals.gross, c.gross) && close(totals.discount, c.discount) && close(totals.voucher, c.voucher) && close(totals.net, c.net)
    return { importId: i.id, fileName: i.fileName, control: c, stored: totals, matches, suppliedElsewhere: stored.filter((o) => o.importId !== i.id).length }
  })

  const missingBranchDays = branchRows.reduce((a, r) => a + r.missingDays, 0)
  const quality: FoodyQualityItem[] = []
  for (const r of branchRows) {
    if (!range) continue
    if (r.daysCovered === 0) quality.push({ level: 'warning', message: `${r.info.label}: no Foody data imported for ${range.start} to ${range.end}.` })
    else if (r.missingDays > 0) quality.push({ level: 'warning', message: `${r.info.label}: ${r.missingDays} day(s) outside every imported Foody file (shown as missing, not zero).` })
  }
  for (const rec of reconciliation) {
    if (rec.matches)
      quality.push({ level: 'info', message: `“${rec.fileName}”: stored orders match the file's own totals (${rec.control.validOrders} valid orders · gross ${FOODY_CURRENCY} ${rec.control.gross.toFixed(2)} · net ${FOODY_CURRENCY} ${rec.control.net.toFixed(2)}).` })
    else
      quality.push({
        level: 'warning',
        message: `“${rec.fileName}”: stored values differ from the file's own totals (file net ${FOODY_CURRENCY} ${rec.control.net.toFixed(2)}, stored ${FOODY_CURRENCY} ${rec.stored.net.toFixed(2)})${rec.suppliedElsewhere > 0 ? ` — ${rec.suppliedElsewhere} of its orders currently hold values from another import` : ''}.`,
      })
  }
  if (totalsMetrics.otherOrders > 0) quality.push({ level: 'warning', message: `${totalsMetrics.otherOrders} order(s) have a status with no configured meaning and are excluded from sales and cancellations.` })
  const undated = imports.reduce((a, i) => a + i.invalidRows.length, 0)
  if (undated > 0) quality.push({ level: 'error', message: `${undated} row(s) in the imported files could not be read and were not imported.` })
  const excluded = allImports.filter((i) => !included(i))
  if (excluded.length > 0)
    quality.push({ level: 'warning', message: `${excluded.length} Foody import(s) are excluded from analysis (${[...new Set(excluded.map((i) => i.fileName))].join(', ')}). Their orders are left out until included again.` })
  if (unparsed > 0) quality.push({ level: 'info', message: `${unparsed} order item text fragment(s) could not be read as “quantity + item” and are left out of the item ranking (sales figures are not affected).` })
  if (comparison?.baselineIncomplete) quality.push({ level: 'warning', message: `Comparison period ${comparison.baseline.start} to ${comparison.baseline.end} has days without imported Foody data — the comparison is not like for like.` })
  quality.push({ level: 'info', message: `${FOODY_RULES.gross}. ${FOODY_RULES.net} (primary revenue KPI). ${FOODY_RULES.aov}.` })
  quality.push({ level: 'info', message: `${FOODY_RULES.valid}. ${FOODY_RULES.cancelled}.` })
  quality.push({ level: 'info', message: `${FOODY_RULES.fees}. No commission or payout is calculated (not in the export).` })
  quality.push({ level: 'info', message: 'All Foody amounts are in EUR and are never converted or added to Weevi or Toters (Lebanon, USD) figures.' })

  const daysCovered = withData.length
  return {
    filters,
    currency: FOODY_CURRENCY,
    branches,
    range,
    calendar,
    totals: {
      ...totalsMetrics,
      daysCovered,
      calendarDays: calendar.length,
      daysWithOrders: new Set(orders.filter((o) => o.outcome === 'valid').map((o) => o.date)).size,
      missingBranchDays,
      averageDailyNet: daysCovered > 0 ? totalsMetrics.net / daysCovered : undefined,
    },
    daily,
    periods,
    branchRows,
    highestBranch: ranked[0],
    extremes,
    comparison,
    mix: {
      deliveryType: mixOf(orders, (o) => o.deliveryType),
      paymentType: mixOf(orders, (o) => o.paymentType),
      paymentMethod: mixOf(orders, (o) => o.paymentMethod),
      pro: mixOf(orders, (o) => (o.isPro === undefined ? undefined : o.isPro ? 'Pro order' : 'Standard order')),
    },
    items: { rows: itemRows, unparsed, ordersWithItems },
    cancellations: { orders: cancelledOrders, byReason: countBy(cancelledOrders, (o) => o.cancellationReason, (o) => o.subtotal), byOwner: countBy(cancelledOrders, (o) => o.cancellationOwner, (o) => o.subtotal) },
    complaints: { orders: complaintOrders, byReason: countBy(complaintOrders, (o) => o.complaintReason).map(({ label, orders: n }) => ({ label, orders: n })) },
    orders,
    reconciliation,
    imports,
    allImports,
    quality,
    hasData,
  }
}
