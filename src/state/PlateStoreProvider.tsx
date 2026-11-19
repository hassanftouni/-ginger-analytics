import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { applyPlateImport, planPlateImport, removePlateImport, setPlateImportIncluded } from '@/plate/merge'
import { DEFAULT_PLATE_FILTERS, EMPTY_PLATE_STATE, type PlateFilters, type PlateState } from '@/plate/types'
import { idb } from '@/storage/indexedDb'
import { useDataStore } from './dataStore'
import { PlateStoreContext, type PlateStore } from './plateStore'

const KEY = 'state'

/**
 * Plate reservations, import history and dashboard filters. Stored in its own IndexedDB object store
 * and saved only when the user keeps data on this device (the same preference as Weevi data).
 */
export function PlateStoreProvider({ children }: { children: ReactNode }) {
  const { persistDatasets } = useDataStore()
  const [state, setState] = useState<PlateState>(EMPTY_PLATE_STATE)
  const [filters, setFilters] = useState<PlateFilters>(DEFAULT_PLATE_FILTERS)
  const stateRef = useRef(state)
  const persistRef = useRef(persistDatasets)
  const loaded = useRef(false)

  useEffect(() => {
    const run = { cancelled: false }
    if (!persistRef.current) {
      loaded.current = true
      return
    }
    idb
      .get<PlateState>('plate', KEY)
      .then((saved) => {
        if (run.cancelled || !saved || loaded.current) return
        stateRef.current = saved
        setState(saved)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!run.cancelled) loaded.current = true
      })
    return () => {
      run.cancelled = true
    }
    // Load once on start; later preference changes are handled below.
  }, [])

  // Follow the "keep data on this device" preference: save everything when turned on, clear when off.
  useEffect(() => {
    const was = persistRef.current
    persistRef.current = persistDatasets
    if (was === persistDatasets) return
    if (persistDatasets) idb.put('plate', stateRef.current, KEY).catch(() => undefined)
    else idb.delete('plate', KEY).catch(() => undefined)
  }, [persistDatasets])

  const save = useCallback((next: PlateState) => {
    // A change made before saved data finished loading wins over the saved copy.
    loaded.current = true
    stateRef.current = next
    setState(next)
    if (persistRef.current) idb.put('plate', next, KEY).catch(() => undefined)
  }, [])

  const commitImport = useCallback<PlateStore['commitImport']>(
    (parsed, target, resolution, input) => {
      // Always planned against the latest state, so two quick imports cannot double-count.
      const plan = planPlateImport(stateRef.current, parsed, target)
      if (plan.kind === 'identical') return null
      const { state: next, entry } = applyPlateImport(stateRef.current, parsed, plan, target, resolution, input)
      save(next)
      return entry
    },
    [save],
  )

  const removeImport = useCallback((id: string) => save(removePlateImport(stateRef.current, id)), [save])
  const setImportIncluded = useCallback((id: string, included: boolean) => save(setPlateImportIncluded(stateRef.current, id, included)), [save])
  const clear = useCallback(() => save(EMPTY_PLATE_STATE), [save])
  const resetFilters = useCallback(() => setFilters(DEFAULT_PLATE_FILTERS), [])

  const value = useMemo<PlateStore>(() => ({ state, filters, setFilters, resetFilters, commitImport, removeImport, setImportIncluded, clear }), [state, filters, resetFilters, commitImport, removeImport, setImportIncluded, clear])
  return <PlateStoreContext.Provider value={value}>{children}</PlateStoreContext.Provider>
}
