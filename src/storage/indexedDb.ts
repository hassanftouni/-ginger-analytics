/**
 * Minimal IndexedDB wrapper. Everything stays on this device; nothing is sent anywhere.
 *
 * - `datasets`  — imported, normalized data (only when the user enables "keep data on this device")
 * - `templates` — saved column mappings (no personal data)
 * - `settings`  — reporting policy (no personal data)
 * - `toters`    — Toters days and import history, kept apart from Weevi datasets
 *                 (saved under the same "keep data on this device" preference)
 * - `foody`     — Foody (Cyprus, EUR) orders and import history, kept apart from both
 * - `plate`     — Plate reservations and import history (no personal guest data)
 */

const DB_NAME = 'ginger-analytics'
const DB_VERSION = 4

export type StoreName = 'datasets' | 'templates' | 'settings' | 'toters' | 'foody' | 'plate'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not available in this browser.'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('datasets')) db.createObjectStore('datasets', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('templates')) db.createObjectStore('templates', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings')
      if (!db.objectStoreNames.contains('toters')) db.createObjectStore('toters')
      if (!db.objectStoreNames.contains('foody')) db.createObjectStore('foody')
      if (!db.objectStoreNames.contains('plate')) db.createObjectStore('plate')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open local storage.'))
  })
  dbPromise.catch(() => {
    dbPromise = null
  })
  return dbPromise
}

function run<T>(store: StoreName, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const request = action(tx.objectStore(store))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('Local storage request failed.'))
      }),
  )
}

export const idb = {
  getAll: <T>(store: StoreName) => run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>),
  get: <T>(store: StoreName, key: IDBValidKey) => run<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>),
  put: <T>(store: StoreName, value: T, key?: IDBValidKey) => run(store, 'readwrite', (s) => s.put(value, key)),
  delete: (store: StoreName, key: IDBValidKey) => run(store, 'readwrite', (s) => s.delete(key)),
  clear: (store: StoreName) => run(store, 'readwrite', (s) => s.clear()),
}

const PERSIST_KEY = 'ginger-analytics:persist-datasets'

export function getPersistPreference(): boolean {
  try {
    return localStorage.getItem(PERSIST_KEY) === 'true'
  } catch {
    return false
  }
}

export function setPersistPreference(value: boolean) {
  try {
    localStorage.setItem(PERSIST_KEY, String(value))
  } catch {
    // Storage may be unavailable (private mode); the in-memory session still works.
  }
}
