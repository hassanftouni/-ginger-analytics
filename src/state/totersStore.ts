import { createContext, useContext } from 'react'
import type { TotersBatchInput, TotersBatchPlan } from '@/toters/merge'
import type { TotersFilters, TotersImport, TotersState } from '@/toters/types'

export interface TotersStore {
  state: TotersState
  filters: TotersFilters
  setFilters: (next: TotersFilters) => void
  resetFilters: () => void
  /**
   * Apply an import plan against the latest state. Returns the created history entries, or null
   * when the data turned out identical to what is stored (nothing changed).
   */
  commitImport: (build: (state: TotersState) => { plan: TotersBatchPlan; input: TotersBatchInput } | null, resolution: 'replace' | 'keep') => TotersImport[] | null
  removeImport: (id: string) => void
  setImportIncluded: (id: string, included: boolean) => void
  clear: () => void
}

export const TotersStoreContext = createContext<TotersStore | null>(null)

/** Toters data and filters. Separate from the Weevi data store by design. */
export function useTotersStore(): TotersStore {
  const store = useContext(TotersStoreContext)
  if (!store) throw new Error('useTotersStore must be used inside <TotersStoreProvider>')
  return store
}
