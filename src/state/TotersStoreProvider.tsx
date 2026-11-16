import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { idb } from '@/storage/indexedDb'
import { applyTotersImport, removeTotersImport, setTotersImportIncluded } from '@/toters/merge'
import { DEFAULT_TOTERS_FILTERS, EMPTY_TOTERS_STATE, type TotersFilters, type TotersState } from '@/toters/types'
import { useDataStore } from './dataStore'
import { TotersStoreContext, type TotersStore } from './totersStore'

const KEY = 'state'

/**
 * Toters days, import history and dashboard filters. Stored in its own IndexedDB object store
 * and saved only when the user keeps data on this device (the same preference as Weevi data).
 */
export function TotersStoreProvider({ children }: { children: ReactNode }) {
  const { persistDatasets } = useDataStore()
  const [state, setState] = useState<TotersState>(EMPTY_TOTERS_STATE)
  const [filters, setFilters] = useState<TotersFilters>(DEFAULT_TOTERS_FILTERS)
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
      .get<TotersState>('toters', KEY)
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
    if (persistDatasets) idb.put('toters', stateRef.current, KEY).catch(() => undefined)
    else idb.delete('toters', KEY).catch(() => undefined)
  }, [persistDatasets])

  const save = useCallback((next: TotersState) => {
    // A change made before saved data finished loading wins over the saved copy.
    loaded.current = true
    stateRef.current = next
    setState(next)
    if (persistRef.current) idb.put('toters', next, KEY).catch(() => undefined)
  }, [])

  const commitImport = useCallback<TotersStore['commitImport']>(
    (build, resolution) => {
      const built = build(stateRef.current)
      if (!built || built.plan.kind === 'identical') return null
      const { state: next, entries } = applyTotersImport(stateRef.current, built.plan, resolution, built.input)
      save(next)
      return entries
    },
    [save],
  )

  const removeImport = useCallback((id: string) => save(removeTotersImport(stateRef.current, id)), [save])
  const setImportIncluded = useCallback((id: string, included: boolean) => save(setTotersImportIncluded(stateRef.current, id, included)), [save])
  const clear = useCallback(() => save(EMPTY_TOTERS_STATE), [save])
  const resetFilters = useCallback(() => setFilters(DEFAULT_TOTERS_FILTERS), [])

  const value = useMemo<TotersStore>(() => ({ state, filters, setFilters, resetFilters, commitImport, removeImport, setImportIncluded, clear }), [state, filters, resetFilters, commitImport, removeImport, setImportIncluded, clear])
  return <TotersStoreContext.Provider value={value}>{children}</TotersStoreContext.Provider>
}
