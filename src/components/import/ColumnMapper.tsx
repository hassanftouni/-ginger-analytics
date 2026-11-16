import { Field, Select } from '@/components/ui/FormControls'
import { Badge } from '@/components/ui/Badge'
import { CATEGORIES, FIELDS, type ImportCategory, type StandardField } from '@/config/categories'
import type { SourceTable } from '@/types/data'
import type { ColumnMapping, DateFormat, DecimalSeparator, ParseOptions } from '@/types/dataset'
import { renderCell } from '@/import/preview'

interface ColumnMapperProps {
  category: ImportCategory
  table: SourceTable
  mapping: ColumnMapping
  onMappingChange: (next: ColumnMapping) => void
  parseOptions: ParseOptions
  onParseOptionsChange: (next: ParseOptions) => void
}

function samples(table: SourceTable, header: string | undefined): string {
  if (!header) return ''
  const values: string[] = []
  for (const row of table.rows) {
    const v = renderCell(row[header])
    if (v && !values.includes(v)) values.push(v)
    if (values.length === 3) break
  }
  return values.join(' · ')
}

/** Maps the export's own columns onto the standardized fields for the chosen report type. */
export function ColumnMapper({ category, table, mapping, onMappingChange, parseOptions, onParseOptionsChange }: ColumnMapperProps) {
  const rules = CATEGORIES[category].fields
  const setField = (field: StandardField, header: string) => {
    const next = { ...mapping }
    if (header) next[field] = header
    else delete next[field]
    onMappingChange(next)
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Standard field
              </th>
              <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Column in this export
              </th>
              <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Sample values
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rules.map((rule) => {
              const def = FIELDS[rule.field]
              const id = `map-${rule.field}`
              return (
                <tr key={rule.field}>
                  <td className="px-3 py-2 align-top">
                    <label htmlFor={id} className="flex items-center gap-2 font-medium text-slate-800">
                      {def.label}
                      {rule.required ? <Badge tone="accent">Required</Badge> : <span className="text-xs font-normal text-slate-400">optional</span>}
                    </label>
                    <p className="text-xs text-slate-500">{def.description}</p>
                  </td>
                  <td className="w-64 px-3 py-2 align-top">
                    <Select id={id} value={mapping[rule.field] ?? ''} onChange={(e) => setField(rule.field, e.target.value)}>
                      <option value="">— Not mapped —</option>
                      {table.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="max-w-xs truncate px-3 py-2 align-top text-xs text-slate-500" title={samples(table, mapping[rule.field])}>
                    {samples(table, mapping[rule.field]) || '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Date format" htmlFor="opt-date" hint="Automatic only accepts unambiguous dates; pick a format for values like 03/04/2026.">
          <Select id="opt-date" value={parseOptions.dateFormat} onChange={(e) => onParseOptionsChange({ ...parseOptions, dateFormat: e.target.value as DateFormat })}>
            <option value="auto">Automatic</option>
            <option value="dmy">Day / Month / Year</option>
            <option value="mdy">Month / Day / Year</option>
            <option value="ymd">Year-Month-Day</option>
          </Select>
        </Field>
        <Field label="Decimal separator" htmlFor="opt-decimal">
          <Select id="opt-decimal" value={parseOptions.decimalSeparator} onChange={(e) => onParseOptionsChange({ ...parseOptions, decimalSeparator: e.target.value as DecimalSeparator })}>
            <option value=".">Point — 1,234.56</option>
            <option value=",">Comma — 1.234,56</option>
          </Select>
        </Field>
      </div>
    </div>
  )
}
