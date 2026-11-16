import { EXPORT_FORMATS, type ExportFormat } from '@/config/exportFormats'
import { toSourceTable } from '@/parsers/table'
import type { RawFile } from '@/types/data'

export interface Detection {
  format: ExportFormat
  sheetIndex: number
  headerRow: number
  /** Map from the format's expected header to the actual header text in the file. */
  headerMatch: Record<string, string>
}

const norm = (s: string) => s.replace(/^\uFEFF/, '').trim().toLowerCase()

/**
 * Identify a verified export format from headers and structure. Every sheet and the first
 * ten rows are checked for a row containing all required headers; when several formats
 * match, the one with the most required headers wins (most specific).
 */
export function detectFormat(raw: RawFile): Detection | null {
  let best: Detection | null = null
  raw.sheets.forEach((sheet, sheetIndex) => {
    const limit = Math.min(sheet.cells.length, 10)
    for (let row = 1; row <= limit; row++) {
      const { headers } = toSourceTable({ name: sheet.name, cells: sheet.cells.slice(0, row) }, row)
      const byNorm = new Map(headers.map((h) => [norm(h), h]))
      for (const format of EXPORT_FORMATS) {
        if (!format.fileTypes.includes(raw.fileType)) continue
        if (!format.requiredHeaders.every((h) => byNorm.has(norm(h)))) continue
        if (best && best.format.requiredHeaders.length >= format.requiredHeaders.length) continue
        best = {
          format,
          sheetIndex,
          headerRow: row,
          headerMatch: Object.fromEntries(format.requiredHeaders.map((h) => [h, byNorm.get(norm(h)) as string])),
        }
      }
      if (best) return
    }
  })
  return best
}

/** The format's mapping, rewritten to the exact header text found in the file. */
export function mappingForDetection(detection: Detection) {
  const mapping: Record<string, string> = {}
  for (const [field, header] of Object.entries(detection.format.mapping)) {
    if (header) mapping[field] = detection.headerMatch[header] ?? header
  }
  return mapping
}
