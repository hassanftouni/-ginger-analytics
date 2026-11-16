import { ChartLine } from 'lucide-react'
import { DailyTrendChart } from '@/components/charts/DailyTrendChart'
import { EmptyState } from '@/components/ui/EmptyState'
import { Panel } from '@/components/ui/Panel'
import type { DailyPoint } from '@/types/analytics'
import { useCurrency } from '@/hooks/useCurrency'
import { CurrencyPicker } from './CurrencyPicker'

export function TrendPanel({ points, title = 'Sales trend', className }: { points: DailyPoint[]; title?: string; className?: string }) {
  const currencies = [...new Set(points.map((p) => p.currency))].sort()
  const [currency, setCurrency] = useCurrency(currencies)
  return (
    <Panel title={title} description="Daily, weekly or monthly — one currency at a time" className={className} actions={<CurrencyPicker currencies={currencies} value={currency} onChange={setCurrency} />}>
      {currency ? (
        <DailyTrendChart points={points} currency={currency} />
      ) : (
        <div className="flex min-h-64 flex-col justify-center">
          <EmptyState icon={ChartLine} title="No dated sales data" description="Requires sales exports with a mapped Date field." compact />
        </div>
      )}
    </Panel>
  )
}
