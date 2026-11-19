import { createContext, useContext } from 'react'
import type { PlateImportInput, PlateTarget } from '@/plate/merge'
import type { PlateParseResult } from '@/plate/parse'
import type { PlateFilters, PlateImport, PlateState } from '@/plate/types'

export interface PlateStore {
  state: PlateState
  filters: PlateFilters
  setFilters: (next: PlateFilters) => void
  resetFilters: () => void
  /**
   * Plan and apply an import against the latest state. Returns the history entry, or null when
   * the file turned out identical to what is stored (nothing changed).
   */
  commitImport: (parsed: PlateParseResult, target: PlateTarget, resolution: 'replace' | 'keep', input: PlateImportInput) => PlateImport | null
  removeImport: (id: string) => void
  setImportIncluded: (id: string, included: boolean) => void
  clear: () => void
}

export const PlateStoreContext = createContext<PlateStore | null>(null)

/** Plate reservation data and filters. Separate from the Weevi, Toters and Foody stores by design. */
export function usePlateStore(): PlateStore {
  const store = useContext(PlateStoreContext)
  if (!store) throw new Error('usePlateStore must be used inside <PlateStoreProvider>')
  return store
}
