import { createContext, useContext } from 'react'
import type { Dataset, MappingTemplate } from '@/types/dataset'
import type { ReportingSettings } from '@/types/settings'

export interface DataStore {
  ready: boolean
  storageError: string | null
  datasets: Dataset[]
  templates: MappingTemplate[]
  settings: ReportingSettings
  persistDatasets: boolean

  addDataset: (dataset: Dataset) => void
  updateDataset: (id: string, patch: Partial<Pick<Dataset, 'included' | 'exclusionReason' | 'metadata'>>) => void
  removeDataset: (id: string) => void
  clearDatasets: () => void

  saveTemplate: (template: MappingTemplate) => void
  removeTemplate: (id: string) => void

  updateSettings: (patch: Partial<ReportingSettings>) => void
  setPersistDatasets: (value: boolean) => void
}

export const DataStoreContext = createContext<DataStore | null>(null)

export function useDataStore(): DataStore {
  const store = useContext(DataStoreContext)
  if (!store) throw new Error('useDataStore must be used inside <DataStoreProvider>')
  return store
}
