import Papa from 'papaparse'
import type { CellValue, RawFile } from '@/types/data'

/** Parse CSV text into a grid of cells. A leading byte-order mark is removed. */
export function parseCsvText(text: string, fileName: string): RawFile {
  const clean = text.replace(/^\uFEFF/, '')
  const result = Papa.parse<string[]>(clean, { header: false, skipEmptyLines: 'greedy' })
  if (result.data.length === 0) {
    const reason = result.errors[0]?.message
    throw new Error(`“${fileName}” contains no readable CSV rows${reason ? ` (${reason})` : ''}.`)
  }
  const cells: CellValue[][] = result.data.map((row) => row.map((v) => (v.trim() === '' ? null : v)))
  return { fileName, fileType: 'csv', sheets: [{ name: fileName, cells }] }
}

/** Read a CSV file in the browser. Values stay as text; typing happens at mapping time. */
export async function parseCsvFile(file: File): Promise<RawFile> {
  return parseCsvText(await file.text(), file.name)
}
