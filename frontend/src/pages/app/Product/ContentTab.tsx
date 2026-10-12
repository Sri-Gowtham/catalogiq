import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { patch, post } from '@/api/http'
import type { ContentOut, ProductDetail } from '@/api/types'
import { DataTag, StateBadge } from '@/components/badges'
import { AuthImage, Empty, fieldClass, Panel, Segmented } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { TabBar, panelId, tabId } from '@/components/TabBar'
import { useToast } from '@/components/toast'
import { useAuth } from '@/lib/auth'
import { confirmDiscard, useUnsavedChanges } from '@/lib/unsaved'
import { formatInr } from '@/lib/format'
import { cn } from '@/lib/utils'


/* ------------------------------------------------------------------ platform content */
function Counter({ n, max }: { n: number; max: number | null }) {
  if (max == null) return <span className="text-[11px] text-muted-foreground tabular-nums">{n} chars</span>
  const over = n > max
  return (
    <span className={cn('text-[11px] tabular-nums', over ? 'font-medium text-flagged' : 'text-muted-foreground')}>
      {n} / {max}
      {over && ' · too long'}
    </span>
  )
}

function highlight(text: string, words: string[]) {
  if (!words.length) return text
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return text.split(re).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded bg-primary/12 px-0.5 text-inherit">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

export function ContentTab({ p }: { p: ProductDetail }) {
  const [mode, setMode] = useState<'single' | 'compare'>('single')
  const [key, setKey] = useState(p.content[0]?.platform_key ?? '')
  if (p.content.length === 0) return <Empty title="No platform content yet">Content is written once the product clears the data audit.</Empty>
  const c = p.content.find((x) => x.platform_key === key) ?? p.content[0]

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="View"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'single', label: 'One platform' },
            { value: 'compare', label: 'Compare all' },
          ]}
        />
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <DataTag kind="simulated" /> Highlighted words are target keywords
        </p>
      </div>

      {mode === 'compare' ? (
        <CompareView p={p} />
      ) : (
        <>
          <TabBar
            label="Platforms"
            idPrefix="platform"
            variant="pill"
            items={p.content.map((x) => ({ key: x.platform_key, label: x.platform_name, badge: x.mandatory_missing.length > 0 ? <span className="size-1.5 rounded-full bg-flagged" role="img" aria-label="has missing fields" /> : undefined }))}
            value={c.platform_key}
            onChange={(k) => confirmDiscard() && setKey(k)}
          />
          <div role="tabpanel" id={panelId('platform', c.platform_key)} aria-labelledby={tabId('platform', c.platform_key)} className="grid gap-4 xl:grid-cols-[1fr_24rem]">
            <ContentEditor key={c.platform_key} p={p} c={c} />
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">How it looks on a {c.kind === 'quick_commerce' ? 'quick-commerce app' : c.kind === 'own_site' ? 'brand store' : 'marketplace'}</p>
              <PreviewCard p={p} c={c} />
              <p className="mt-2 text-[11px] text-muted-foreground">Illustrative layout</p>
            </div>
          </div>
        </>
      )}
    </>
  )
}

function ContentEditor({ p, c }: { p: ProductDetail; c: ContentOut }) {
  const { canWrite } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(c.title)
  const [bullets, setBullets] = useState(c.bullets.join('\n'))
  const [desc, setDesc] = useState(c.description)
  const dirty = editing && (title !== c.title || bullets !== c.bullets.join('\n') || desc !== c.description)
  useUnsavedChanges(dirty)
  const reset = () => {
    setTitle(c.title)
    setBullets(c.bullets.join('\n'))
    setDesc(c.description)
  }
  const republish = useMutation({
    mutationFn: () => post(`/products/${p.id}/publish`, { platforms: [c.platform_key] }),
    onSuccess: () => {
      toast.show(`${c.platform_name} changes published (simulated)`)
      qc.invalidateQueries({ queryKey: ['product', String(p.id)] })
    },
    onError: (e) => toast.show(e.message, 'error'),
  })
  const save = useMutation({
    mutationFn: () => patch(`/products/${p.id}/content/${c.platform_key}`, { title, bullets: bullets.split('\n').filter(Boolean), description: desc }),
    onSuccess: () => {
      toast.show(`${c.platform_name} content saved`)
      setEditing(false)
      qc.invalidateQueries({ queryKey: ['product', String(p.id)] })
    },
  })

  return (
    <Panel
      title={`${c.platform_name} content`}
      tag={<StateBadge state={c.status} />}
      action={
        canWrite &&
        (editing ? (
          <div className="flex gap-2">
            {dirty && (
              <Button size="sm" variant="ghost" onClick={reset}>
                Reset
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (!dirty || window.confirm('Discard your changes?')) {
                  reset()
                  setEditing(false)
                }
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" /> Edit
          </Button>
        ))
      }
    >
      {c.status === 'draft' && c.listed && !editing && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-review/10 p-3 text-sm">
          <p>
            <strong className="font-medium">Unpublished changes.</strong> The live listing still shows the previous version.
          </p>
          {canWrite && (
            <Button size="sm" onClick={() => republish.mutate()} disabled={republish.isPending}>
              {republish.isPending ? 'Publishing…' : 'Publish changes'}
            </Button>
          )}
        </div>
      )}
      {save.error && (
        <p role="alert" className="mb-3 text-sm text-flagged">
          {save.error.message}
        </p>
      )}
      <dl className="space-y-5 text-sm">
        <div>
          <dt className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
            Title <Counter n={(editing ? title : c.title).length} max={c.title_limit} />
          </dt>
          <dd>
            {editing ? (
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClass} aria-label="Title" />
            ) : (
              <p className="font-medium">{highlight(c.title, c.keyword_hits)}</p>
            )}
            {c.title_ar && (
              <p dir="rtl" lang="ar" className="mt-1 text-muted-foreground">
                {c.title_ar} <DataTag kind="simulated" className="mr-2" />
              </p>
            )}
          </dd>
        </div>
        <div>
          <dt className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
            Bullets <span className="tabular-nums">{c.bullet_count ? `${c.bullets.length} of ${c.bullet_count} · max ${c.bullet_limit} chars` : `${c.bullets.length} · free format`}</span>
          </dt>
          <dd>
            {editing ? (
              <textarea value={bullets} onChange={(e) => setBullets(e.target.value)} rows={6} className={cn(fieldClass, 'h-auto py-2')} aria-label="Bullets, one per line" />
            ) : (
              <ul className="space-y-1.5">
                {c.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-muted-foreground">•</span>
                    <span className="flex-1">{highlight(b, c.keyword_hits)}</span>
                    <Counter n={b.length} max={c.bullet_limit} />
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        <div>
          <dt className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
            Description <Counter n={(editing ? desc : c.description).length} max={c.description_limit} />
          </dt>
          <dd>
            {editing ? (
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={5} className={cn(fieldClass, 'h-auto py-2')} aria-label="Description" />
            ) : (
              <p className="leading-relaxed text-foreground/85">{highlight(c.description, c.keyword_hits)}</p>
            )}
          </dd>
        </div>
        <div>
          <dt className="mb-1.5 text-xs font-medium text-muted-foreground">Attributes this platform asks for</dt>
          <dd className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {Object.entries(c.attributes).map(([k, v]) => (
              <p key={k} className="flex justify-between gap-3 border-b border-dashed py-1">
                <span className="text-muted-foreground capitalize">{k.replace(/_/g, ' ')}</span>
                <span className="text-right">{v}</span>
              </p>
            ))}
            {c.mandatory_missing.map((k) => (
              <p key={k} className="flex justify-between gap-3 border-b border-dashed py-1 text-flagged">
                <span className="capitalize">{k.replace(/_/g, ' ')}</span>
                <span>Missing</span>
              </p>
            ))}
          </dd>
        </div>
        <div>
          <dt className="mb-1.5 text-xs font-medium text-muted-foreground">Keywords</dt>
          <dd className="flex flex-wrap gap-1.5">
            {c.keywords.map((k) => (
              <span key={k} className={cn('rounded-full border px-2 py-0.5 text-xs', c.keyword_hits.includes(k) ? 'border-primary/40 bg-primary/6 text-primary' : 'text-muted-foreground')}>
                {c.keyword_hits.includes(k) && '✓ '}
                {k}
              </span>
            ))}
          </dd>
        </div>
      </dl>
    </Panel>
  )
}

function PreviewCard({ p, c }: { p: ProductDetail; c: ContentOut }) {
  const price = formatInr(p.listings.find((l) => l.platform_key === c.platform_key)?.price ?? p.price)
  if (c.kind === 'quick_commerce') {
    return (
      <div className="w-56 rounded-2xl border bg-card p-3 shadow-sm">
        <AuthImage productId={p.id} alt="" className="aspect-square w-full bg-white" />
        <p className="mt-2 inline-block rounded bg-muted px-1.5 text-[10px] font-semibold">⏱ 10 MINS</p>
        <p className="mt-1 line-clamp-2 text-sm font-medium">{c.title}</p>
        <p className="text-xs text-muted-foreground">{p.size}</p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm font-semibold">{price}</span>
          <span className="rounded-md border border-pass px-3 py-1 text-xs font-semibold text-pass">ADD</span>
        </div>
      </div>
    )
  }
  if (c.kind === 'own_site') {
    return (
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <AuthImage productId={p.id} kind="lifestyle" alt="" className="aspect-[4/3] w-full rounded-none" />
        <div className="p-4">
          <p className="text-lg font-semibold tracking-tight">{c.title}</p>
          <p className="mt-1.5 line-clamp-4 text-sm text-muted-foreground">{c.description}</p>
          <p className="mt-3 flex items-center justify-between">
            <span className="font-semibold">{price}</span>
            <span className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background">Add to bag</span>
          </p>
        </div>
      </div>
    )
  }
  return (
    <div className="rounded-xl border bg-white p-4 text-[oklch(0.25_0.02_250)] shadow-sm">
      <div className="flex gap-3">
        <AuthImage productId={p.id} alt="" className="size-28 shrink-0 bg-white" />
        <div className="min-w-0">
          <p className="line-clamp-3 text-sm leading-snug font-medium text-[oklch(0.42_0.12_240)]">{c.title}</p>
          {c.title_ar && (
            <p dir="rtl" lang="ar" className="mt-1 line-clamp-1 text-xs text-[oklch(0.45_0.02_250)]">
              {c.title_ar}
            </p>
          )}
          <p className="mt-1 text-xs text-[oklch(0.55_0.15_70)]">★★★★☆ <span className="text-[oklch(0.45_0.02_250)]">sample</span></p>
          <p className="mt-1 text-lg font-semibold">{price}</p>
        </div>
      </div>
      <ul className="mt-3 space-y-1 text-xs">
        {c.bullets.slice(0, 3).map((b, i) => (
          <li key={i} className="line-clamp-2">
            • {b}
          </li>
        ))}
      </ul>
    </div>
  )
}

function CompareView({ p }: { p: ProductDetail }) {
  return (
    <div tabIndex={0} className="overflow-x-auto pb-2">
      <div className="grid min-w-[60rem] gap-3" style={{ gridTemplateColumns: `repeat(${p.content.length}, minmax(0, 1fr))` }}>
        {p.content.map((c) => (
          <div key={c.platform_key} className="surface flex flex-col p-4 text-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold">{c.platform_name}</p>
              <StateBadge state={c.status} />
            </div>
            <Section label="Title" right={<Counter n={c.title.length} max={c.title_limit} />}>
              <p className="font-medium">{c.title}</p>
              {c.title_ar && (
                <p dir="rtl" lang="ar" className="mt-1 text-xs text-muted-foreground">
                  {c.title_ar}
                </p>
              )}
            </Section>
            <Section label={`Bullets (${c.bullets.length})`}>
              <ul className="space-y-1 text-xs">
                {c.bullets.map((b, i) => (
                  <li key={i}>• {b}</li>
                ))}
              </ul>
            </Section>
            <Section label="Description" right={<Counter n={c.description.length} max={c.description_limit} />}>
              <p className="line-clamp-5 text-xs text-muted-foreground">{c.description}</p>
            </Section>
            <Section label="Attributes">
              <p className="text-xs">{Object.keys(c.attributes).length} filled</p>
              {c.mandatory_missing.length > 0 && <p className="text-xs text-flagged">Missing: {c.mandatory_missing.join(', ')}</p>}
            </Section>
            <Section label="Images">
              <ImageVerdict p={p} platform={c.platform_key} />
            </Section>
          </div>
        ))}
      </div>
    </div>
  )
}

function Section({ label, right, children }: { label: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border-t py-2.5 first-of-type:border-0">
      <p className="mb-1 flex items-center justify-between text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label} {right}
      </p>
      {children}
    </div>
  )
}

function ImageVerdict({ p, platform }: { p: ProductDetail; platform: string }) {
  const r = p.image_reports.find((x) => x.platform_key === platform)
  if (!r) return <p className="text-xs text-muted-foreground">No checks</p>
  const failed = r.checks.filter((c) => !c.ok)
  return failed.length === 0 ? (
    <p className="text-xs text-pass">All {r.checks.length} checks pass</p>
  ) : (
    <ul className="text-xs text-flagged">
      {failed.map((f) => (
        <li key={f.rule}>✕ {f.rule}</li>
      ))}
    </ul>
  )
}
