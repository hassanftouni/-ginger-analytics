import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_FILTERS, type Filters } from '@/types/filters'
import { FiltersContext, type FiltersStore } from './filters'

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), [])
  const value = useMemo<FiltersStore>(() => ({ filters, setFilters, resetFilters }), [filters, resetFilters])
  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>
}
