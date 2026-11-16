import { createContext, useContext } from 'react'
import type { FoodyImportInput } from '@/foody/merge'
import type { FoodyParseResult } from '@/foody/parse'
import type { FoodyFilters, FoodyImport, FoodyState } from '@/foody/types'

export interface FoodyStore {
  state: FoodyState
  filters: FoodyFilters
  setFilters: (next: FoodyFilters) => void
  resetFilters: () => void
  /**
   * Plan and apply an import against the latest state. Returns the history entry, or null when
   * the file turned out identical to what is stored (nothing changed).
   */
  commitImport: (parsed: FoodyParseResult, resolution: 'replace' | 'keep', input: FoodyImportInput) => FoodyImport | null
  removeImport: (id: string) => void
  setImportIncluded: (id: string, included: boolean) => void
  clear: () => void
}

export const FoodyStoreContext = createContext<FoodyStore | null>(null)

/** Foody data and filters. Separate from the Weevi and Toters stores by design. */
export function useFoodyStore(): FoodyStore {
  const store = useContext(FoodyStoreContext)
  if (!store) throw new Error('useFoodyStore must be used inside <FoodyStoreProvider>')
  return store
}
