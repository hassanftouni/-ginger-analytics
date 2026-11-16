import type { CellValue, RawSheet, SourceTable } from '@/types/data'

/**
 * Interpret a raw sheet using the given 1-based header row. Empty header cells are named
 * "Column N"; repeated header text gets a " (2)", " (3)" suffix so no column is lost.
 */
export function toSourceTable(sheet: RawSheet, headerRow: number): SourceTable {
  const headerCells = sheet.cells[headerRow - 1] ?? []
  const body = sheet.cells.slice(headerRow)
  let width = Math.max(headerCells.length, ...body.map((r) => r.length), 0)
  // Drop trailing columns with no header and no values (e.g. a trailing comma in CSV exports).
  const isEmpty = (v: CellValue | undefined) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
  while (width > 0 && isEmpty(headerCells[width - 1]) && body.every((r) => isEmpty(r[width - 1]))) width--

  const seen = new Map<string, number>()
  const headers: string[] = []
  for (let c = 0; c < width; c++) {
    const raw = headerCells[c]
    let name = raw === null || raw === undefined ? '' : raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).replace(/^\uFEFF/, '').trim()
    if (!name) name = `Column ${c + 1}`
    const count = (seen.get(name) ?? 0) + 1
    seen.set(name, count)
    headers.push(count > 1 ? `${name} (${count})` : name)
  }

  const rows = body.map((cells) => {
    const row: Record<string, CellValue> = {}
    headers.forEach((h, c) => {
      row[h] = cells[c] ?? null
    })
    return row
  })

  return { headers, rows }
}

/** First row that looks like a header: the first row with at least two non-empty text cells. */
export function guessHeaderRow(sheet: RawSheet): number {
  const limit = Math.min(sheet.cells.length, 20)
  for (let i = 0; i < limit; i++) {
    const textCells = sheet.cells[i].filter((v) => typeof v === 'string' && v.trim() !== '').length
    if (textCells >= 2) return i + 1
  }
  return 1
}
