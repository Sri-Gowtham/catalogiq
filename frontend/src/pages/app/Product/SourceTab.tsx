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

const norm = (v: unknown) => show(v).toLowerCase().replace(/[\s,.;]+/g, ' ').trim()

type Change = 'added' | 'cleaned' | 'same'

/** A field is Added when the supplier row had nothing for it, Cleaned when the text changed beyond case and spacing. */
function change(source: Record<string, unknown>, key: string, value: unknown): Change {
  if (!(key in source) || source[key] == null || source[key] === '') return 'added'
  return norm(source[key]) === norm(value) ? 'same' : 'cleaned'
}

const TAG: Record<Change, string> = {
  added: 'bg-primary/10 text-primary',
  cleaned: 'bg-review/15 text-warn',
  same: 'bg-muted text-muted-foreground',
}

export function SourceTab({ p }: { p: ProductDetail }) {
  const enriched = p.enriched ?? {}
  const entries = Object.entries(enriched)
  const counts = entries.reduce<Record<Change, number>>((a, [k, v]) => ({ ...a, [change(p.source, k, v)]: a[change(p.source, k, v)] + 1 }), { added: 0, cleaned: 0, same: 0 })
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
        {entries.length === 0 ? (
          <Empty title="Not enriched">The audit stopped this record before enrichment, so no AI effort was spent on it.</Empty>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted-foreground" aria-live="polite">
              {counts.added} added · {counts.cleaned} cleaned · {counts.same} unchanged
            </p>
            <dl className="divide-y text-sm">
              {entries.map(([k, v]) => {
                const c = change(p.source, k, v)
                return (
                  <div key={k} className={cn('grid grid-cols-[8rem_1fr] gap-3 py-2', c !== 'same' && 'bg-pass/4')}>
                    <dt className="text-muted-foreground capitalize">{k.replace(/_/g, ' ')}</dt>
                    <dd className="break-words">
                      {show(v)} <span className={cn('ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium', TAG[c])}>{c === 'same' ? 'Unchanged' : c === 'added' ? 'Added' : 'Cleaned'}</span>
                      {c === 'cleaned' && <span className="mt-0.5 block text-xs text-muted-foreground line-through">{show(p.source[k])}</span>}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </>
        )}
      </Panel>
    </div>
  )
}
