import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, Pencil, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { get, patch, post } from '@/api/http'
import type { ContentOut, ListingPerformance, ProductDetail } from '@/api/types'
import { AuditBadge, DataTag, FlagBadge, ProductStatusBadge, RankChange, SeverityBadge, StateBadge } from '@/components/badges'
import { AuthImage, Empty, ErrorState, fieldClass, Loading, Panel, Segmented } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { formatDay, formatInr, formatNum, formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'content', label: 'Platform content' },
  { key: 'images', label: 'Images' },
  { key: 'source', label: 'Source vs enriched' },
  { key: 'score', label: 'Score' },
  { key: 'performance', label: 'Performance' },
] as const
type Tab = (typeof TABS)[number]['key']

export function Product() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'overview') as Tab
  const { data: p, error, isPending } = useQuery({ queryKey: ['product', id], queryFn: () => get<ProductDetail>(`/products/${id}`) })

  if (isPending) return <Loading className="h-[70vh]" />
  if (error) return <ErrorState error={error} />

  const demo = p.origin === 'demo'
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params)
    next.set('tab', t)
    setParams(next, { replace: true })
  }

  return (
    <>
      <Link to="/app/catalog" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Products
      </Link>
      <div className="mb-6 flex flex-wrap items-start gap-5">
        <AuthImage productId={p.id} alt={`Front of pack for ${p.name ?? p.sku}`} className="size-16 shrink-0 border sm:size-24" />
        <div className="min-w-[15rem] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{p.name ?? 'Untitled product'}</h1>
            <ProductStatusBadge status={p.status} />
            <DataTag kind={demo ? 'demo' : 'live'} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground" translate="no">
            {p.sku} · {p.category ?? 'No category'} · {p.size ?? 'No size'} · {formatInr(p.price)}
            {p.batch_name && (
              <>
                {' · '}
                <Link to={`/app/batches/${p.batch_id}`} className="text-primary hover:underline">
                  {p.batch_name}
                </Link>
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-5 text-sm">
            <Metric label="Audit score" value={p.audit_score} extra={<AuditBadge status={p.audit_status} />} />
            <Metric label="Quality score" value={p.quality_score} extra={<span className="text-xs text-muted-foreground">gate 70</span>} />
            <Metric label="Live on" value={p.listings.filter((l) => l.status === 'live').length} extra={<span className="text-xs text-muted-foreground">of {p.content.length} platforms</span>} />
          </div>
        </div>
        <PublishButton product={p} />
      </div>

      {(p.gate_blocked || p.review) && (
        <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-flagged/30 bg-flagged/6 p-4 text-sm">
          <X className="mt-0.5 size-4 shrink-0 text-flagged" />
          <div className="flex-1">
            <p className="font-medium">{p.gate_blocked ? 'Blocked by the quality gate' : 'Waiting for review'}</p>
            <p className="text-muted-foreground">{p.gate_reason ?? p.review?.reason}</p>
          </div>
          {p.review?.status === 'pending' && (
            <Link to="/app/review" className="text-sm font-medium text-primary hover:underline">
              Open review queue
            </Link>
          )}
        </div>
      )}

      <div role="tablist" aria-label="Product sections" className="mb-5 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'overview' && <OverviewTab p={p} />}
        {tab === 'content' && <ContentTab p={p} />}
        {tab === 'images' && <ImagesTab p={p} />}
        {tab === 'source' && <SourceTab p={p} />}
        {tab === 'score' && <ScoreTab p={p} />}
        {tab === 'performance' && <PerformanceTab p={p} />}
      </div>
    </>
  )
}

function Metric({ label, value, extra }: { label: string; value: number | null; extra?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="flex items-center gap-2 text-lg font-semibold tabular-nums">
        {value ?? '-'} {extra}
      </p>
    </div>
  )
}

function PublishButton({ product }: { product: ProductDetail }) {
  const { canWrite } = useAuth()
  const qc = useQueryClient()
  const [msg, setMsg] = useState<string | null>(null)
  const targets = product.content.filter((c) => !product.listings.some((l) => l.platform_key === c.platform_key && l.status === 'live')).map((c) => c.platform_key)
  const m = useMutation({
    mutationFn: () => post<{ results: { platform: string; message: string }[] }>(`/products/${product.id}/publish`, { platforms: targets }),
    onSuccess: (r) => {
      setMsg(`Published to ${r.results.length} platform(s). ${r.results[0]?.message ?? ''}`)
      qc.invalidateQueries()
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : 'Publish failed'),
  })
  if (!canWrite || targets.length === 0) return null
  const allowed = ['ready', 'upcoming', 'live'].includes(product.status) && (product.quality_score ?? 0) >= 70
  return (
    <div className="flex flex-col items-end gap-1">
      <Button disabled={!allowed || m.isPending} onClick={() => m.mutate()} title={allowed ? undefined : 'Only products that pass the quality gate can be published'}>
        {m.isPending ? 'Publishing…' : `Publish to ${targets.length} more`}
      </Button>
      {msg && (
        <p role="status" className="max-w-64 text-right text-xs text-muted-foreground">
          {msg}
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ overview */
function OverviewTab({ p }: { p: ProductDetail }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Listings" className="lg:col-span-2" tag={p.origin === 'demo' && <DataTag kind="demo" />}>
        {p.listings.length === 0 ? (
          <Empty title="Not listed anywhere yet">Listings appear once the product is published.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="pb-2 font-medium">Platform</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 text-right font-medium">Rank</th>
                  <th className="pb-2 text-right font-medium">Clicks</th>
                  <th className="pb-2 text-right font-medium">Orders</th>
                  <th className="pb-2 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {p.listings.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2.5">
                      <span className="block font-medium">{l.platform_name}</span>
                      {l.primary_keyword && <span className="text-xs text-muted-foreground">for “{l.primary_keyword}”</span>}
                    </td>
                    <td className="py-2.5">
                      <span className="flex flex-wrap gap-1.5">
                        <StateBadge state={l.status} />
                        <FlagBadge flag={l.flag} />
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <RankChange rank={l.rank} prev={l.rank_prev} />
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{formatNum(l.clicks_30d)}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatNum(l.orders_30d)}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatInr(l.revenue_30d)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {p.listings.some((l) => l.diagnosis) && (
          <div className="mt-4 space-y-2">
            {p.listings
              .filter((l) => l.diagnosis)
              .map((l) => (
                <p key={l.id} className="rounded-lg bg-review/10 p-3 text-sm">
                  <strong className="font-medium">{l.platform_name}:</strong> {l.diagnosis}{' '}
                  <Link to="?tab=performance" className="font-medium text-primary hover:underline">
                    See the fix
                  </Link>
                </p>
              ))}
          </div>
        )}
      </Panel>
      <Panel title="Data audit" tag={<DataTag kind="live" />}>
        <p className="text-sm text-muted-foreground">
          Score <strong className="text-foreground tabular-nums">{p.audit_score ?? '-'}</strong> out of 100 before any AI ran.
        </p>
        {p.audit_issues.length === 0 ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-pass">
            <Check className="size-4" /> No issues found
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {p.audit_issues.map((i) => (
              <li key={i.code + i.field} className="flex items-start gap-2 text-sm">
                <SeverityBadge severity={i.severity} />
                <span>{i.issue}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

/* ------------------------------------------------------------------ platform content */
function Counter({ n, max }: { n: number; max: number | null }) {
  if (max == null) return <span className="text-[11px] text-muted-foreground tabular-nums">{n} chars · no limit</span>
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

function ContentTab({ p }: { p: ProductDetail }) {
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
          <div role="tablist" aria-label="Platforms" className="mb-4 flex flex-wrap gap-2">
            {p.content.map((x) => (
              <button
                key={x.platform_key}
                type="button"
                role="tab"
                aria-selected={x.platform_key === c.platform_key}
                onClick={() => setKey(x.platform_key)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                  x.platform_key === c.platform_key ? 'border-primary bg-primary/6 text-primary' : 'bg-card hover:bg-muted',
                )}
              >
                {x.platform_name}
                {x.mandatory_missing.length > 0 && <span className="size-1.5 rounded-full bg-flagged" aria-label="has missing fields" />}
              </button>
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-[1fr_24rem]">
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
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(c.title)
  const [bullets, setBullets] = useState(c.bullets.join('\n'))
  const [desc, setDesc] = useState(c.description)
  const save = useMutation({
    mutationFn: () => patch(`/products/${p.id}/content/${c.platform_key}`, { title, bullets: bullets.split('\n').filter(Boolean), description: desc }),
    onSuccess: () => {
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
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
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
            <p dir="rtl" lang="ar" className="mt-1 line-clamp-1 text-xs text-muted-foreground">
              {c.title_ar}
            </p>
          )}
          <p className="mt-1 text-xs text-[oklch(0.65_0.15_70)]">★★★★☆ <span className="text-muted-foreground">sample</span></p>
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
    <div className="overflow-x-auto pb-2">
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

/* ------------------------------------------------------------------ images */
function ImagesTab({ p }: { p: ProductDetail }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_26rem]">
      <Panel title="Image set" tag={<DataTag kind="demo" />}>
        <div className="grid gap-4 sm:grid-cols-3">
          {p.images.map((img) => (
            <figure key={img.kind}>
              <AuthImage productId={p.id} kind={img.kind} alt={`${img.kind} image of ${p.name}`} className="aspect-square w-full border" />
              <figcaption className="mt-2 text-sm">
                <span className="flex items-center justify-between">
                  <span className="font-medium capitalize">{img.kind}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {img.width}×{img.height}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {img.bg_white ? 'Plain white background' : 'Coloured background'} · quality {img.quality_score ?? '-'}
                </span>
                {img.notes && <span className="mt-0.5 block text-xs text-flagged">{img.notes}</span>}
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Illustrations for the demo brand. Real catalogs use brand photos.</p>
      </Panel>
      <Panel title="Checks per platform">
        <div className="space-y-4">
          {p.image_reports.map((r) => (
            <div key={r.platform_key}>
              <p className="mb-1.5 text-sm font-medium">{r.platform_name}</p>
              <ul className="space-y-1">
                {r.checks.map((c) => (
                  <li key={c.rule} className="flex items-start gap-2 text-sm">
                    {c.ok ? <Check className="mt-0.5 size-4 shrink-0 text-pass" aria-label="Pass" /> : <X className="mt-0.5 size-4 shrink-0 text-flagged" aria-label="Fail" />}
                    <span>
                      {c.rule}
                      {c.detail && <span className="block text-xs text-muted-foreground">{c.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground">Illustrative rules, configurable per platform.</p>
      </Panel>
    </div>
  )
}

/* ------------------------------------------------------------------ source vs enriched */
function show(v: unknown): string {
  if (v == null || v === '') return '-'
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

function SourceTab({ p }: { p: ProductDetail }) {
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

/* ------------------------------------------------------------------ score */
const PARAMS: { key: string; label: string; max: number; note: string }[] = [
  { key: 'title', label: 'Title', max: 20, note: 'Length, brand and size present, keyword early' },
  { key: 'attributes', label: 'Attributes', max: 25, note: 'Mandatory fields for each platform filled' },
  { key: 'readability', label: 'Readability', max: 15, note: 'Plain, scannable bullets and description' },
  { key: 'keywords', label: 'Keywords', max: 15, note: 'Search terms buyers actually use' },
  { key: 'compliance', label: 'Compliance', max: 15, note: 'Brand rules and restricted claims; 0 blocks publishing' },
  { key: 'category', label: 'Category', max: 10, note: 'Specific category on each platform' },
]

function ScoreTab({ p }: { p: ProductDetail }) {
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
          <p className={cn('text-5xl font-semibold tracking-tight tabular-nums', (p.quality_score ?? 0) >= 70 ? 'text-pass' : 'text-flagged')}>{p.quality_score ?? '-'}</p>
          <p className="mt-1 text-sm text-muted-foreground">Publishing needs 70 or more</p>
          <p className="mt-3 text-sm">{p.gate_blocked ? <span className="text-flagged">{p.gate_reason}</span> : p.quality_score != null && <span className="text-pass">Cleared the gate</span>}</p>
        </div>
        <div className="surface p-5 text-sm">
          <p className="font-medium">Two scores, two jobs</p>
          <p className="mt-1 text-muted-foreground">
            The <strong>audit score</strong> ({p.audit_score ?? '-'}) checks the supplier data before AI runs. The <strong>quality score</strong> checks the finished content before it is
            published.
          </p>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ performance */
const COLORS = ['var(--primary)', 'oklch(0.65 0.15 155)', 'oklch(0.7 0.15 70)', 'oklch(0.6 0.18 300)', 'oklch(0.6 0.18 25)']

function PerformanceTab({ p }: { p: ProductDetail }) {
  const { canWrite } = useAuth()
  const qc = useQueryClient()
  const [metric, setMetric] = useState<'rank' | 'clicks' | 'orders'>('rank')
  const { data, isPending, error } = useQuery({ queryKey: ['product-perf', p.id], queryFn: () => get<ListingPerformance[]>(`/products/${p.id}/performance`) })
  const test = useMutation({ mutationFn: (listingId: number) => post(`/listings/${listingId}/reoptimize`), onSuccess: () => qc.invalidateQueries() })

  if (isPending) return <Loading className="h-80" />
  if (error) return <ErrorState error={error} />
  if (data.length === 0) return <Empty title="No performance yet">Numbers appear once the product is live.</Empty>

  const days = data[0].points.map((pt) => pt.day)
  const rows = days.map((day, i) => {
    const row: Record<string, string | number | null> = { day }
    data.forEach((l) => (row[l.platform_name] = l.points[i]?.[metric] ?? null))
    return row
  })
  const totals = data.map((l) => {
    const t = l.points.reduce((a, x) => ({ imps: a.imps + x.impressions, clicks: a.clicks + x.clicks, orders: a.orders + x.orders, revenue: a.revenue + x.revenue, returns: a.returns + x.returns }), {
      imps: 0,
      clicks: 0,
      orders: 0,
      revenue: 0,
      returns: 0,
    })
    return { ...l, ...t }
  })

  return (
    <div className="space-y-4">
      <Panel
        title="Last 30 days by platform"
        tag={<DataTag kind="demo" />}
        action={
          <Segmented
            label="Metric"
            value={metric}
            onChange={setMetric}
            options={[
              { value: 'rank', label: 'Rank' },
              { value: 'clicks', label: 'Clicks' },
              { value: 'orders', label: 'Orders' },
            ]}
          />
        }
      >
        <div className="h-72">
          <ResponsiveContainer>
            <LineChart data={rows} margin={{ left: 0, right: 8, top: 4 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="day" tickFormatter={formatDay} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis reversed={metric === 'rank'} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} width={40} allowDecimals={false} />
              <Tooltip labelFormatter={(l) => formatDay(String(l))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {data.map((l, i) => (
                <Line key={l.listing_id} type="monotone" dataKey={l.platform_name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        {metric === 'rank' && <p className="mt-2 text-xs text-muted-foreground">Rank 1 is top of search</p>}
      </Panel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {totals.map((t) => {
          const listing = p.listings.find((l) => l.id === t.listing_id)
          const running = p.ab_tests.some((a) => a.platform_key === t.platform_key && a.status === 'running')
          return (
            <div key={t.listing_id} className="surface p-4 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{t.platform_name}</p>
                {listing && <RankChange rank={listing.rank} prev={listing.rank_prev} />}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2">
                <Mini label="Click rate" value={formatPct(t.imps ? (100 * t.clicks) / t.imps : null)} />
                <Mini label="Conversion" value={formatPct(t.clicks ? (100 * t.orders) / t.clicks : null)} />
                <Mini label="Orders" value={formatNum(t.orders)} />
                <Mini label="Revenue" value={formatInr(t.revenue)} />
              </dl>
              {listing?.diagnosis && (
                <div className="mt-3 rounded-lg bg-review/10 p-3">
                  <p className="text-xs font-medium">Why it is slipping</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{listing.diagnosis}</p>
                  {canWrite &&
                    (running ? (
                      <p className="mt-2 text-xs font-medium text-primary">A/B test running</p>
                    ) : (
                      <Button size="sm" variant="outline" className="mt-2" onClick={() => test.mutate(t.listing_id)} disabled={test.isPending}>
                        Test a fix
                      </Button>
                    ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {p.ab_tests.length > 0 && (
        <Panel title="A/B tests" tag={<DataTag kind="simulated" />}>
          <ul className="divide-y">
            {p.ab_tests.map((a) => (
              <li key={a.id} className="grid gap-2 py-3 text-sm md:grid-cols-[8rem_1fr_1fr_8rem]">
                <span className="font-medium">{a.platform_key}</span>
                <span className={cn(a.winner === 'A' && 'font-medium text-pass')}>A: {a.variant_a}</span>
                <span className={cn(a.winner === 'B' && 'font-medium text-pass')}>B: {a.variant_b}</span>
                <span className="text-right">{a.status === 'running' ? <StateBadge state="running" /> : `B ${a.uplift_pct != null && a.uplift_pct >= 0 ? '+' : ''}${a.uplift_pct ?? 0}%`}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}
