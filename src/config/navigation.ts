import type { LucideIcon } from 'lucide-react'
import {
  Building2,
  CalendarDays,
  FileChartColumn,
  History,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  ShoppingBag,
  Smartphone,
  Store,
  Truck,
  Upload,
  UtensilsCrossed,
  Bike,
  Users,
} from 'lucide-react'

export type RouteId =
  | 'overview'
  | 'brand-ginger-and-co'
  | 'brand-pertutti'
  | 'platform-weevi'
  | 'platform-toters'
  | 'platform-foody'
  | 'branches'
  | 'products'
  | 'customers'
  | 'feedback'
  | 'reports'
  | 'import'
  | 'history'
  | 'toters-history'
  | 'foody-history'
  | 'settings'

export interface NavItem {
  id: RouteId
  path: string
  label: string
  icon: LucideIcon
  /** Analytics pages show the global filter bar. */
  analytics: boolean
}

export interface NavSection {
  title: string
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Dashboards',
    items: [
      { id: 'overview', path: '/', label: 'Executive overview', icon: LayoutDashboard, analytics: true },
      { id: 'brand-ginger-and-co', path: '/brands/ginger-and-co', label: 'Ginger & Co', icon: Store, analytics: true },
      { id: 'brand-pertutti', path: '/brands/pertutti', label: 'Pertutti', icon: UtensilsCrossed, analytics: true },
    ],
  },
  {
    title: 'Platforms',
    items: [
      { id: 'platform-weevi', path: '/platforms/weevi', label: 'Weevi analytics', icon: Smartphone, analytics: true },
      { id: 'platform-toters', path: '/platforms/toters', label: 'Toters analytics', icon: Truck, analytics: true },
      { id: 'platform-foody', path: '/platforms/foody', label: 'Foody analytics', icon: Bike, analytics: true },
    ],
  },
  {
    title: 'Analysis',
    items: [
      { id: 'branches', path: '/branches', label: 'Branch performance', icon: Building2, analytics: true },
      { id: 'products', path: '/products', label: 'Products & best sellers', icon: ShoppingBag, analytics: true },
      { id: 'customers', path: '/customers', label: 'Customer insights', icon: Users, analytics: true },
      { id: 'feedback', path: '/feedback', label: 'Customer feedback', icon: MessageSquareText, analytics: true },
    ],
  },
  {
    title: 'Reports & data',
    items: [
      { id: 'reports', path: '/reports', label: 'Report generator', icon: FileChartColumn, analytics: true },
      { id: 'import', path: '/import', label: 'Import data', icon: Upload, analytics: false },
      { id: 'history', path: '/history', label: 'Import history', icon: History, analytics: false },
      { id: 'toters-history', path: '/toters/history', label: 'Toters import history', icon: Truck, analytics: false },
      { id: 'foody-history', path: '/foody/history', label: 'Foody import history', icon: Bike, analytics: false },
      { id: 'settings', path: '/settings', label: 'Reporting settings', icon: Settings, analytics: false },
    ],
  },
]

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items)

export const FUTURE_NAV_ITEMS = [{ label: 'Reservations (Table 4, Plate)', icon: CalendarDays }]

export function findRoute(path: string): NavItem {
  return ALL_NAV_ITEMS.find((item) => item.path === path) ?? ALL_NAV_ITEMS[0]
}
