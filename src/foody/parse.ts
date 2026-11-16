/**
 * Foody "orderDetails" export (verified against the October 2026 Ginger & Co Cyprus export):
 *
 *   row 1  grouped titles   Order metadata | Operations | Operational issues | Income | Deductions | …
 *   row 2  column headers   Restaurant name, Order ID, Store ID, Delivery type, … Subtotal, …, Discount, Voucher, …, Order items
 *   row 3+ one row per order
 *
 * The format is recognised from the headers (never the file name). The branch comes from the
 * Store ID. Amounts are EUR. Nothing is guessed: a row that cannot be read is reported as
 * invalid and never treated as zero.
 */
import { FOODY_CANCELLED_STATUSES, FOODY_HEADERS, FOODY_REQUIRED, FOODY_VALID_STATUSES, foodyStoreById, type FoodyColumn } from '@/config/foody'
import type { CellValue, RawFile } from '@/types/data'
import type { Issue } from '@/types/dataset'
import { fnv1a } from '@/utils/hash'
import type { FoodyControlTotals, FoodyInvalidRow, FoodyOrder, FoodyOutcome } from './types'

const norm = (s: string) => s.replace(/^﻿/, '').trim().toLowerCase()

export interface FoodyDetection {
  sheetIndex: number
  /** 1-based header row. */
  headerRow: number
  columns: Partial<Record<FoodyColumn, number>>
}

/** Recognise a Foody order export from its headers (first ten rows of each sheet). */
export function detectFoody(raw: RawFile): FoodyDetection | null {
  for (let sheetIndex = 0; sheetIndex < raw.sheets.length; sheetIndex++) {
    const cells = raw.sheets[sheetIndex].cells
    for (let r = 0; r < Math.min(cells.length, 10); r++) {
      const headers = (cells[r] ?? []).map((v) => (typeof v === 'string' ? norm(v) : ''))
      const columns: FoodyDetection['columns'] = {}
      for (const [key, header] of Object.entries(FOODY_HEADERS) as [FoodyColumn, string][]) {
        const i = headers.indexOf(norm(header))
        if (i >= 0) columns[key] = i
      }
      if (FOODY_REQUIRED.every((k) => columns[k] !== undefined)) return { sheetIndex, headerRow: r + 1, columns }
    }
  }
  return null
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Strict local date-time: "yyyy-mm-dd HH:mm[:ss]" or an Excel date. Returns "yyyy-mm-dd HH:mm". */
export function parseFoodyDateTime(value: CellValue | undefined): string | undefined {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined
    // Excel dates carry the clock time of the export as UTC fields.
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`
  }
  if (typeof value !== 'string') return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/.exec(value.trim())
  if (!m) return undefined
  const [y, mo, d, h, mi] = [+m[1], +m[2], +m[3], m[4] === undefined ? 0 : +m[4], m[5] === undefined ? 0 : +m[5]]
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || h > 23 || mi > 59) return undefined
  return `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}`
}

/** Strict number: plain decimal ("12.5", "-3"). Empty is "missing", never zero. */
export function parseFoodyNumber(value: CellValue | undefined): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!/^-?\d+(\.\d+)?$/.test(text)) return undefined
  return Number(text)
}

const text = (v: CellValue | undefined): string | undefined => {
  if (v === null || v === undefined) return undefined
  const s = (v instanceof Date ? v.toISOString() : String(v)).trim()
  return s === '' ? undefined : s
}

/** IDs may be read as text or as numbers (Excel); "2000666969.0" is the same ID. */
const idText = (v: CellValue | undefined): string | undefined => {
  const s = text(v)
  if (!s) return undefined
  return /^\d+\.0+$/.test(s) ? s.replace(/\.0+$/, '') : s
}

const yesNo = (v: CellValue | undefined): boolean | undefined => {
  const s = text(v)?.toUpperCase()
  return s === 'Y' || s === 'YES' || s === 'TRUE' ? true : s === 'N' || s === 'NO' || s === 'FALSE' ? false : undefined
}

export function outcomeOf(status: string): FoodyOutcome {
  const s = norm(status)
  if (FOODY_VALID_STATUSES.includes(s)) return 'valid'
  if (FOODY_CANCELLED_STATUSES.includes(s)) return 'cancelled'
  return 'other'
}

/** Net sales of one order (Subtotal − Discount − Voucher). */
export const orderNet = (o: Pick<FoodyOrder, 'subtotal' | 'discount' | 'voucher'>) => o.subtotal - o.discount - o.voucher

/** Sort key: received time, or the cancellation time for orders cancelled before receipt. */
export const orderTime = (o: Pick<FoodyOrder, 'receivedAt' | 'cancelledAt' | 'date'>) => o.receivedAt ?? o.cancelledAt ?? o.date
export const byTime = (a: Pick<FoodyOrder, 'receivedAt' | 'cancelledAt' | 'date' | 'orderId'>, b: Pick<FoodyOrder, 'receivedAt' | 'cancelledAt' | 'date' | 'orderId'>) =>
  orderTime(a).localeCompare(orderTime(b)) || a.orderId.localeCompare(b.orderId)

export type FoodyParsedOrder = Omit<FoodyOrder, 'importId'> & { row: number }

/** Content signature of an order: two rows (or two imports) with the same signature are the same order. */
export function orderSignature(o: Omit<FoodyOrder, 'importId'> | FoodyParsedOrder | FoodyOrder): string {
  const { orderId, storeId, date, receivedAt, dateSource, status, deliveryType, paymentType, paymentMethod, isPro, subtotal, discount, voucher, packaging, minOrderFee, hasComplaint, complaintReason, cancelledAt, cancellationReason, cancellationOwner, items } = o
  return JSON.stringify([orderId, storeId, date, receivedAt, dateSource, status, deliveryType, paymentType, paymentMethod, isPro, subtotal, discount, voucher, packaging, minOrderFee, hasComplaint, complaintReason, cancelledAt, cancellationReason, cancellationOwner, items])
}

export interface FoodyParseResult {
  fileName: string
  detection: FoodyDetection
  /** Valid rows, one per order ID, sorted by received time. */
  orders: FoodyParsedOrder[]
  invalid: FoodyInvalidRow[]
  sourceRows: number
  periodStart?: string
  periodEnd?: string
  storeIds: string[]
  restaurantNames: string[]
  addresses: string[]
  /** Row count per original status value. */
  statuses: Record<string, number>
  control: FoodyControlTotals
  issues: Issue[]
}

export function controlTotals(orders: Pick<FoodyOrder, 'outcome' | 'subtotal' | 'discount' | 'voucher'>[]): FoodyControlTotals {
  const valid = orders.filter((o) => o.outcome === 'valid')
  const sum = (f: (o: (typeof orders)[number]) => number) => valid.reduce((a, o) => a + f(o), 0)
  return {
    orders: orders.length,
    validOrders: valid.length,
    cancelledOrders: orders.filter((o) => o.outcome === 'cancelled').length,
    otherOrders: orders.filter((o) => o.outcome === 'other').length,
    subtotalAll: orders.reduce((a, o) => a + o.subtotal, 0),
    gross: sum((o) => o.subtotal),
    discount: sum((o) => o.discount),
    voucher: sum((o) => o.voucher),
    net: sum((o) => orderNet(o)),
  }
}

/** Parse and validate a detected Foody export. */
export function parseFoody(raw: RawFile, detection: FoodyDetection): FoodyParseResult {
  const cells = raw.sheets[detection.sheetIndex].cells
  const c = detection.columns
  const issues: Issue[] = []
  const invalid: FoodyInvalidRow[] = []
  const candidates: FoodyParsedOrder[] = []
  const unknownStores = new Set<string>()
  const names = new Set<string>()
  const addresses = new Set<string>()
  let sourceRows = 0

  for (let i = detection.headerRow; i < cells.length; i++) {
    const values = cells[i] ?? []
    if (values.every((v) => v === null || v === undefined || v === '')) continue
    sourceRows++
    const row = i + 1
    const get = (k: FoodyColumn) => (c[k] === undefined ? undefined : values[c[k] as number])

    const orderId = idText(get('orderId'))
    const storeId = idText(get('storeId'))
    const status = text(get('status'))
    const receivedAt = parseFoodyDateTime(get('receivedAt'))
    const cancelledAt = parseFoodyDateTime(get('cancelledAt'))
    // An order cancelled before the restaurant received it has no "received" time: it is dated
    // by "Cancelled at" instead. Any other order without a valid received time is invalid.
    const cancelledEarly = !receivedAt && !text(get('receivedAt')) && cancelledAt !== undefined && status !== undefined && outcomeOf(status) === 'cancelled'
    const date = (receivedAt ?? (cancelledEarly ? cancelledAt : undefined))?.slice(0, 10)
    const name = text(get('restaurantName'))
    const address = text(get('address'))
    if (name) names.add(name)
    if (address) addresses.add(address)

    if (!orderId) {
      invalid.push({ row, date, reason: 'Missing order ID' })
      continue
    }
    if (!storeId) {
      invalid.push({ row, orderId, date, reason: 'Missing store ID' })
      continue
    }
    if (!foodyStoreById(storeId)) {
      unknownStores.add(storeId)
      invalid.push({ row, orderId, date, reason: `Unknown store ID ${storeId}` })
      continue
    }
    if (!receivedAt && !cancelledEarly) {
      const t = text(get('receivedAt'))
      invalid.push({ row, orderId, reason: t ? `Invalid “Order received at” value “${t}”` : 'Missing “Order received at” date' })
      continue
    }
    if (!status) {
      invalid.push({ row, orderId, date, reason: 'Missing order status' })
      continue
    }
    const money: Partial<Record<'subtotal' | 'discount' | 'voucher', number>> = {}
    let bad: string | undefined
    for (const k of ['subtotal', 'discount', 'voucher'] as const) {
      const v = parseFoodyNumber(get(k))
      if (v === undefined) {
        const t = text(get(k))
        bad = t ? `Invalid ${FOODY_HEADERS[k]} “${t}”` : `Missing ${FOODY_HEADERS[k]} (not treated as zero)`
        break
      }
      money[k] = v
    }
    if (bad) {
      invalid.push({ row, orderId, date, reason: bad })
      continue
    }
    const optional = (k: 'packaging' | 'minOrderFee') => parseFoodyNumber(get(k))
    candidates.push({
      row,
      orderId,
      storeId,
      date: date as string,
      receivedAt,
      dateSource: receivedAt ? 'received' : 'cancelled',
      status,
      outcome: outcomeOf(status),
      deliveryType: text(get('deliveryType')),
      paymentType: text(get('paymentType')),
      paymentMethod: text(get('paymentMethod')),
      isPro: yesNo(get('isPro')),
      subtotal: money.subtotal as number,
      discount: money.discount as number,
      voucher: money.voucher as number,
      packaging: optional('packaging'),
      minOrderFee: optional('minOrderFee'),
      hasComplaint: yesNo(get('hasComplaint')) === true,
      complaintReason: text(get('complaintReason')),
      cancelledAt: cancelledAt ?? text(get('cancelledAt')),
      cancellationReason: text(get('cancellationReason')),
      cancellationOwner: text(get('cancellationOwner')),
      items: text(get('items')),
    })
  }

  // One row per order ID: identical repeats count once; conflicting repeats are not imported.
  const byId = new Map<string, FoodyParsedOrder[]>()
  for (const o of candidates) byId.set(o.orderId, [...(byId.get(o.orderId) ?? []), o])
  const orders: FoodyParsedOrder[] = []
  let identicalRepeats = 0
  for (const [orderId, group] of byId) {
    if (new Set(group.map(orderSignature)).size === 1) {
      orders.push(group[0])
      identicalRepeats += group.length - 1
    } else for (const g of group) invalid.push({ row: g.row, orderId, date: g.date, reason: 'Conflicting duplicate rows for this order ID (not imported)' })
  }
  orders.sort(byTime)
  invalid.sort((a, b) => a.row - b.row)

  const statuses: Record<string, number> = {}
  for (const o of orders) statuses[o.status] = (statuses[o.status] ?? 0) + 1
  const storeIds = [...new Set(orders.map((o) => o.storeId))].sort()
  const control = controlTotals(orders)

  if (unknownStores.size > 0)
    issues.push({ level: 'error', message: `Unknown Foody store ID(s): ${[...unknownStores].join(', ')}. They are not mapped to any branch (config/foody.ts), so the file cannot be imported.` })
  if (orders.length === 0) issues.push({ level: 'error', message: 'No valid order rows were found.' })
  const other = Object.entries(statuses).filter(([s]) => outcomeOf(s) === 'other')
  if (other.length > 0)
    issues.push({ level: 'warning', message: `Order status value(s) with no configured meaning: ${other.map(([s, n]) => `“${s}” (${n})`).join(', ')}. These orders are stored but excluded from sales, orders and cancellations.` })
  if (invalid.length > 0) issues.push({ level: 'warning', message: `${invalid.length} row(s) could not be read and are not imported (listed below).` })
  const early = orders.filter((o) => o.dateSource === 'cancelled').length
  if (early > 0) issues.push({ level: 'info', message: `${early} order(s) were cancelled before the restaurant received them (no “Order received at”); they are dated by “Cancelled at”.` })
  if (identicalRepeats > 0) issues.push({ level: 'info', message: `${identicalRepeats} repeated row(s) of the same order were counted once.` })
  if (orders.some((o) => o.subtotal < 0 || o.discount < 0 || o.voucher < 0)) issues.push({ level: 'warning', message: 'Some orders have negative amounts. They are imported as shown in the export.' })
  if (orders.some((o) => o.outcome === 'valid' && orderNet(o) < 0)) issues.push({ level: 'warning', message: 'Some delivered orders have discounts and vouchers larger than the subtotal (negative net sales).' })

  return {
    fileName: raw.fileName,
    detection,
    orders,
    invalid,
    sourceRows,
    periodStart: orders[0]?.date,
    periodEnd: orders.length > 0 ? [...orders].sort((a, b) => b.date.localeCompare(a.date))[0].date : undefined,
    storeIds,
    restaurantNames: [...names].filter((n) => norm(n) !== norm(FOODY_HEADERS.restaurantName)),
    addresses: [...addresses],
    statuses,
    control,
    issues,
  }
}

/** Content fingerprint of a file's valid orders — identical re-imports are detected regardless of file name. */
export function fingerprintFoody(orders: FoodyParsedOrder[]): string {
  return `${orders.length}-${fnv1a(orders.map(orderSignature).join('\n'))}`
}
