import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { applyFoodyImport, planFoodyImport, removeFoodyImport, setFoodyImportIncluded } from '@/foody/merge'
import { DEFAULT_FOODY_FILTERS, EMPTY_FOODY_STATE, type FoodyFilters, type FoodyState } from '@/foody/types'
import { idb } from '@/storage/indexedDb'
import { useDataStore } from './dataStore'
import { FoodyStoreContext, type FoodyStore } from './foodyStore'

const KEY = 'state'

/**
 * Foody orders, import history and dashboard filters. Stored in its own IndexedDB object store
 * and saved only when the user keeps data on this device (the same preference as Weevi data).
 */
export function FoodyStoreProvider({ children }: { children: ReactNode }) {
  const { persistDatasets } = useDataStore()
  const [state, setState] = useState<FoodyState>(EMPTY_FOODY_STATE)
  const [filters, setFilters] = useState<FoodyFilters>(DEFAULT_FOODY_FILTERS)
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
      .get<FoodyState>('foody', KEY)
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
    if (persistDatasets) idb.put('foody', stateRef.current, KEY).catch(() => undefined)
    else idb.delete('foody', KEY).catch(() => undefined)
  }, [persistDatasets])

  const save = useCallback((next: FoodyState) => {
    // A change made before saved data finished loading wins over the saved copy.
    loaded.current = true
    stateRef.current = next
    setState(next)
    if (persistRef.current) idb.put('foody', next, KEY).catch(() => undefined)
  }, [])

  const commitImport = useCallback<FoodyStore['commitImport']>(
    (parsed, resolution, input) => {
      // Always planned against the latest state, so two quick imports cannot double-count.
      const plan = planFoodyImport(stateRef.current, parsed)
      if (plan.kind === 'identical') return null
      const { state: next, entry } = applyFoodyImport(stateRef.current, parsed, plan, resolution, input)
      save(next)
      return entry
    },
    [save],
  )

  const removeImport = useCallback((id: string) => save(removeFoodyImport(stateRef.current, id)), [save])
  const setImportIncluded = useCallback((id: string, included: boolean) => save(setFoodyImportIncluded(stateRef.current, id, included)), [save])
  const clear = useCallback(() => save(EMPTY_FOODY_STATE), [save])
  const resetFilters = useCallback(() => setFilters(DEFAULT_FOODY_FILTERS), [])

  const value = useMemo<FoodyStore>(() => ({ state, filters, setFilters, resetFilters, commitImport, removeImport, setImportIncluded, clear }), [state, filters, resetFilters, commitImport, removeImport, setImportIncluded, clear])
  return <FoodyStoreContext.Provider value={value}>{children}</FoodyStoreContext.Provider>
}
