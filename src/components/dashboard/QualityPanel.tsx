import { Alert } from '@/components/ui/Alert'
import { Panel } from '@/components/ui/Panel'
import type { QualityItem } from '@/types/analytics'

export function QualityPanel({ items, className }: { items: QualityItem[]; className?: string }) {
  return (
    <Panel title="Data quality" description="How the figures were produced and what may be incomplete" className={className}>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No data-quality issues detected for this selection.</p>
      ) : (
        <div className="space-y-2">
          {items.map((q, i) => (
            <Alert key={i} level={q.level}>
              {q.message}
            </Alert>
          ))}
        </div>
      )}
    </Panel>
  )
}
