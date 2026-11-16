import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextInput } from '@/components/ui/FormControls'
import { Panel } from '@/components/ui/Panel'
import { BRAND_LIST, BRANDS, type BrandId } from '@/config/brands'
import { buildManualBranchDataset, validateManualBranches, type ManualBranchRow } from '@/import/manual'
import { useDataStore } from '@/state/dataStore'
import type { Issue } from '@/types/dataset'

const toNumber = (s: string) => (s.trim() === '' ? undefined : Number(s))

/**
 * Enter branch figures confirmed by the business for one exact period, when no branch export
 * exists. Stored as a separate, clearly labelled dataset; never applied to another period.
 */
export function ManualBranchEntry({ defaultBrand }: { defaultBrand: BrandId }) {
  const { datasets, addDataset } = useDataStore()
  const brandsWithBranches = BRAND_LIST.filter((b) => b.branches.length > 0)
  const [brandId, setBrandId] = useState<BrandId>(BRANDS[defaultBrand].branches.length > 0 ? defaultBrand : (brandsWithBranches[0]?.id ?? defaultBrand))
  const [period, setPeriod] = useState({ start: '', end: '' })
  const [currency, setCurrency] = useState('')
  const [note, setNote] = useState('')
  const [values, setValues] = useState<Record<string, { revenue: string; orders: string }>>({})
  const [issues, setIssues] = useState<Issue[]>([])
  const [saved, setSaved] = useState<string | null>(null)
  const branches = BRANDS[brandId].branches

  if (brandsWithBranches.length === 0) return null

  const rows: ManualBranchRow[] = branches
    .filter((b) => values[b] && (values[b].revenue.trim() !== '' || values[b].orders.trim() !== ''))
    .map((b) => ({ branch: b, revenue: toNumber(values[b].revenue), orders: toNumber(values[b].orders) }))

  const save = () => {
    const input = { brandId, platformId: 'weevi' as const, currency, periodStart: period.start, periodEnd: period.end, rows, note }
    const found = validateManualBranches(input, datasets)
    setIssues(found)
    setSaved(null)
    if (found.some((i) => i.level === 'error')) return
    addDataset(buildManualBranchDataset(input, crypto.randomUUID()))
    setSaved(`Saved ${rows.map((r) => r.branch).join(', ')} for ${period.start} to ${period.end}.`)
    setValues({})
  }

  return (
    <Panel title="Add user-confirmed branch figures" description="For branches without a branch-level export. Figures apply only to the exact period entered.">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Brand" htmlFor="mb-brand">
            <Select id="mb-brand" value={brandId} onChange={(e) => setBrandId(e.target.value as BrandId)}>
              {brandsWithBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Period start" htmlFor="mb-from" required>
            <TextInput id="mb-from" type="date" value={period.start} onChange={(e) => setPeriod({ ...period, start: e.target.value })} />
          </Field>
          <Field label="Period end" htmlFor="mb-to" required>
            <TextInput id="mb-to" type="date" value={period.end} onChange={(e) => setPeriod({ ...period, end: e.target.value })} />
          </Field>
          <Field label="Currency" htmlFor="mb-currency" required>
            <TextInput id="mb-currency" value={currency} maxLength={3} placeholder="e.g. USD" className="uppercase placeholder:normal-case" onChange={(e) => setCurrency(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
          </Field>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Branch</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Revenue</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Orders</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {branches.map((b) => (
                <tr key={b}>
                  <td className="px-3 py-2 text-slate-800">
                    {b}
                    {BRANDS[brandId].branchNotes?.[b] && <span className="ml-2 text-xs text-slate-500">{BRANDS[brandId].branchNotes?.[b]}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <TextInput aria-label={`${b} revenue`} type="number" min="0" step="any" className="max-w-40" value={values[b]?.revenue ?? ''} onChange={(e) => setValues({ ...values, [b]: { revenue: e.target.value, orders: values[b]?.orders ?? '' } })} />
                  </td>
                  <td className="px-3 py-2">
                    <TextInput aria-label={`${b} orders`} type="number" min="0" step="1" className="max-w-32" value={values[b]?.orders ?? ''} onChange={(e) => setValues({ ...values, [b]: { revenue: values[b]?.revenue ?? '', orders: e.target.value } })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Field label="Note (optional)" htmlFor="mb-note">
          <TextInput id="mb-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Confirmed by operations; no separate branch export yet" />
        </Field>
        <p className="text-xs text-slate-500">Leave a branch empty when its figures are not known — it will be shown as incomplete data, never as zero.</p>
        {issues.filter((i) => i.level === 'error').map((i, n) => (
          <Alert key={n} level="error">
            {i.message}
          </Alert>
        ))}
        {saved && <Alert level="info">{saved} They are labelled as user-confirmed in dashboards and exports.</Alert>}
        <div className="flex justify-end">
          <Button variant="primary" onClick={save} disabled={rows.length === 0}>
            <Plus className="size-4" aria-hidden="true" /> Save figures
          </Button>
        </div>
      </div>
    </Panel>
  )
}
