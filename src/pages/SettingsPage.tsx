import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { allStatusValues } from '@/analytics'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextInput } from '@/components/ui/FormControls'
import { PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { useDataStore } from '@/state/dataStore'
import type { StatusTreatment } from '@/types/settings'

const code = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)

export function SettingsPage() {
  const { settings, updateSettings, datasets } = useDataStore()
  const statuses = allStatusValues(datasets)
  const [rate, setRate] = useState({ from: '', to: '', rate: '' })
  const [customStatus, setCustomStatus] = useState('')

  const knownStatuses = [...new Set([...statuses, ...settings.cancelledStatuses, ...settings.refundedStatuses])].sort((a, b) => a.localeCompare(b))
  const classOf = (s: string) => (settings.cancelledStatuses.includes(s) ? 'cancelled' : settings.refundedStatuses.includes(s) ? 'refunded' : 'counted')
  const setClass = (s: string, cls: 'cancelled' | 'refunded' | 'counted') =>
    updateSettings({
      cancelledStatuses: cls === 'cancelled' ? [...settings.cancelledStatuses.filter((x) => x !== s), s] : settings.cancelledStatuses.filter((x) => x !== s),
      refundedStatuses: cls === 'refunded' ? [...settings.refundedStatuses.filter((x) => x !== s), s] : settings.refundedStatuses.filter((x) => x !== s),
    })

  const rateValid = code(rate.from).length === 3 && code(rate.to).length === 3 && code(rate.from) !== code(rate.to) && Number(rate.rate) > 0

  return (
    <>
      <PageHeader title="Reporting settings" description="The business rules applied to every dashboard and export. Nothing is assumed — each rule is set here." />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title="Cancelled & refunded orders" description="Classify the order status values found in your exports">
          <div className="space-y-4">
            {knownStatuses.length === 0 ? (
              <Alert level="info">No order status values found yet. Map an “Order status” column when importing orders, or add a value below.</Alert>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {knownStatuses.map((s) => (
                  <li key={s} className="flex items-center justify-between gap-3 px-3 py-2">
                    <code className="text-sm text-slate-800">{s}</code>
                    <Select aria-label={`Treatment for status ${s}`} className="w-40" value={classOf(s)} onChange={(e) => setClass(s, e.target.value as 'cancelled' | 'refunded' | 'counted')}>
                      <option value="counted">Normal order</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="refunded">Refunded</option>
                    </Select>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-end gap-2">
              <Field label="Add a status value" htmlFor="custom-status" className="flex-1">
                <TextInput id="custom-status" value={customStatus} onChange={(e) => setCustomStatus(e.target.value)} placeholder="Exactly as it appears in the export" />
              </Field>
              <Button
                disabled={!customStatus.trim()}
                onClick={() => {
                  setClass(customStatus.trim(), 'cancelled')
                  setCustomStatus('')
                }}
              >
                Add as cancelled
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Cancelled orders are" htmlFor="cancel-treatment">
                <Select id="cancel-treatment" value={settings.cancelledTreatment} onChange={(e) => updateSettings({ cancelledTreatment: e.target.value as StatusTreatment })}>
                  <option value="exclude">Excluded from revenue and orders</option>
                  <option value="include">Included in revenue and orders</option>
                </Select>
              </Field>
              <Field label="Refunded orders are" htmlFor="refund-treatment">
                <Select id="refund-treatment" value={settings.refundedTreatment} onChange={(e) => updateSettings({ refundedTreatment: e.target.value as StatusTreatment })}>
                  <option value="exclude">Excluded from revenue and orders</option>
                  <option value="include">Included in revenue and orders</option>
                </Select>
              </Field>
            </div>
            <p className="text-xs text-slate-500">Matching ignores letter case and surrounding spaces. Until values are classified, every order is counted and a data-quality warning is shown.</p>
          </div>
        </Panel>

        <Panel title="Currencies & exchange rates" description="Currencies are reported separately unless you provide a rate">
          <div className="space-y-4">
            {settings.exchangeRates.length > 0 && (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {settings.exchangeRates.map((r, i) => (
                  <li key={`${r.from}-${r.to}`} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>
                      1 {r.from} = <strong className="tabular-nums">{r.rate}</strong> {r.to}
                    </span>
                    <Button variant="ghost" className="px-2 py-1" aria-label={`Remove rate ${r.from} to ${r.to}`} onClick={() => updateSettings({ exchangeRates: settings.exchangeRates.filter((_, j) => j !== i) })}>
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-3 items-end gap-2">
              <Field label="From" htmlFor="rate-from">
                <TextInput id="rate-from" value={rate.from} maxLength={3} placeholder="e.g. EUR" className="uppercase placeholder:normal-case" onChange={(e) => setRate({ ...rate, from: code(e.target.value) })} />
              </Field>
              <Field label="To" htmlFor="rate-to">
                <TextInput id="rate-to" value={rate.to} maxLength={3} placeholder="e.g. USD" className="uppercase placeholder:normal-case" onChange={(e) => setRate({ ...rate, to: code(e.target.value) })} />
              </Field>
              <Field label="Rate" htmlFor="rate-value">
                <TextInput id="rate-value" type="number" min="0" step="any" value={rate.rate} onChange={(e) => setRate({ ...rate, rate: e.target.value })} />
              </Field>
            </div>
            <Button
              disabled={!rateValid}
              onClick={() => {
                const from = code(rate.from)
                const to = code(rate.to)
                updateSettings({ exchangeRates: [...settings.exchangeRates.filter((r) => !(r.from === from && r.to === to)), { from, to, rate: Number(rate.rate) }] })
                setRate({ from: '', to: '', rate: '' })
              }}
            >
              <Plus className="size-4" aria-hidden="true" /> Add rate
            </Button>
            <Field label="Reporting currency for combined totals" htmlFor="rep-currency" hint="Leave empty to keep every currency separate. A combined total is shown only when every currency has a rate.">
              <TextInput id="rep-currency" value={settings.reportingCurrency} maxLength={3} placeholder="None" className="uppercase placeholder:normal-case sm:max-w-40" onChange={(e) => updateSettings({ reportingCurrency: code(e.target.value) })} />
            </Field>
          </div>
        </Panel>

        <Panel title="Insight rules" description="Thresholds used by rule-based insights">
          <Field label="Low rating threshold" htmlFor="low-rating" hint="Ratings and branch averages below this value are flagged. Leave empty to turn the rule off. Use the same scale as your rating exports.">
            <TextInput
              id="low-rating"
              type="number"
              step="any"
              className="sm:max-w-40"
              value={settings.lowRatingThreshold ?? ''}
              onChange={(e) => updateSettings({ lowRatingThreshold: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </Field>
        </Panel>

        <Panel title="How totals avoid double counting" description="Fixed method, documented in every export">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600">
            <li>For each brand and platform, only the most detailed export type with data is added to revenue and order totals: Orders, then Sales summary, then Delivery / pickup, then Branch performance.</li>
            <li>Within Orders exports, rows with the same Order ID are counted once. Without an Order ID, each row counts as one order.</li>
            <li>When a new file overlaps an existing one for the same source and report type, and orders cannot be matched by ID, the new file is imported as excluded. You choose which file to include in Import history.</li>
          </ul>
        </Panel>
      </div>
    </>
  )
}
