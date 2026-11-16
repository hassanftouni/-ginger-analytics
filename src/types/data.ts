/** A primitive cell value after reading a file. */
export type CellValue = string | number | boolean | Date | null

/** One table of raw cells (a CSV file, or one worksheet), before a header row is chosen. */
export interface RawSheet {
  name: string
  cells: CellValue[][]
}

/** The result of reading one uploaded file. */
export interface RawFile {
  fileName: string
  fileType: 'csv' | 'excel'
  sheets: RawSheet[]
}

/** A sheet interpreted with a chosen header row. Header text is kept exactly as written. */
export interface SourceTable {
  headers: string[]
  rows: Record<string, CellValue>[]
}
