import type { CellValue } from '@/types/data'

/** Number of rows shown in import previews. */
export const PREVIEW_ROWS = 20

export function renderCell(value: CellValue | undefined): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value)
}
