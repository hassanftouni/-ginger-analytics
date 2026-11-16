import { Menu, Upload, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { NavItem } from '@/config/navigation'
import { hrefFor } from '@/hooks/useHashRoute'
import { useDataStore } from '@/state/dataStore'
import { useFoodyStore } from '@/state/foodyStore'
import { useTotersStore } from '@/state/totersStore'
import { Sidebar } from './Sidebar'

interface AppLayoutProps {
  route: NavItem
  children: ReactNode
}

export function AppLayout({ route, children }: AppLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { datasets, persistDatasets } = useDataStore()
  const included = datasets.filter((d) => d.included).length
  const totersImports = useTotersStore().state.imports.length
  const foodyImports = useFoodyStore().state.imports.length

  return (
    <div className="min-h-svh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar activeId={route.id} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-xl">
            <Sidebar activeId={route.id} onNavigate={() => setMobileOpen(false)} />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white"
              aria-label="Close navigation"
            >
              <X className="size-5" />
            </button>
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </button>
          <p className="text-sm font-medium text-slate-500">
            Ginger &amp; Co Analytics <span className="mx-1.5 text-slate-300">/</span>
            <span className="text-slate-900">{route.label}</span>
          </p>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-slate-500 sm:inline">
              {datasets.length === 0 && totersImports === 0 && foodyImports === 0
                ? 'No data imported'
                : `${datasets.length === 0 ? 'No app data' : `${included} of ${datasets.length} app dataset${datasets.length === 1 ? '' : 's'} in analysis`}${totersImports > 0 ? ` · Toters: ${totersImports} branch import${totersImports === 1 ? '' : 's'}` : ''}${foodyImports > 0 ? ` · Foody: ${foodyImports} import${foodyImports === 1 ? '' : 's'}` : ''} · ${persistDatasets ? 'saved on this device' : 'this session only'}`}
            </span>
            {route.id !== 'import' && (
              <a
                href={hrefFor('/import')}
                className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-accent-700"
              >
                <Upload className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Import data</span>
              </a>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
