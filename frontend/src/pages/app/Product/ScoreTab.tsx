import type { ProductDetail } from '@/api/types'
import { DataTag } from '@/components/badges'
import { Empty, Panel } from '@/components/kit'
import { cn } from '@/lib/utils'


/* ------------------------------------------------------------------ score */
const PARAMS: { key: string; label: string; max: number; note: string }[] = [
  { key: 'title', label: 'Title', max: 20, note: 'Length, brand and size present, keyword early' },
  { key: 'attributes', label: 'Attributes', max: 25, note: 'Mandatory fields for each platform filled' },
  { key: 'readability', label: 'Readability', max: 15, note: 'Plain, scannable bullets and description' },
  { key: 'keywords', label: 'Keywords', max: 15, note: 'Search terms buyers actually use' },
  { key: 'compliance', label: 'Compliance', max: 15, note: 'Brand rules and restricted claims; 0 blocks publishing' },
  { key: 'category', label: 'Category', max: 10, note: 'Specific category on each platform' },
]

export function ScoreTab({ p }: { p: ProductDetail }) {
  const d = p.score_detail
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <Panel title="Quality scorecard" tag={<DataTag kind="simulated" />}>
        {!d ? (
          <Empty title="Not scored yet">Products are scored after enrichment. Flagged records are never scored.</Empty>
        ) : (
          <ul className="space-y-4">
            {PARAMS.map((x) => {
              const v = d[x.key] ?? 0
              return (
                <li key={x.key}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className="font-medium">{x.label}</span>
                    <span className="tabular-nums">
                      {v} <span className="text-muted-foreground">/ {x.max}</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className={cn('h-full rounded-full', v / x.max >= 0.7 ? 'bg-pass' : v / x.max >= 0.5 ? 'bg-review' : 'bg-flagged')} style={{ width: `${(100 * v) / x.max}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{x.note}</p>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
      <div className="space-y-4">
        <div className="surface p-5 text-center">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className={cn('text-5xl font-semibold tracking-tight tabular-nums', (p.quality_score ?? 0) >= 70 ? 'text-pass' : 'text-flagged')}>{p.quality_score ?? 'n/a'}</p>
          <p className="mt-1 text-sm text-muted-foreground">Publishing needs 70 or more</p>
          <p className="mt-3 text-sm">{p.gate_blocked ? <span className="text-flagged">{p.gate_reason}</span> : p.quality_score != null && <span className="text-pass">Cleared the gate</span>}</p>
        </div>
        <div className="surface p-5 text-sm">
          <p className="font-medium">Two scores, two jobs</p>
          <p className="mt-1 text-muted-foreground">
            The <strong>audit score</strong> ({p.audit_score ?? 'n/a'}) checks the supplier data before AI runs. The <strong>quality score</strong> checks the finished content before it is
            published.
          </p>
        </div>
      </div>
    </div>
  )
}
