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

/* The agent workflow scores seven parts, out of 100 in total. */
const FLOW_PARAMS: { key: string; label: string; max: number; note: string }[] = [
  { key: 'identity', label: 'Identity', max: 20, note: 'Name, brand, size and country of origin present' },
  { key: 'attributes', label: 'Attributes', max: 25, note: 'Category attributes extracted and filled' },
  { key: 'description', label: 'Description', max: 20, note: 'Channel copy generated and long enough' },
  { key: 'taxonomy', label: 'Taxonomy', max: 10, note: 'Mapped to a category path with confidence' },
  { key: 'imagery', label: 'Imagery', max: 10, note: 'Image links present and valid' },
  { key: 'compliance', label: 'Compliance', max: 10, note: 'Brand rules and restricted claims' },
  { key: 'localization', label: 'Localisation', max: 5, note: 'Translated titles' },
]

export function ScoreTab({ p }: { p: ProductDetail }) {
  const d = p.score_detail
  const fromWorkflow = !!d && 'identity' in d
  const params = fromWorkflow ? FLOW_PARAMS : PARAMS
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <Panel title="Quality scorecard" tag={<DataTag kind={fromWorkflow ? 'live' : 'simulated'} />}>
        {!d ? (
          <Empty title="Not scored yet">Products are scored after enrichment. Flagged records are never scored.</Empty>
        ) : (
          <ul className="space-y-4">
            {params.map((x) => {
              const notRun = fromWorkflow && d[x.key] === undefined // the workflow leaves out a part that did not run, rather than scoring it 0
              const v = d[x.key] ?? 0
              if (notRun)
                return (
                  <li key={x.key}>
                    <div className="mb-1 flex items-baseline justify-between text-sm">
                      <span className="font-medium">{x.label}</span>
                      <span className="text-muted-foreground">Not run</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted" />
                    <p className="mt-1 text-xs text-muted-foreground">{x.note}. Left out of the total.</p>
                  </li>
                )
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
