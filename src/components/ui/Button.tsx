import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/utils/format'

type Variant = 'primary' | 'secondary' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent-600 text-white shadow-sm hover:bg-accent-700 disabled:bg-slate-300',
  secondary: 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:text-slate-300',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

export function Button({ variant = 'secondary', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 disabled:cursor-not-allowed',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  )
}
