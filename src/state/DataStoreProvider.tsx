import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getPersistPreference, idb, setPersistPreference } from '@/storage/indexedDb'
import type { Dataset, MappingTemplate } from '@/types/dataset'
import { DEFAULT_SETTINGS, type ReportingSettings } from '@/types/settings'
import { DataStoreContext, type DataStore } from './dataStore'

const SETTINGS_KEY = 'reporting'

export function DataStoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [templates, setTemplates] = useState<MappingTemplate[]>([])
  const [settings, setSettings] = useState<ReportingSettings>(DEFAULT_SETTINGS)
  const [persistDatasets, setPersistState] = useState(getPersistPreference)
  const persistRef = useRef(persistDatasets)
  const datasetsRef = useRef(datasets)
  const settingsDirty = useRef(false)
  useEffect(() => {
    persistRef.current = persistDatasets
    datasetsRef.current = datasets
  }, [persistDatasets, datasets])

  const fail = useCallback((error: unknown) => {
    setStorageError(error instanceof Error ? error.message : 'Local storage is unavailable.')
  }, [])

  // Load saved state once.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      idb.getAll<MappingTemplate>('templates'),
      idb.get<ReportingSettings>('settings', SETTINGS_KEY),
      getPersistPreference() ? idb.getAll<Dataset>('datasets') : Promise.resolve([] as Dataset[]),
    ])
      .then(([savedTemplates, savedSettings, savedDatasets]) => {
        if (cancelled) return
        setTemplates(savedTemplates)
        if (savedSettings) setSettings({ ...DEFAULT_SETTINGS, ...savedSettings })
        // Fill fields added after a dataset was saved.
        const migrated = savedDatasets.map((d) => ({ ...d, fingerprint: d.fingerprint ?? '', stats: { ...d.stats, valueCurrencies: d.stats.valueCurrencies ?? [] } }))
        setDatasets(migrated.sort((a, b) => b.importedAt - a.importedAt))
      })
      .catch(fail)
      .finally(() => !cancelled && setReady(true))
    return () => {
      cancelled = true
    }
  }, [fail])

  const addDataset = useCallback(
    (dataset: Dataset) => {
      setDatasets((current) => [dataset, ...current])
      if (persistRef.current) idb.put('datasets', dataset).catch(fail)
    },
    [fail],
  )

  const updateDataset = useCallback<DataStore['updateDataset']>(
    (id, patch) => {
      const existing = datasetsRef.current.find((d) => d.id === id)
      if (!existing) return
      setDatasets((current) => current.map((d) => (d.id === id ? { ...d, ...patch } : d)))
      if (persistRef.current) idb.put('datasets', { ...existing, ...patch }).catch(fail)
    },
    [fail],
  )

  const removeDataset = useCallback(
    (id: string) => {
      setDatasets((current) => current.filter((d) => d.id !== id))
      idb.delete('datasets', id).catch(fail)
    },
    [fail],
  )

  const clearDatasets = useCallback(() => {
    setDatasets([])
    idb.clear('datasets').catch(fail)
  }, [fail])

  const saveTemplate = useCallback(
    (template: MappingTemplate) => {
      setTemplates((current) => [template, ...current.filter((t) => t.id !== template.id)])
      idb.put('templates', template).catch(fail)
    },
    [fail],
  )

  const removeTemplate = useCallback(
    (id: string) => {
      setTemplates((current) => current.filter((t) => t.id !== id))
      idb.delete('templates', id).catch(fail)
    },
    [fail],
  )

  const updateSettings = useCallback(
    (patch: Partial<ReportingSettings>) => {
      settingsDirty.current = true
      setSettings((current) => ({ ...current, ...patch }))
    },
    [],
  )

  const setPersistDatasets = useCallback(
    (value: boolean) => {
      setPersistPreference(value)
      setPersistState(value)
      if (value) {
        // Save everything currently loaded.
        Promise.all(datasetsRef.current.map((d) => idb.put('datasets', d))).catch(fail)
      } else {
        idb.clear('datasets').catch(fail)
      }
    },
    [fail],
  )

  // Persist settings after a user change (not on initial load).
  useEffect(() => {
    if (!settingsDirty.current) return
    settingsDirty.current = false
    idb.put('settings', settings, SETTINGS_KEY).catch(fail)
  }, [settings, fail])

  const value = useMemo<DataStore>(
    () => ({
      ready,
      storageError,
      datasets,
      templates,
      settings,
      persistDatasets,
      addDataset,
      updateDataset,
      removeDataset,
      clearDatasets,
      saveTemplate,
      removeTemplate,
      updateSettings,
      setPersistDatasets,
    }),
    [ready, storageError, datasets, templates, settings, persistDatasets, addDataset, updateDataset, removeDataset, clearDatasets, saveTemplate, removeTemplate, updateSettings, setPersistDatasets],
  )

  return <DataStoreContext.Provider value={value}>{children}</DataStoreContext.Provider>
}
