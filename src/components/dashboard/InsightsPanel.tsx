import { CircleAlert, Lightbulb, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Panel } from '@/components/ui/Panel'
import type { Insight, InsightTone } from '@/types/analytics'

const TONES: Record<InsightTone, { icon: LucideIcon; className: string; label: string }> = {
  positive: { icon: TrendingUp, className: 'text-emerald-600 bg-emerald-50', label: 'Positive' },
  negative: { icon: TrendingDown, className: 'text-red-600 bg-red-50', label: 'Attention' },
  neutral: { icon: Lightbulb, className: 'text-slate-600 bg-slate-100', label: 'Note' },
  warning: { icon: CircleAlert, className: 'text-amber-700 bg-amber-50', label: 'Warning' },
}

export function InsightsPanel({ insights, className }: { insights: Insight[]; className?: string }) {
  return (
    <Panel title="Insights" description="Rule-based findings calculated from your imported data" className={className}>
      {insights.length === 0 ? (
        <EmptyState icon={Lightbulb} title="No insights yet" description="Insights appear when the data needed for a rule is available." compact />
      ) : (
        <ul className="space-y-3">
          {insights.map((i) => {
            const t = TONES[i.tone]
            return (
              <li key={i.id} className="flex gap-3">
                <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${t.className}`}>
                  <t.icon className="size-4" aria-label={t.label} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{i.title}</p>
                  <p className="text-xs text-slate-500">{i.detail}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
