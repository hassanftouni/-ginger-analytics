import { Lock } from 'lucide-react'
import { FUTURE_NAV_ITEMS, NAV_SECTIONS, type RouteId } from '@/config/navigation'
import { hrefFor } from '@/hooks/useHashRoute'
import { cn } from '@/utils/format'
import logo from '@/assets/ginger-logo.png'

interface SidebarProps {
  activeId: RouteId
  onNavigate?: () => void
}

export function Sidebar({ activeId, onNavigate }: SidebarProps) {
  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-300">
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <img src={logo} alt="Ginger & Co logo" className="size-9 shrink-0 rounded-lg object-cover" />
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">Ginger &amp; Co</p>
          <p className="text-xs text-slate-400">Analytics</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Main">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{section.title}</p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = item.id === activeId
                return (
                  <li key={item.id}>
                    <a
                      href={hrefFor(item.path)}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                        active ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white',
                      )}
                    >
                      <item.icon className={cn('size-4', active ? 'text-accent-500' : 'text-slate-400')} aria-hidden="true" />
                      {item.label}
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}

        <div>
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Coming soon</p>
          <ul className="space-y-0.5">
            {FUTURE_NAV_ITEMS.map((item) => (
              <li
                key={item.label}
                className="flex cursor-not-allowed items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-slate-500"
                aria-disabled="true"
              >
                <item.icon className="size-4" aria-hidden="true" />
                <span className="flex-1">{item.label}</span>
                <Lock className="size-3.5" aria-label="Not available yet" />
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="border-t border-white/10 px-5 py-4 text-xs text-slate-500">
        Files are processed in your browser only.
      </div>
    </div>
  )
}
