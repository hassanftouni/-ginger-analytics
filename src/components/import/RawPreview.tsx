import { PREVIEW_ROWS, renderCell } from '@/import/preview'
import type { SourceTable } from '@/types/data'

/** Detected column names and the first rows exactly as they appear in the export. */
export function RawPreview({ table, hiddenHeaders = [] }: { table: SourceTable; hiddenHeaders?: string[] }) {
  const hidden = new Set(hiddenHeaders)
  const rows = table.rows.slice(0, PREVIEW_ROWS)
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-700">Detected columns ({table.headers.length})</p>
        <div className="flex flex-wrap gap-1.5">
          {table.headers.map((h) => (
            <code key={h} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
              {h}
            </code>
          ))}
        </div>
      </div>
      {hidden.size > 0 && <p className="text-xs text-slate-500">Personal data columns are hidden in this preview: {[...hidden].join(', ')}.</p>}
      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-700">
          First {rows.length} of {table.rows.length.toLocaleString('en-US')} rows
        </p>
        <div className="max-h-80 overflow-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <th scope="col" className="px-2 py-2 text-right font-medium text-slate-400">
                  #
                </th>
                {table.headers.map((h) => (
                  <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 text-left font-semibold text-slate-600">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((row, i) => (
                <tr key={i}>
                  <td className="px-2 py-1.5 text-right text-slate-400">{i + 1}</td>
                  {table.headers.map((h) => (
                    <td key={h} className="max-w-64 truncate whitespace-nowrap px-3 py-1.5 text-slate-700" title={hidden.has(h) ? undefined : renderCell(row[h])}>
                      {hidden.has(h) ? <span className="text-slate-400">hidden</span> : renderCell(row[h])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
