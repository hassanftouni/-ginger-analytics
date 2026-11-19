import type { ImportCategory } from '@/config/categories'
import type { ExportFormatId } from '@/config/exportFormats'
import { detectFormat, mappingForDetection } from './detect'
import { normalizeTable } from './normalize'
import { guessHeaderRow, toSourceTable } from '@/parsers/table'
import type { PlatformId } from '@/config/brands'
import type { RawFile } from '@/types/data'
import type { ColumnMapping, MappingTemplate, ParseOptions } from '@/types/dataset'
import type { MetadataDraft } from './validation'
import type { TotersParseResult } from '@/toters/parse'
import type { TotersImport } from '@/toters/types'
import type { FoodyParseResult } from '@/foody/parse'
import type { FoodyImportResult } from '@/foody/types'
import type { PlateParseResult } from '@/plate/parse'
import type { PlateImportResult } from '@/plate/types'

/** One uploaded file moving through read → configure → confirm. */
export interface ImportJob {
  id: string
  file: File
  state: 'reading' | 'ready' | 'failed' | 'imported' | 'skipped'
  raw?: RawFile
  error?: string
  sheetIndex: number
  headerRow: number
  metadata: MetadataDraft
  mapping: ColumnMapping
  parseOptions: ParseOptions
  saveTemplate: boolean
  templateNote?: string
  /** Set when a verified export format was recognised from the headers. */
  detection?: { formatId: ExportFormatId; headerMatch: Record<string, string> }
  /** Set when the file is a Toters export: it goes to the separate Toters importer, never to Weevi. */
  toters?: TotersParseResult
  totersResult?: { kind: 'imported' | 'skipped'; entries: TotersImport[]; message: string }
  /** Set when the file is a Foody order export: it goes to the separate Foody importer. */
  foody?: FoodyParseResult
  foodyResult?: FoodyImportResult
  /** Set when the file is a Plate bookings export: it goes to the separate Plate importer. */
  plate?: PlateParseResult
  plateResult?: PlateImportResult
}

export const DEFAULT_PARSE_OPTIONS: ParseOptions = { dateFormat: 'auto', decimalSeparator: '.' }

export function templateId(platformId: PlatformId, category: ImportCategory): string {
  return `${platformId}:${category}`
}

export function findTemplate(templates: MappingTemplate[], platformId?: PlatformId, category?: ImportCategory): MappingTemplate | undefined {
  if (!platformId || !category) return undefined
  return templates.find((t) => t.id === templateId(platformId, category))
}

/** Keep only mapping entries whose column exists in the current headers. */
export function pruneMapping(mapping: ColumnMapping, headers: string[]): ColumnMapping {
  const set = new Set(headers)
  return Object.fromEntries(Object.entries(mapping).filter(([, h]) => h && set.has(h))) as ColumnMapping
}

/** Apply a saved template to a set of headers; reports columns the template expects but the file lacks. */
export function applyTemplate(template: MappingTemplate, headers: string[]): { mapping: ColumnMapping; missing: string[] } {
  const set = new Set(headers)
  const mapping: ColumnMapping = {}
  const missing: string[] = []
  for (const [field, header] of Object.entries(template.mapping)) {
    if (!header) continue
    if (set.has(header)) mapping[field as keyof ColumnMapping] = header
    else missing.push(header)
  }
  return { mapping, missing }
}

/**
 * Initial configuration for a freshly read file: detect a verified format from its headers,
 * pre-fill the mapping, platform and report type, and take the currency from the amounts when
 * they carry one. Brand, branch scope and (when absent from the file) period and currency are
 * left for the user to choose.
 */
export function configureFromFile(raw: RawFile): Partial<ImportJob> {
  const detection = detectFormat(raw)
  if (!detection) {
    return { raw, state: 'ready', sheetIndex: 0, headerRow: guessHeaderRow(raw.sheets[0]), metadata: {}, mapping: {}, saveTemplate: true }
  }
  const { format } = detection
  const mapping = mappingForDetection(detection) as ColumnMapping
  const metadata: ImportJob['metadata'] = { platformId: format.platformId, category: format.category, formatId: format.id }
  if (format.currency === 'from-values') {
    const table = toSourceTable(raw.sheets[detection.sheetIndex], detection.headerRow)
    const { stats } = normalizeTable(table, format.category, mapping, format.parseOptions)
    if (stats.valueCurrencies.length === 1) metadata.currency = stats.valueCurrencies[0]
  }
  return {
    raw,
    state: 'ready',
    sheetIndex: detection.sheetIndex,
    headerRow: detection.headerRow,
    metadata,
    mapping,
    parseOptions: format.parseOptions,
    saveTemplate: false,
    detection: { formatId: format.id, headerMatch: detection.headerMatch },
  }
}
