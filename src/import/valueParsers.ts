import type { CellValue } from '@/types/data'
import type { DateFormat, DecimalSeparator } from '@/types/dataset'

const pad = (n: number) => String(n).padStart(2, '0')

function isoFromParts(y: number, m: number, d: number): string | undefined {
  if (y < 100) y += 2000
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return undefined
  return `${y}-${pad(m)}-${pad(d)}`
}

/** Excel serial date (days since 1899-12-30) → ISO date. */
function fromExcelSerial(serial: number): string | undefined {
  if (serial < 1 || serial > 2958465) return undefined
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Parse a cell into an ISO date (yyyy-mm-dd). Ambiguous numeric dates such as 03/04/2026
 * use the format chosen at import; "auto" only accepts unambiguous forms.
 */
export function parseDate(value: CellValue, format: DateFormat): string | undefined {
  if (value === null || value === '') return undefined
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined
    // ExcelJS returns dates as UTC midnight.
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
  }
  if (typeof value === 'number') return fromExcelSerial(value)
  if (typeof value !== 'string') return undefined

  const text = value.trim()
  const ymd = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text)
  if (ymd) return isoFromParts(+ymd[1], +ymd[2], +ymd[3])

  const parts = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(text)
  if (parts) {
    const a = +parts[1]
    const b = +parts[2]
    const y = +parts[3]
    if (format === 'dmy') return isoFromParts(y, b, a)
    if (format === 'mdy') return isoFromParts(y, a, b)
    if (format === 'auto') {
      if (a > 12 && b <= 12) return isoFromParts(y, b, a)
      if (b > 12 && a <= 12) return isoFromParts(y, a, b)
      return undefined // ambiguous — the user must choose a format
    }
    return undefined
  }

  if (format === 'auto' || format === 'ymd') {
    const parsed = Date.parse(text)
    if (!Number.isNaN(parsed) && /[a-z]/i.test(text)) {
      const d = new Date(parsed)
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    }
  }
  return undefined
}

/** Parse a cell into a number, tolerating currency symbols, spaces and thousands separators. */
export function parseNumber(value: CellValue, decimal: DecimalSeparator): number | undefined {
  if (value === null || value === '') return undefined
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean' || value instanceof Date) return undefined

  let text = value.trim()
  const negative = /^\(.*\)$/.test(text) || /^-/.test(text) || /-$/.test(text)
  text = text.replace(/[^\d.,]/g, '')
  if (!text) return undefined
  if (decimal === ',') text = text.replace(/\./g, '').replace(',', '.')
  else text = text.replace(/,/g, '')
  const n = Number(text)
  if (!Number.isFinite(n)) return undefined
  return negative ? -n : n
}

/**
 * Parse a monetary cell such as "USD 2,209", "2,209 USD", "$1,000.50" or 2209.
 * A three-letter currency code next to the amount is returned; symbols are not
 * converted to codes (a "$" could be several currencies).
 */
export function parseMoney(value: CellValue, decimal: DecimalSeparator): { amount: number | undefined; currency: string | undefined } {
  if (typeof value === 'string') {
    const code = /(?:^|[^A-Za-z])([A-Z]{3})(?![A-Za-z])/.exec(value.trim())
    return { amount: parseNumber(value, decimal), currency: code ? code[1] : undefined }
  }
  return { amount: parseNumber(value, decimal), currency: undefined }
}

export function parseText(value: CellValue): string | undefined {
  if (value === null) return undefined
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const text = String(value).trim()
  return text === '' ? undefined : text
}
