import type { RawFile } from '@/types/data'
import { parseCsvFile } from './csv'
import { parseExcelFile } from './excel'

export { guessHeaderRow, toSourceTable } from './table'
export { parseCsvText } from './csv'
export { parseExcelBuffer } from './excel'

export const SUPPORTED_EXTENSIONS = ['.csv', '.xlsx'] as const

/** Read a file with the parser for its extension. All processing happens client-side. */
export async function readFile(file: File): Promise<RawFile> {
  const name = file.name.toLowerCase()
  if (file.size === 0) throw new Error(`“${file.name}” is empty.`)
  let result: RawFile
  if (name.endsWith('.csv')) result = await parseCsvFile(file)
  else if (name.endsWith('.xlsx')) result = await parseExcelFile(file)
  else if (name.endsWith('.xls'))
    throw new Error(`“${file.name}” is in the older .xls format. Open it in Excel and save it as .xlsx, then upload again.`)
  else throw new Error(`“${file.name}” is not supported. Upload a ${SUPPORTED_EXTENSIONS.join(' or ')} file.`)

  const nonEmpty = result.sheets.filter((s) => s.cells.length > 0)
  if (nonEmpty.length === 0) throw new Error(`“${file.name}” contains no data.`)
  return { ...result, sheets: nonEmpty }
}
