import type { ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  align?: 'left' | 'right'
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  empty: ReactNode
}

export function DataTable<T>({ columns, rows, rowKey, empty }: DataTableProps<T>) {
  if (rows.length === 0) return <>{empty}</>
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 ${col.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-slate-50">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`whitespace-nowrap px-3 py-2.5 text-slate-700 ${col.align === 'right' ? 'text-right tabular-nums' : ''}`}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
