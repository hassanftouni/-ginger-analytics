import { SegmentedControl } from '@/components/ui/SegmentedControl'

export function CurrencyPicker({ currencies, value, onChange }: { currencies: string[]; value: string | undefined; onChange: (c: string) => void }) {
  if (currencies.length <= 1 || !value) return null
  return <SegmentedControl label="Currency" value={value} onChange={onChange} options={currencies.map((c) => ({ value: c, label: c }))} />
}
