import { useMemo } from 'react'
import { runAnalysis } from '@/analytics'
import { useDataStore } from '@/state/dataStore'
import { useFilters } from '@/state/filters'
import type { AnalyticsResult } from '@/types/analytics'
import type { Filters } from '@/types/filters'

/**
 * Analysis for the global filters, with optional fixed values for a page
 * (e.g. the Pertutti page always restricts brand to Pertutti).
 */
export function useAnalytics(fixed?: Partial<Filters>): AnalyticsResult {
  const { datasets, settings } = useDataStore()
  const { filters } = useFilters()
  const fixedKey = JSON.stringify(fixed ?? {})
  const effective = useMemo<Filters>(() => ({ ...filters, ...(JSON.parse(fixedKey) as Partial<Filters>) }), [filters, fixedKey])
  return useMemo(() => runAnalysis(datasets, effective, settings), [datasets, effective, settings])
}
