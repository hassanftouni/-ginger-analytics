import { CalendarCheck, CheckCircle2, CircleSlash } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { Field, Select, TextInput } from '@/components/ui/FormControls'
import { Panel } from '@/components/ui/Panel'
import { PLATE_LOCATIONS, PLATE_RULES } from '@/config/plate'
import { plateLocationLabel } from '@/plate/analytics'
import { planPlateImport } from '@/plate/merge'
import { checkPlateTarget, type PlateParseResult } from '@/plate/parse'
import type { PlateImportResult } from '@/plate/types'
import { hrefFor } from '@/hooks/useHashRoute'
import { usePlateStore } from '@/state/plateStore'
import { formatCount } from '@/utils/format'

interface PlateImportPanelProps {
  file: File
  parsed: PlateParseResult
  done?: PlateImportResult
  onDone: (result: PlateImportResult) => void
  onCancel: () => void
}

export const PLATE_IDENTICAL_MESSAGE = 'Every booking in this file is already stored with identical values for this location and period — skipped, nothing changed. If that import is excluded, include it again in Plate import history.'

/** Review and confirm a Plate bookings export: location, covered period, totals and overlaps. */
export function PlateImportPanel({ file, parsed, done, onDone, onCancel }: PlateImportPanelProps) {
  const { state, commitImport } = usePlateStore()
  const info = parsed.fileNameInfo
  const [locationId, setLocationId] = useState(info.locationId ?? '')
  const [periodStart, setPeriodStart] = useState(info.periodStart ?? '')
  const [periodEnd, setPeriodEnd] = useState(info.periodEnd ?? '')
  const targetIssues = useMemo(() => checkPlateTarget(parsed, locationId || undefined, periodStart, periodEnd), [parsed, locationId, periodStart, periodEnd])
  const issues = [...parsed.issues, ...targetIssues]
  const blocked = issues.some((i) => i.level === 'error')
  const target = { locationId, periodStart, periodEnd }
  const plan = useMemo(() => (blocked ? null : planPlateImport(state, parsed, { locationId, periodStart, periodEnd })), [blocked, state, parsed, locationId, periodStart, periodEnd])
  const identical = !done && plan?.kind === 'identical'
  useEffect(() => {
    if (identical) onDone({ kind: 'skipped', message: PLATE_IDENTICAL_MESSAGE })
  }, [identical, onDone])

  const confirm = (choice: 'replace' | 'keep') => {
    const entry = commitImport(parsed, target, choice, {
      id: crypto.randomUUID(),
      fileName: file.name,
      fileSize: file.size,
      importedAt: Date.now(),
      warnings: issues.filter((i) => i.level === 'warning').map((i) => i.message),
    })
    if (!entry) return onDone({ kind: 'skipped', message: PLATE_IDENTICAL_MESSAGE })
    onDone({
      kind: 'imported',
      entry,
      message: `${plateLocationLabel(entry.locationId)} · ${entry.periodStart} to ${entry.periodEnd}: ${entry.bookingsAdded} new booking(s)${entry.bookingsReplaced ? `, ${entry.bookingsReplaced} replaced` : ''}${entry.bookingsKept ? `, ${entry.bookingsKept} kept at stored values` : ''}${entry.bookingsUnchanged ? `, ${entry.bookingsUnchanged} already stored` : ''}.`,
    })
  }

  if (done) {
    return (
      <Panel>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            {done.kind === 'imported' ? <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" aria-hidden="true" /> : <CircleSlash className="mt-0.5 size-5 text-slate-400" aria-hidden="true" />}
            <div>
              <p className="text-sm font-semibold text-slate-900">
                “{file.name}” {done.kind === 'imported' ? 'has been imported' : 'was skipped'}
              </p>
              <p className="text-xs text-slate-500">{done.message}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <a href={hrefFor('/plate/history')} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              Plate import history
            </a>
            <a href={hrefFor('/platforms/plate')} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              Open Plate reservations
            </a>
          </div>
        </div>
      </Panel>
    )
  }

  const c = parsed.control
  return (
    <div className="space-y-4">
      <Panel
        title={
          <span className="flex items-center gap-2">
            <CalendarCheck className="size-4 text-accent-600" aria-hidden="true" /> Plate bookings export (reservations)
          </span>
        }
        description="Recognised from its headers. Imported into Plate reservations only — never into Weevi, Toters or Foody. Guest names, phone numbers and emails are not stored."
      >
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Location" htmlFor="pl-loc" hint={info.exportName ? `File name says “${info.exportName}”${info.locationId ? '' : ' — not a registered location'}` : 'Not found in the file name'}>
            <Select id="pl-loc" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Choose a location…</option>
              {PLATE_LOCATIONS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Export covers from" htmlFor="pl-from" hint={info.periodStart ? 'From the file name' : 'Not found in the file name'}>
            <TextInput id="pl-from" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </Field>
          <Field label="Export covers to" htmlFor="pl-to" hint="Days in this period without bookings count as zero">
            <TextInput id="pl-to" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </Field>
        </div>

        <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">Rows in file</dt>
            <dd className="font-medium text-slate-900">{formatCount(parsed.sourceRows)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Reservation dates in file</dt>
            <dd className="font-medium text-slate-900">{parsed.firstDate ? `${parsed.firstDate} → ${parsed.lastDate}` : '—'}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-slate-500">Statuses</dt>
            <dd className="font-medium text-slate-900">{Object.entries(parsed.statuses).map(([s, k]) => `${s} (${k})`).join(' · ') || '—'}</dd>
          </div>
        </dl>

        <DataTable
          columns={[
            { key: 'm', header: 'File totals (computed from its rows)', render: (r) => <span className="font-medium text-slate-800">{r.label}</span> },
            { key: 'v', header: 'Value', align: 'right', render: (r) => r.value },
            { key: 'n', header: 'Rule', render: (r) => <span className="text-xs text-slate-500">{r.note}</span> },
          ]}
          rows={[
            { label: 'Reservations', value: formatCount(c.bookings), note: 'All statuses' },
            { label: 'Completed', value: formatCount(c.completed), note: PLATE_RULES.completed },
            { label: 'Guests (covers)', value: formatCount(c.covers), note: PLATE_RULES.covers },
            { label: 'Cancelled', value: formatCount(c.cancelled), note: 'Status “Cancelled by User”' },
            { label: 'Declined', value: formatCount(c.declined), note: 'Status “Declined” — separate from cancellations' },
            ...(c.other > 0 ? [{ label: 'Other statuses', value: formatCount(c.other), note: 'No configured meaning' }] : []),
          ]}
          rowKey={(r) => r.label}
          empty={null}
        />

        {plan && plan.kind !== 'identical' && (
          <p className="mt-3 text-xs text-slate-600">
            Against stored Plate data: <span className="font-medium">{plan.newBookings.length} new</span>
            {plan.unchanged.length > 0 && ` · ${plan.unchanged.length} already stored (counted once)`}
            {plan.conflicts.length > 0 && <span className="font-medium text-amber-800"> · {plan.conflicts.length} stored with different values</span>}
          </p>
        )}

        {issues.length > 0 && (
          <div className="mt-4 space-y-2">
            {issues.map((i, k) => (
              <Alert key={k} level={i.level}>
                {i.message}
              </Alert>
            ))}
          </div>
        )}

        {parsed.invalid.length > 0 && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-xs font-medium text-slate-700">Rows not imported ({parsed.invalid.length}) — never treated as zero</summary>
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {parsed.invalid.map((r) => (
                <li key={`${r.row}-${r.bookingId ?? ''}`}>
                  Row {r.row}
                  {r.date ? ` · ${r.date}` : ''}: {r.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Panel>

      {plan && plan.kind === 'conflict' && (
        <Panel title="Bookings already stored with different values" description="The same Booking IDs exist with other values (e.g. a later status). Choose which to keep — a booking is never counted twice.">
          <div className="max-h-80 overflow-y-auto">
            <DataTable
              columns={[
                { key: 'd', header: 'Reservation date', render: (x) => x.incoming.date },
                { key: 'l', header: 'Location (stored → file)', render: (x) => (x.existing.locationId === x.incoming.locationId ? plateLocationLabel(x.incoming.locationId) : `${plateLocationLabel(x.existing.locationId)} → ${plateLocationLabel(x.incoming.locationId)}`) },
                { key: 's', header: 'Status (stored → file)', render: (x) => `${x.existing.status} → ${x.incoming.status}` },
                { key: 'p', header: 'Party size (stored → file)', align: 'right', render: (x) => `${x.existing.partySize} → ${x.incoming.partySize}` },
              ]}
              rows={plan.conflicts}
              rowKey={(x) => x.bookingId}
              empty={null}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => confirm('replace')}>
              Use the values in this file
            </Button>
            <Button onClick={() => confirm('keep')}>Keep stored values</Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel import
            </Button>
          </div>
        </Panel>
      )}

      {plan && plan.kind === 'clean' && (
        <Panel>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={() => confirm('keep')}>
              Confirm import
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <span className="text-xs text-slate-500">
              {plateLocationLabel(locationId)} · {periodStart} to {periodEnd} · adds {formatCount(plan.newBookings.length)} booking(s).
              {plan.unchanged.length > 0 && ` ${plan.unchanged.length} already stored are not added again.`}
            </span>
          </div>
        </Panel>
      )}
      {blocked && (
        <div className="flex">
          <Badge tone="danger">Import blocked — fix the errors above</Badge>
        </div>
      )}
    </div>
  )
}
