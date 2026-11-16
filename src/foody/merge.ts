/**
 * Import planning for Foody orders. Every stored order is unique by order ID, so importing
 * overlapping files can only add missing orders or (when explicitly chosen) replace existing
 * ones whose values changed — an order is never counted twice.
 */
import { FOODY_CURRENCY, foodyStoreById } from '@/config/foody'
import { byTime, fingerprintFoody, orderNet, orderSignature, type FoodyParseResult, type FoodyParsedOrder } from './parse'
import type { FoodyImport, FoodyOrder, FoodyResolution, FoodyState } from './types'

export interface FoodyConflict {
  orderId: string
  existing: FoodyOrder
  incoming: FoodyParsedOrder
}

export type FoodyPlanKind = 'identical' | 'clean' | 'conflict'

export interface FoodyPlan {
  /** identical = nothing would change; clean = no differing overlaps; conflict = a decision is needed. */
  kind: FoodyPlanKind
  newOrders: FoodyParsedOrder[]
  unchanged: FoodyParsedOrder[]
  conflicts: FoodyConflict[]
}

export function planFoodyImport(state: FoodyState, parsed: Pick<FoodyParseResult, 'orders'>): FoodyPlan {
  const existing = new Map(state.orders.map((o) => [o.orderId, o]))
  const newOrders: FoodyParsedOrder[] = []
  const unchanged: FoodyParsedOrder[] = []
  const conflicts: FoodyConflict[] = []
  for (const o of parsed.orders) {
    const e = existing.get(o.orderId)
    if (!e) newOrders.push(o)
    else if (orderSignature(e) === orderSignature(o)) unchanged.push(o)
    else conflicts.push({ orderId: o.orderId, existing: e, incoming: o })
  }
  const kind: FoodyPlanKind = conflicts.length > 0 ? 'conflict' : newOrders.length === 0 ? 'identical' : 'clean'
  return { kind, newOrders, unchanged, conflicts }
}

export interface FoodyImportInput {
  id: string
  fileName: string
  fileSize: number
  importedAt: number
  warnings: string[]
}

const toOrder = (o: FoodyParsedOrder, importId: string): FoodyOrder => {
  const { row: _row, ...rest } = o
  return { ...rest, importId }
}

/**
 * Apply a plan. `resolution` decides orders already stored with different values: "replace"
 * uses the file's values, "keep" leaves the stored ones. New orders are added either way.
 */
export function applyFoodyImport(state: FoodyState, parsed: FoodyParseResult, plan: FoodyPlan, resolution: Exclude<FoodyResolution, 'new'>, input: FoodyImportInput): { state: FoodyState; entry: FoodyImport } {
  if (plan.kind === 'identical') throw new Error('Identical import: nothing to apply.')
  const replace = resolution === 'replace' && plan.conflicts.length > 0
  const writes = [...plan.newOrders, ...(replace ? plan.conflicts.map((c) => c.incoming) : [])].map((o) => toOrder(o, input.id))
  const writeIds = new Set(writes.map((o) => o.orderId))
  const orders = [...state.orders.filter((o) => !writeIds.has(o.orderId)), ...writes].sort(byTime)
  const entry: FoodyImport = {
    id: input.id,
    fileName: input.fileName,
    fileSize: input.fileSize,
    storeIds: parsed.storeIds,
    branches: parsed.storeIds.map((id) => foodyStoreById(id)).filter((s) => s !== undefined).map((s) => ({ brandId: s.brandId, branch: s.branch, storeId: s.storeId })),
    restaurantNames: parsed.restaurantNames,
    addresses: parsed.addresses,
    periodStart: parsed.periodStart ?? '',
    periodEnd: parsed.periodEnd ?? '',
    importedAt: input.importedAt,
    currency: FOODY_CURRENCY,
    orderIds: parsed.orders.map((o) => o.orderId),
    fingerprint: fingerprintFoody(parsed.orders),
    validRows: parsed.orders.length,
    invalidRows: parsed.invalid,
    ordersAdded: plan.newOrders.length,
    ordersReplaced: replace ? plan.conflicts.length : 0,
    ordersKept: replace ? 0 : plan.conflicts.length,
    ordersUnchanged: plan.unchanged.length,
    resolution: plan.conflicts.length === 0 ? 'new' : resolution,
    control: parsed.control,
    included: true,
    replaced: replace ? plan.conflicts.map((c) => ({ orderId: c.orderId, previousNet: orderNet(c.existing), previousStatus: c.existing.status, previousImportId: c.existing.importId })) : [],
    warnings: input.warnings,
  }
  return { state: { orders, imports: [entry, ...state.imports] }, entry }
}

export function setFoodyImportIncluded(state: FoodyState, importId: string, included: boolean): FoodyState {
  return { ...state, imports: state.imports.map((i) => (i.id === importId ? { ...i, included } : i)) }
}

/**
 * Remove an import and the orders whose current values it supplied. Orders it replaced are not
 * restored (their previous values stay in that import's audit trail).
 */
export function removeFoodyImport(state: FoodyState, importId: string): FoodyState {
  return { orders: state.orders.filter((o) => o.importId !== importId), imports: state.imports.filter((i) => i.id !== importId) }
}
