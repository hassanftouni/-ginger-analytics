import { createContext, useContext } from 'react'
import type { Filters } from '@/types/filters'

export interface FiltersStore {
  filters: Filters
  setFilters: (next: Filters) => void
  resetFilters: () => void
}

export const FiltersContext = createContext<FiltersStore | null>(null)

/** Global filters shared by every analytics view. */
export function useFilters(): FiltersStore {
  const store = useContext(FiltersContext)
  if (!store) throw new Error('useFilters must be used inside <FiltersProvider>')
  return store
}
