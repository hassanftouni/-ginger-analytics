import type { CellValue as ExcelCellValue, Worksheet } from 'exceljs'
import type { CellValue, RawFile, RawSheet } from '@/types/data'

/** Convert an ExcelJS cell value (formula, rich text, hyperlink…) to a primitive. */
function toPrimitive(value: ExcelCellValue): CellValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value.trim() === '' ? null : value
  if (typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) return value
  if (typeof value === 'object') {
    if ('result' in value) return toPrimitive(value.result as ExcelCellValue)
    if ('richText' in value) return value.richText.map((part) => part.text).join('')
    if ('text' in value) return String(value.text)
    if ('error' in value) return null
  }
  return String(value)
}

function readWorksheet(sheet: Worksheet): RawSheet {
  const cells: CellValue[][] = []
  const width = sheet.columnCount
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: CellValue[] = []
    for (let c = 1; c <= width; c++) values.push(toPrimitive(row.getCell(c).value))
    // Drop trailing empty cells to keep rows compact.
    while (values.length > 0 && values[values.length - 1] === null) values.pop()
    if (values.length > 0) cells.push(values)
  })
  return { name: sheet.name, cells }
}

/** Read .xlsx bytes. Every worksheet is returned as a grid of cells. */
export async function parseExcelBuffer(buffer: ArrayBuffer, fileName: string): Promise<RawFile> {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer)
  } catch (error) {
    throw new Error(
      `Could not open “${fileName}” as an Excel workbook. It may be corrupted, password-protected, or saved in the older .xls format. (${error instanceof Error ? error.message : String(error)})`,
      { cause: error },
    )
  }
  return { fileName, fileType: 'excel', sheets: workbook.worksheets.map(readWorksheet) }
}

/** Read an .xlsx workbook in the browser. */
export async function parseExcelFile(file: File): Promise<RawFile> {
  return parseExcelBuffer(await file.arrayBuffer(), file.name)
}
