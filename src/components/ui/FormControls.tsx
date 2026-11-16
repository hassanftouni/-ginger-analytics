import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { cn } from '@/utils/format'

const CONTROL =
  'block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100 disabled:bg-slate-50 disabled:text-slate-500'

interface FieldProps {
  label: string
  htmlFor: string
  hint?: ReactNode
  required?: boolean
  children: ReactNode
  className?: string
}

export function Field({ label, htmlFor, hint, required, children, className }: FieldProps) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(CONTROL, className)} {...props} />
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, className)} {...props} />
}
