import { useSyncExternalStore } from 'react'

/**
 * Minimal hash-based router (e.g. `#/reports`). Hash routing works on any static
 * host without server rewrites, which suits a frontend-only deployment.
 */
function getPath(): string {
  const hash = window.location.hash.replace(/^#/, '')
  return hash.startsWith('/') ? hash : '/'
}

function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback)
  return () => window.removeEventListener('hashchange', callback)
}

export function useHashRoute(): string {
  return useSyncExternalStore(subscribe, getPath, () => '/')
}

export function hrefFor(path: string): string {
  return `#${path}`
}
