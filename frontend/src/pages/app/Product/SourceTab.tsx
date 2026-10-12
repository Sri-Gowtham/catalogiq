import type { ProductDetail } from '@/api/types'
import { DataTag } from '@/components/badges'
import { Empty, Panel } from '@/components/kit'
import { cn } from '@/lib/utils'


/* ------------------------------------------------------------------ source vs enriched */
function show(v: unknown): string {
  if (v == null || v === '') return 'n/a'
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

export function SourceTab({ p }: { p: ProductDetail }) {
  const enriched = p.enriched ?? {}
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Supplier record, as received" tag={<DataTag kind={p.origin === 'demo' ? 'demo' : 'live'} />}>
        <dl className="divide-y text-sm">
          {Object.entries(p.source).map(([k, v]) => (
            <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 py-2">
              <dt className="text-muted-foreground capitalize">{k.replace(/_/g, ' ')}</dt>
              <dd className={cn('break-words', (v == null || v === '') && 'text-flagged')}>{v == null || v === '' ? 'Missing' : show(v)}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      <Panel title="Cleaned and enriched" tag={<DataTag kind="simulated" />}>
        {Object.keys(enriched).length === 0 ? (
          <Empty title="Not enriched">The audit stopped this record before enrichment, so no AI effort was spent on it.</Empty>
        ) : (
          <dl className="divide-y text-sm">
            {Object.entries(enriched).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 bg-pass/4 py-2">
                <dt className="text-muted-foreground capitalize">{k.replace(/_/g, ' ')}</dt>
                <dd className="break-words">{show(v)}</dd>
              </div>
            ))}
          </dl>
        )}
      </Panel>
    </div>
  )
}
