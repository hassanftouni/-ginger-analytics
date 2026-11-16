import { CircleAlert, Info, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { IssueLevel } from '@/types/dataset'
import { cn } from '@/utils/format'

const STYLES: Record<IssueLevel, { icon: LucideIcon; className: string; label: string }> = {
  error: { icon: CircleAlert, className: 'border-red-200 bg-red-50 text-red-800', label: 'Error' },
  warning: { icon: TriangleAlert, className: 'border-amber-200 bg-amber-50 text-amber-900', label: 'Warning' },
  info: { icon: Info, className: 'border-sky-200 bg-sky-50 text-sky-900', label: 'Note' },
}

interface AlertProps {
  level: IssueLevel
  title?: string
  children: ReactNode
  className?: string
}

/** Status message. Always carries an icon and a text label, never colour alone. */
export function Alert({ level, title, children, className }: AlertProps) {
  const { icon: Icon, className: tone, label } = STYLES[level]
  return (
    <div role={level === 'error' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg border px-4 py-3 text-sm', tone, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>
        <span className="sr-only">{label}: </span>
        {title && <p className="font-medium">{title}</p>}
        <div className={title ? 'mt-0.5 opacity-90' : undefined}>{children}</div>
      </div>
    </div>
  )
}
