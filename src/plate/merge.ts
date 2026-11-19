/**
 * Import planning for Plate reservations. Every stored booking is unique by Booking ID, so
 * overlapping files only add missing bookings or (when explicitly chosen) replace stored ones
 * whose values changed (e.g. a later status) — a booking is never counted twice.
 */
import { bookingSignature, byDateTime, fingerprintPlate, type PlateParseResult, type PlateParsedBooking } from './parse'
import type { PlateBooking, PlateImport, PlateResolution, PlateState } from './types'

export type PlateTarget = { locationId: string; periodStart: string; periodEnd: string }
type Located = PlateParsedBooking & { locationId: string }

export interface PlateConflict {
  bookingId: string
  existing: PlateBooking
  incoming: Located
}

export interface PlatePlan {
  kind: 'identical' | 'clean' | 'conflict'
  newBookings: Located[]
  unchanged: Located[]
  conflicts: PlateConflict[]
  /** The same file period and location is already imported (coverage would not change). */
  samePeriodImported: boolean
}

export function planPlateImport(state: PlateState, parsed: Pick<PlateParseResult, 'bookings'>, target: PlateTarget): PlatePlan {
  const existing = new Map(state.bookings.map((b) => [b.bookingId, b]))
  const newBookings: Located[] = []
  const unchanged: Located[] = []
  const conflicts: PlateConflict[] = []
  for (const p of parsed.bookings) {
    const b: Located = { ...p, locationId: target.locationId }
    const e = existing.get(b.bookingId)
    if (!e) newBookings.push(b)
    else if (bookingSignature(e) === bookingSignature(b)) unchanged.push(b)
    else conflicts.push({ bookingId: b.bookingId, existing: e, incoming: b })
  }
  const covered = state.imports.some((i) => i.included !== false && i.locationId === target.locationId && i.periodStart <= target.periodStart && i.periodEnd >= target.periodEnd)
  const kind = conflicts.length > 0 ? 'conflict' : newBookings.length === 0 && covered ? 'identical' : 'clean'
  return { kind, newBookings, unchanged, conflicts, samePeriodImported: covered }
}

export interface PlateImportInput {
  id: string
  fileName: string
  fileSize: number
  importedAt: number
  warnings: string[]
}

const toBooking = (b: Located, importId: string): PlateBooking => {
  const { row: _row, ...rest } = b
  return { ...rest, importId }
}

export function applyPlateImport(
  state: PlateState,
  parsed: PlateParseResult,
  plan: PlatePlan,
  target: PlateTarget,
  resolution: Exclude<PlateResolution, 'new'>,
  input: PlateImportInput,
): { state: PlateState; entry: PlateImport } {
  if (plan.kind === 'identical') throw new Error('Identical import: nothing to apply.')
  const replace = resolution === 'replace' && plan.conflicts.length > 0
  const writes = [...plan.newBookings, ...(replace ? plan.conflicts.map((c) => c.incoming) : [])].map((b) => toBooking(b, input.id))
  const ids = new Set(writes.map((b) => b.bookingId))
  const bookings = [...state.bookings.filter((b) => !ids.has(b.bookingId)), ...writes].sort(byDateTime)
  const entry: PlateImport = {
    id: input.id,
    fileName: input.fileName,
    fileSize: input.fileSize,
    locationId: target.locationId,
    periodStart: target.periodStart,
    periodEnd: target.periodEnd,
    importedAt: input.importedAt,
    bookingIds: parsed.bookings.map((b) => b.bookingId),
    fingerprint: fingerprintPlate(parsed.bookings, target.locationId),
    validRows: parsed.bookings.length,
    invalidRows: parsed.invalid,
    bookingsAdded: plan.newBookings.length,
    bookingsReplaced: replace ? plan.conflicts.length : 0,
    bookingsKept: replace ? 0 : plan.conflicts.length,
    bookingsUnchanged: plan.unchanged.length,
    resolution: plan.conflicts.length === 0 ? 'new' : resolution,
    control: parsed.control,
    included: true,
    replaced: replace ? plan.conflicts.map((c) => ({ bookingId: c.bookingId, previousStatus: c.existing.status, previousPartySize: c.existing.partySize, previousImportId: c.existing.importId })) : [],
    warnings: input.warnings,
  }
  return { state: { bookings, imports: [entry, ...state.imports] }, entry }
}

export function setPlateImportIncluded(state: PlateState, importId: string, included: boolean): PlateState {
  return { ...state, imports: state.imports.map((i) => (i.id === importId ? { ...i, included } : i)) }
}

/** Remove an import and the bookings whose current values it supplied. */
export function removePlateImport(state: PlateState, importId: string): PlateState {
  return { bookings: state.bookings.filter((b) => b.importId !== importId), imports: state.imports.filter((i) => i.id !== importId) }
}
