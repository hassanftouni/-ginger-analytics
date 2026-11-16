/**
 * Test helpers: turn a raw file into a Dataset exactly as the import workflow does
 * (detect format → normalize → fingerprint), without the UI.
 */
import { readFileSync } from 'node:fs'
import { configureFromFile } from '@/import/job'
import { normalizeTable } from '@/import/normalize'
import { parseCsvText, parseExcelBuffer, toSourceTable } from '@/parsers'
import type { CellValue, RawFile } from '@/types/data'
import type { Dataset, DatasetMetadata } from '@/types/dataset'
import { fingerprintRecords } from '@/utils/hash'

let counter = 0

export function rawCsv(text: string, fileName = 'test.csv'): RawFile {
  return parseCsvText(text, fileName)
}

export function rawSheet(cells: CellValue[][], fileName = 'test.xlsx'): RawFile {
  return { fileName, fileType: 'excel', sheets: [{ name: 'Sheet1', cells }] }
}

export async function rawFromDisk(path: string): Promise<RawFile> {
  const name = path.split(/[\\/]/).pop() as string
  if (name.toLowerCase().endsWith('.csv')) return parseCsvText(readFileSync(path, 'utf8'), name)
  const buf = readFileSync(path)
  return parseExcelBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, name)
}

/** Build a dataset from a raw file using format detection, with metadata overrides. */
export function datasetFrom(raw: RawFile, meta: Partial<DatasetMetadata> = {}, file: { size?: number; lastModified?: number } = {}): Dataset {
  const config = configureFromFile(raw)
  if (!config.metadata?.category || !config.mapping) throw new Error(`No format detected for ${raw.fileName}`)
  const sheet = raw.sheets[config.sheetIndex ?? 0]
  const table = toSourceTable(sheet, config.headerRow ?? 1)
  const parseOptions = config.parseOptions ?? { dateFormat: 'auto', decimalSeparator: '.' }
  const metadata: DatasetMetadata = {
    brandId: 'ginger-and-co',
    platformId: 'weevi',
    country: 'Lebanon',
    currency: '',
    periodStart: '',
    periodEnd: '',
    branchScope: { mode: 'all', branches: [] },
    ...config.metadata,
    ...meta,
  } as DatasetMetadata
  const { records, stats } = normalizeTable(table, metadata.category, config.mapping, parseOptions)
  counter++
  return {
    id: `ds-${counter}`,
    metadata,
    source: { fileName: raw.fileName, fileSize: file.size ?? 1000 + counter, lastModified: file.lastModified ?? counter, sheetName: sheet.name, headerRow: config.headerRow ?? 1 },
    mapping: config.mapping,
    parseOptions,
    records,
    stats,
    fingerprint: fingerprintRecords(records),
    warnings: [],
    included: true,
    importedAt: counter,
  }
}
