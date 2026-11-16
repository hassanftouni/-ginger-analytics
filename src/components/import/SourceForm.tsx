import { Field, Select, TextInput } from '@/components/ui/FormControls'
import { BRAND_LIST, BRANDS, PLATFORMS, getBrandSource, type BrandId, type PlatformId } from '@/config/brands'
import { CATEGORIES, categoryHasMoney, type ImportCategory } from '@/config/categories'
import type { MetadataDraft } from '@/import/validation'
import { BranchScopeField } from './BranchScopeField'

interface SourceFormProps {
  value: MetadataDraft
  onChange: (next: MetadataDraft) => void
  dateMapped: boolean
  /** Platform and report type come from a detected format and cannot be changed here. */
  locked?: boolean
  branchMapped: boolean
  /** Hint under the currency field (e.g. "Detected from amounts: USD"). */
  currencyHint?: string
  periodRequired?: boolean
}

/** Brand, platform, country, report type, currency and (optional) period for one file. */
export function SourceForm({ value, onChange, dateMapped, locked, branchMapped, currencyHint, periodRequired }: SourceFormProps) {
  const platforms = value.brandId ? BRANDS[value.brandId].sources.map((s) => PLATFORMS[s.platformId]) : []
  const categories = value.platformId ? PLATFORMS[value.platformId].categories : []

  const setBrand = (brandId: BrandId | undefined) => {
    const keep = brandId && value.platformId && getBrandSource(brandId, value.platformId)
    const platformId = keep ? value.platformId : undefined
    onChange({
      ...value,
      brandId,
      platformId,
      country: brandId && platformId ? getBrandSource(brandId, platformId)?.country : undefined,
      category: keep ? value.category : undefined,
      branchScope: undefined,
    })
  }

  const setPlatform = (platformId: PlatformId | undefined) => {
    const country = value.brandId && platformId ? getBrandSource(value.brandId, platformId)?.country : undefined
    const category = platformId && value.category && PLATFORMS[platformId].categories.includes(value.category) ? value.category : undefined
    onChange({ ...value, platformId, country, category })
  }

  const needsCurrency = value.category ? categoryHasMoney(value.category) : false

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Brand" htmlFor="src-brand" required>
        <Select id="src-brand" value={value.brandId ?? ''} onChange={(e) => setBrand((e.target.value || undefined) as BrandId | undefined)}>
          <option value="">Select…</option>
          {BRAND_LIST.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Platform" htmlFor="src-platform" required>
        <Select id="src-platform" value={value.platformId ?? ''} disabled={!value.brandId || locked} onChange={(e) => setPlatform((e.target.value || undefined) as PlatformId | undefined)}>
          <option value="">{value.brandId ? 'Select…' : 'Select a brand first'}</option>
          {platforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Country" htmlFor="src-country" required hint={value.country ? 'Set by the brand and platform' : undefined}>
        <TextInput id="src-country" value={value.country ?? ''} disabled placeholder="Set automatically" readOnly />
      </Field>
      <Field label="Report type" htmlFor="src-category" required>
        <Select
          id="src-category"
          value={value.category ?? ''}
          disabled={!value.platformId || locked}
          onChange={(e) => onChange({ ...value, category: (e.target.value || undefined) as ImportCategory | undefined })}
        >
          <option value="">{value.platformId ? 'Select…' : 'Select a platform first'}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {CATEGORIES[c].name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="File currency" htmlFor="src-currency" required={needsCurrency} hint={currencyHint ?? 'Three-letter code. Never assumed.'}>
        <TextInput
          id="src-currency"
          value={value.currency ?? ''}
          maxLength={3}
          placeholder="e.g. USD"
          className="uppercase placeholder:normal-case"
          onChange={(e) => onChange({ ...value, currency: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Period start" htmlFor="src-from" required={!dateMapped || periodRequired}>
          <TextInput id="src-from" type="date" value={value.periodStart ?? ''} onChange={(e) => onChange({ ...value, periodStart: e.target.value })} />
        </Field>
        <Field label="Period end" htmlFor="src-to" required={!dateMapped || periodRequired}>
          <TextInput id="src-to" type="date" value={value.periodEnd ?? ''} onChange={(e) => onChange({ ...value, periodEnd: e.target.value })} />
        </Field>
      </div>
      {!branchMapped && value.brandId && value.category && (
        <div className="sm:col-span-2 lg:col-span-3">
          <BranchScopeField brandId={value.brandId} value={value.branchScope} onChange={(branchScope) => onChange({ ...value, branchScope })} />
        </div>
      )}
    </div>
  )
}
