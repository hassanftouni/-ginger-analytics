import { CATEGORIES, FIELDS, type ImportCategory } from '@/config/categories'
import type { ColumnMapping, NormalizedRecord } from '@/types/dataset'
import { PREVIEW_ROWS } from '@/import/preview'

interface NormalizedPreviewProps {
  category: ImportCategory
  mapping: ColumnMapping
  records: NormalizedRecord[]
}

/** The first rows as they will be stored: standardized fields only, typed and cleaned. */
export function NormalizedPreview({ category, mapping, records }: NormalizedPreviewProps) {
  const fields = CATEGORIES[category].fields.map((r) => r.field).filter((f) => mapping[f])
  const rows = records.slice(0, PREVIEW_ROWS)
  if (fields.length === 0) return null
  return (
    <div className="max-h-80 overflow-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-xs">
        <thead className="sticky top-0 bg-slate-50">
          <tr>
            {fields.map((f) => (
              <th key={f} scope="col" className="whitespace-nowrap px-3 py-2 text-left font-semibold text-slate-600">
                {FIELDS[f].label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((r, i) => (
            <tr key={i}>
              {fields.map((f) => {
                const v = FIELDS[f].sensitive && f !== 'customerId' && r[f] !== undefined ? 'hidden' : r[f]
                return (
                  <td key={f} className={`max-w-64 truncate whitespace-nowrap px-3 py-1.5 ${typeof v === 'number' ? 'text-right tabular-nums' : ''} ${v === undefined ? 'text-slate-300' : 'text-slate-700'}`}>
                    {v === undefined ? '—' : String(v)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
