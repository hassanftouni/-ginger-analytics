import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/utils/format'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  compact?: boolean
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, compact }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60 text-center',
        compact ? 'px-4 py-8' : 'px-6 py-14',
      )}
    >
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-white text-slate-400 ring-1 ring-slate-200">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
