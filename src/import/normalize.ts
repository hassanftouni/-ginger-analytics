import { CATEGORIES, FIELDS, type ImportCategory, type StandardField } from '@/config/categories'
import type { SourceTable } from '@/types/data'
import type { ColumnMapping, NormalizationStats, NormalizedRecord, ParseOptions } from '@/types/dataset'
import { parseDate, parseMoney, parseNumber, parseText } from './valueParsers'

/** Number fields that hold money; a currency code inside the value is kept with the record. */
const MONEY_FIELDS: ReadonlySet<StandardField> = new Set(['revenue', 'averageOrderValue'])

export interface NormalizationResult {
  records: NormalizedRecord[]
  stats: NormalizationStats
  /** Per source-row problems, for the preview (row index → messages). */
  rowProblems: Map<number, string[]>
}

/**
 * Apply a column mapping to a source table. Only mapped standardized fields are kept, so
 * unmapped columns (which may contain personal data) are never stored. Rows missing a
 * required field, or where a required value cannot be parsed, are skipped and counted.
 */
export function normalizeTable(
  table: SourceTable,
  category: ImportCategory,
  mapping: ColumnMapping,
  options: ParseOptions,
): NormalizationResult {
  const rules = CATEGORIES[category].fields
  const mapped = rules.filter((r) => mapping[r.field])
  const records: NormalizedRecord[] = []
  const rowProblems = new Map<number, string[]>()
  let invalidDates = 0
  let invalidNumbers = 0
  let minDate: string | undefined
  let maxDate: string | undefined
  const orderIds = new Set<string>()
  let duplicateOrderIdsInFile = 0
  const valueCurrencies = new Set<string>()

  table.rows.forEach((row, index) => {
    // Skip completely blank rows silently.
    if (Object.values(row).every((v) => v === null)) return

    const record: NormalizedRecord = {}
    const problems: string[] = []
    let skip = false

    for (const rule of mapped) {
      const header = mapping[rule.field] as string
      const raw = row[header] ?? null
      const def = FIELDS[rule.field]
      let parsed: string | number | undefined
      if (def.type === 'date') {
        parsed = parseDate(raw, options.dateFormat)
        if (parsed === undefined && raw !== null) {
          invalidDates++
          problems.push(`${def.label}: “${String(raw)}” is not a recognised date`)
        }
      } else if (def.type === 'number' && MONEY_FIELDS.has(rule.field)) {
        const money = parseMoney(raw, options.decimalSeparator)
        parsed = money.amount
        if (money.currency) {
          valueCurrencies.add(money.currency)
          if (!mapping.currency) record.currency = money.currency
        }
        if (parsed === undefined && raw !== null) {
          invalidNumbers++
          problems.push(`${def.label}: “${String(raw)}” is not a number`)
        }
      } else if (def.type === 'number') {
        parsed = parseNumber(raw, options.decimalSeparator)
        if (parsed === undefined && raw !== null) {
          invalidNumbers++
          problems.push(`${def.label}: “${String(raw)}” is not a number`)
        }
      } else {
        parsed = parseText(raw)
        if (parsed !== undefined && rule.field === 'currency') parsed = parsed.toUpperCase()
      }

      if (parsed === undefined) {
        if (rule.required) {
          skip = true
          if (raw === null) problems.push(`${def.label} is empty`)
        }
        continue
      }
      ;(record as Record<StandardField, string | number>)[rule.field] = parsed
    }

    if (problems.length > 0) rowProblems.set(index, problems)
    if (skip) return

    if (record.date) {
      if (!minDate || record.date < minDate) minDate = record.date
      if (!maxDate || record.date > maxDate) maxDate = record.date
    }
    if (record.orderId) {
      if (orderIds.has(record.orderId)) duplicateOrderIdsInFile++
      orderIds.add(record.orderId)
    }
    records.push(record)
  })

  const nonBlank = table.rows.filter((r) => !Object.values(r).every((v) => v === null)).length

  return {
    records,
    rowProblems,
    stats: {
      sourceRows: nonBlank,
      importedRows: records.length,
      skippedRows: nonBlank - records.length,
      invalidDates,
      invalidNumbers,
      duplicateOrderIdsInFile,
      minDate,
      maxDate,
      valueCurrencies: [...valueCurrencies].sort(),
    },
  }
}
