export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

export function formatNumber(value: number, maxFractionDigits = 0): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: maxFractionDigits }).format(value)
}

/** Money is always shown with its currency code; currencies are never mixed. */
export function formatMoney(value: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`
}

export function formatCompactMoney(value: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}`
}

export function formatPercent(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`
}

export function formatSignedPercent(ratio: number): string {
  return `${ratio > 0 ? '+' : ''}${(ratio * 100).toFixed(1)}%`
}

export function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp)
}
