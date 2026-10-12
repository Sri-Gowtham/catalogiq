import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { del, get, post } from '@/api/http'
import type { AbTest, ListingRow, PerfSummary, Publishing as PublishingData, Rule, RuleFinding, Workbench as WorkbenchData } from '@/api/types'
import { DataTag, FlagBadge, ModeBadge, RankChange, StateBadge } from '@/components/badges'
import { Empty, ErrorState, Field, fieldClass, Kpi, Loading, PageHeader, Panel, Segmented } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { formatCompact, formatDay, formatInr, formatInrCompact, formatMs, formatNum, formatPct, layerName, PLATFORM_SHORT } from '@/lib/format'
import { cn } from '@/lib/utils'

/* ================================================================== publishing */
export function Publishing() {
  const { data, error, isPending } = useQuery({ queryKey: ['publishing'], queryFn: () => get<PublishingData>('/publishing') })
  const [view, setView] = useState<'queue' | 'recent'>('queue')
  if (isPending) return <Loading className="h-[70vh]" />
  if (error) return <ErrorState error={error} />
  const rows = view === 'queue' ? data.queue : data.recent
  return (
    <>
      <PageHeader
        title="Publishing"
        description="Scheduled launches and recent go-lives."
        tag={<DataTag kind="simulated" />}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label="Listings scheduled" value={formatNum(data.counts.queued)} />
        <Kpi label="Products ready to publish" value={formatNum(data.counts.ready)} tone="primary" hint="Passed the quality gate" />
        <Kpi label="Went live, last 30 days" value={formatNum(data.recent.length)} tone="pass" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <Panel
          title={view === 'queue' ? 'Scheduled launches' : 'Recently published'}
          action={
            <Segmented
              label="Show"
              value={view}
              onChange={setView}
              options={[
                { value: 'queue', label: 'Scheduled' },
                { value: 'recent', label: 'Recent' },
              ]}
            />
          }
        >
          {rows.length === 0 ? (
            <Empty title="Nothing here" />
          ) : (
            <div className="max-h-[36rem] overflow-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Product</th>
                    <th className="pb-2 font-medium">Platform</th>
                    <th className="pb-2 text-right font-medium">Score</th>
                    <th className="pb-2 text-right font-medium">{view === 'queue' ? 'Status' : 'Rank now'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 text-muted-foreground">{formatDay(r.date)}</td>
                      <td className="py-2">
                        <Link to={`/app/products/${r.product_id}?tab=content`} className="hover:text-primary">
                          {r.name}
                        </Link>
                      </td>
                      <td className="py-2">{r.platform_name}</td>
                      <td className="py-2 text-right tabular-nums">{r.quality_score ?? '-'}</td>
                      <td className="py-2 text-right">{view === 'queue' ? <StateBadge state={r.status} /> : r.rank ? `#${r.rank}` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Ready to publish">
          {data.ready_to_publish.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing waiting.</p>
          ) : (
            <ul className="divide-y">
              {data.ready_to_publish.map((r) => (
                <li key={r.product_id}>
                  <Link to={`/app/products/${r.product_id}?tab=content`} className="flex items-center gap-3 py-2 text-sm hover:text-primary">
                    <span className="flex-1 truncate">{r.name}</span>
                    <span className="text-xs text-pass tabular-nums">{r.quality_score}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  )
}

/* ================================================================== performance */
const PERF_TABS = [
  { value: 'top', label: 'Top sellers' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'movers_down', label: 'Slipping' },
  { value: 'movers_up', label: 'Climbing' },
  { value: 'bottom', label: 'Lowest sales' },
] as const

export function Performance() {
  const [params, setParams] = useSearchParams()
  const tab = (PERF_TABS.find((t) => t.value === params.get('tab'))?.value ?? 'top') as (typeof PERF_TABS)[number]['value']
  const platform = params.get('platform') ?? ''
  const [metric, setMetric] = useState<'revenue' | 'clicks' | 'orders' | 'rank'>('revenue')
  const qp = platform ? `&platform=${platform}` : ''
  const summary = useQuery({ queryKey: ['perf-summary', platform], queryFn: () => get<PerfSummary>(`/performance/summary?days=30${qp}`) })
  const listings = useQuery({ queryKey: ['perf-listings', tab, platform], queryFn: () => get<ListingRow[]>(`/performance/listings?view=${tab}&limit=25${qp}`) })
  const tests = useQuery({ queryKey: ['ab-tests'], queryFn: () => get<AbTest[]>('/performance/ab-tests') })
  const qc = useQueryClient()
  const { canWrite } = useAuth()
  const fix = useMutation({ mutationFn: (id: number) => post(`/listings/${id}/reoptimize`), onSuccess: () => qc.invalidateQueries({ queryKey: ['ab-tests'] }) })

  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params)
    if (v) n.set(k, v)
    else n.delete(k)
    setParams(n, { replace: true })
  }

  if (summary.isPending) return <Loading className="h-[70vh]" />
  if (summary.error) return <ErrorState error={summary.error} />
  const s = summary.data

  return (
    <>
      <PageHeader
        title="Performance"
        description="Rank and sales per listing, last 30 days."
        tag={<DataTag kind="demo" />}
        actions={
          <select value={platform} onChange={(e) => set('platform', e.target.value)} aria-label="Platform" className={cn(fieldClass, 'w-44')}>
            <option value="">All platforms</option>
            {Object.entries(PLATFORM_SHORT).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Revenue" value={formatInrCompact(s.revenue)} />
        <Kpi label="Orders" value={formatNum(s.orders)} />
        <Kpi label="Clicks" value={formatCompact(s.clicks)} />
        <Kpi label="Click rate" value={formatPct(s.ctr)} />
        <Kpi label="Conversion" value={formatPct(s.conversion)} />
        <Kpi label="Average rank" value={s.avg_rank ? `#${s.avg_rank}` : '-'} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Trend"
          action={
            <Segmented
              label="Metric"
              value={metric}
              onChange={setMetric}
              options={[
                { value: 'revenue', label: 'Revenue' },
                { value: 'orders', label: 'Orders' },
                { value: 'clicks', label: 'Clicks' },
                { value: 'rank', label: 'Rank' },
              ]}
            />
          }
        >
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={s.series} margin={{ left: 0, right: 8, top: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="day" tickFormatter={formatDay} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis
                  reversed={metric === 'rank'}
                  tickFormatter={(v) => (metric === 'revenue' ? formatInrCompact(v) : formatCompact(v))}
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                  tickLine={false}
                  axisLine={false}
                  width={60}
                />
                <Tooltip labelFormatter={(l) => formatDay(String(l))} formatter={(v) => (metric === 'revenue' ? formatInr(Number(v)) : formatNum(Number(v)))} />
                <Line type="monotone" dataKey={metric} stroke="var(--primary)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Revenue by category">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={s.by_category} layout="vertical" margin={{ left: 0, right: 12 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="key" width={110} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => formatInr(Number(v))} />
                <Bar dataKey="revenue" fill="var(--primary)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel className="mt-4" title="Listings" action={<Segmented label="Listing view" value={tab} onChange={(v) => set('tab', v)} options={[...PERF_TABS]} />}>
        {listings.isPending ? (
          <Loading className="h-60" />
        ) : listings.error ? (
          <ErrorState error={listings.error} />
        ) : listings.data.length === 0 ? (
          <Empty title="No listings here" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 font-medium">Platform</th>
                  <th className="pb-2 text-right font-medium">Rank</th>
                  <th className="pb-2 text-right font-medium">Click rate</th>
                  <th className="pb-2 text-right font-medium">Conversion</th>
                  <th className="pb-2 text-right font-medium">Orders</th>
                  <th className="pb-2 text-right font-medium">Revenue</th>
                  <th className="pb-2 pl-4 font-medium">Diagnosis</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {listings.data.map((l) => (
                  <tr key={l.listing_id} className="align-top">
                    <td className="py-2.5 pr-3">
                      <Link to={`/app/products/${l.product_id}?tab=performance`} className="font-medium hover:text-primary">
                        {l.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{l.category}</span>
                    </td>
                    <td className="py-2.5">
                      <span className="flex flex-col items-start gap-1">
                        {l.platform_name}
                        <FlagBadge flag={l.flag} />
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <RankChange rank={l.rank} prev={l.rank_prev} />
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{formatPct(l.ctr)}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatPct(l.conversion)}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatNum(l.orders)}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatInr(l.revenue)}</td>
                    <td className="max-w-72 py-2.5 pl-4 text-xs text-muted-foreground">
                      {l.diagnosis ?? '-'}
                      {l.diagnosis && canWrite && (
                        <Button size="xs" variant="outline" className="mt-1.5 flex" onClick={() => fix.mutate(l.listing_id)} disabled={fix.isPending}>
                          Test a fix
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {fix.error && (
          <p role="alert" className="mt-2 text-sm text-flagged">
            {fix.error.message}
          </p>
        )}
      </Panel>

      <Panel className="mt-4" title="A/B tests" tag={<DataTag kind="simulated" />}>
        {!tests.data?.length ? (
          <Empty title="No tests yet">Start one from a flagged listing with “Test a fix”.</Empty>
        ) : (
          <ul className="divide-y">
            {tests.data.map((t) => (
              <li key={t.id} className="grid gap-2 py-3 text-sm lg:grid-cols-[14rem_1fr_1fr_7rem]">
                <span>
                  <Link to={`/app/products/${t.product_id}?tab=performance`} className="font-medium hover:text-primary">
                    {t.name}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {PLATFORM_SHORT[t.platform_key] ?? t.platform_key} · since {formatDay(t.started_at)}
                  </span>
                </span>
                <span className={cn('rounded-lg border p-2 text-xs', t.winner === 'A' && 'border-pass/50 bg-pass/6')}>
                  <strong>A</strong> {t.variant_a}
                </span>
                <span className={cn('rounded-lg border p-2 text-xs', t.winner === 'B' && 'border-pass/50 bg-pass/6')}>
                  <strong>B</strong> {t.variant_b}
                </span>
                <span className="text-right">
                  {t.status === 'running' ? (
                    <StateBadge state="running" />
                  ) : (
                    <span className={cn('font-semibold tabular-nums', (t.uplift_pct ?? 0) >= 0 ? 'text-pass' : 'text-flagged')}>
                      {t.winner} wins {(t.uplift_pct ?? 0) >= 0 ? '+' : ''}
                      {t.uplift_pct}%
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}

/* ================================================================== rulebook */
const KIND_LABEL: Record<Rule['kind'], string> = {
  restricted_claim: 'Restricted claim',
  mandatory_claim: 'Mandatory claim',
  trademark: 'Trademark',
  allergen_format: 'Allergen format',
}
const REGION_LABEL = { ALL: 'All regions', IN: 'India', AE: 'UAE', US: 'United States' }

export function Rules() {
  const { isAdmin } = useAuth()
  const qc = useQueryClient()
  const { data, error, isPending } = useQuery({ queryKey: ['rules'], queryFn: () => get<Rule[]>('/rules') })
  const [text, setText] = useState('Acme Dark Chocolate is a sugar free superfood that helps cure fatigue. Made with real cocoa.')
  const [region, setRegion] = useState<Rule['region']>('IN')
  const check = useMutation({ mutationFn: () => post<{ passed: boolean; findings: RuleFinding[]; rules_checked: number }>('/rules/test', { text, region }) })
  const add = useMutation({
    mutationFn: (body: Partial<Rule>) => post('/rules', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  })
  const remove = useMutation({ mutationFn: (id: number) => del(`/rules/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }) })

  const submitRule = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>
    add.mutate({ region: f.region as Rule['region'], kind: f.kind as Rule['kind'], value: f.value, note: f.note || null }, { onSuccess: () => form.reset() })
  }

  const marked = () => {
    const findings = check.data?.findings ?? []
    const out: React.ReactNode[] = []
    let at = 0
    findings.forEach((f, i) => {
      if (f.start < at) return
      out.push(text.slice(at, f.start))
      out.push(
        <mark key={i} title={f.message} className={cn('rounded px-0.5', f.severity === 'high' ? 'bg-flagged/20' : 'bg-review/25')}>
          {text.slice(f.start, f.end)}
        </mark>,
      )
      at = f.end
    })
    out.push(text.slice(at))
    return out
  }

  return (
    <>
      <PageHeader title="Brand rulebook" description="Claims and trademark rules, by region." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Test a sentence" tag={<DataTag kind="live" />}>
          <Field label="Copy to check">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className={cn(fieldClass, 'h-auto py-2')} />
          </Field>
          <div className="mt-3 flex items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Region</span>
              <select value={region} onChange={(e) => setRegion(e.target.value as Rule['region'])} className={cn(fieldClass, 'w-44')}>
                {Object.entries(REGION_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <Button onClick={() => check.mutate()} disabled={!text.trim() || check.isPending}>
              {check.isPending ? 'Checking…' : 'Check'}
            </Button>
          </div>
          {check.data && (
            <div className="mt-4" aria-live="polite">
              <p className={cn('text-sm font-medium', check.data.passed ? 'text-pass' : 'text-flagged')}>
                {check.data.passed ? 'Passes' : 'Blocked'} · {check.data.findings.length} finding(s) against {check.data.rules_checked} rules
              </p>
              <p className="mt-2 rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed">{marked()}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {check.data.findings.map((f, i) => (
                  <li key={i} className="flex gap-2">
                    <span className={f.severity === 'high' ? 'text-flagged' : 'text-[oklch(0.5_0.12_70)]'}>●</span>“{f.match}”: {f.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel title="Rules" tag={data && <span className="text-xs text-muted-foreground">{data.length}</span>}>
          {isPending ? (
            <Loading className="h-60" />
          ) : error ? (
            <ErrorState error={error} />
          ) : (
            <ul className="max-h-96 divide-y overflow-y-auto">
              {data.map((r) => (
                <li key={r.id} className="flex items-start gap-3 py-2 text-sm">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">{REGION_LABEL[r.region]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{r.value}</span>
                    <span className="block text-xs text-muted-foreground">
                      {KIND_LABEL[r.kind]}
                      {r.note && ` · ${r.note}`}
                    </span>
                  </span>
                  {isAdmin && (
                    <button type="button" aria-label={`Delete rule ${r.value}`} onClick={() => remove.mutate(r.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-flagged">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {isAdmin && (
            <form onSubmit={submitRule} className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-2">
              <select name="kind" className={fieldClass} aria-label="Rule type" defaultValue="restricted_claim">
                {Object.entries(KIND_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select name="region" className={fieldClass} aria-label="Region" defaultValue="ALL">
                {Object.entries(REGION_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <input name="value" required minLength={2} placeholder="Word or phrase, e.g. immunity booster" className={fieldClass} aria-label="Word or phrase" />
              <input name="note" placeholder="Why (optional)" className={fieldClass} aria-label="Reason" />
              <Button type="submit" className="sm:col-span-2" disabled={add.isPending}>
                Add rule
              </Button>
              {add.error && <p className="text-sm text-flagged sm:col-span-2">{add.error.message}</p>}
            </form>
          )}
        </Panel>
      </div>
    </>
  )
}

/* ================================================================== workbench */
export function Workbench() {
  const { data, error, isPending } = useQuery({ queryKey: ['workbench'], queryFn: () => get<WorkbenchData>('/workbench'), refetchInterval: 5000 })
  if (isPending) return <Loading className="h-[70vh]" />
  if (error) return <ErrorState error={error} />
  const c = data.connection
  const live = data.agents.filter((a) => a.mode === 'live').length
  return (
    <>
      <PageHeader
        title="Agent workbench"
        description="Connection, agents and recent runs."
      />
      <div className="surface mb-4 flex flex-wrap items-center gap-6 p-5">
        <div className="flex items-center gap-3">
          <span className={cn('size-3 rounded-full', c.status === 'connected' ? 'bg-pass' : 'bg-flagged')} aria-hidden />
          <div>
            <p className="font-semibold">{c.name}</p>
            <p className="text-xs text-muted-foreground">{c.detail}</p>
          </div>
        </div>
        <dl className="flex flex-wrap gap-6 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Status</dt>
            <dd>
              <StateBadge state={c.status} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Endpoint</dt>
            <dd className="font-mono text-xs">{c.endpoint}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Agents</dt>
            <dd className="tabular-nums">
              {live} live · {data.agents.length - live} simulated
            </dd>
          </div>
        </dl>
        <p className="w-full text-xs text-muted-foreground lg:ml-auto lg:w-auto lg:max-w-sm">
          SNS Square Agent Workbench connects through the same interface.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_26rem]">
        <Panel title="Agents">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="pb-2 font-medium">Agent</th>
                  <th className="pb-2 font-medium">Mode</th>
                  <th className="pb-2 text-right font-medium">Runs</th>
                  <th className="pb-2 text-right font-medium">Avg time</th>
                  <th className="pb-2 text-right font-medium">Processed</th>
                  <th className="pb-2 text-right font-medium">Failed</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.agents.map((a) => (
                  <tr key={a.id} className="align-top">
                    <td className="py-2.5 pr-4">
                      <span className="font-medium">{a.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {layerName(a.layer)}
                        {!a.in_pipeline && ' · always on'} · {a.description}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <ModeBadge mode={a.mode} />
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{a.runs || '-'}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatMs(a.avg_ms)}</td>
                    <td className="py-2.5 text-right tabular-nums">{a.processed ? formatNum(a.processed) : '-'}</td>
                    <td className={cn('py-2.5 text-right tabular-nums', a.failed > 0 && 'text-flagged')}>{a.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Recent runs" tag={<span className="text-xs text-muted-foreground">refreshes every 5 s</span>}>
          <ul className="max-h-[36rem] divide-y overflow-y-auto">
            {data.recent_runs.map((r) => (
              <li key={r.id} className="py-2 text-sm">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{r.agent_name}</span>
                  <StateBadge state={r.status} />
                </span>
                <span className="block text-xs text-muted-foreground">
                  {r.batch ?? 'No batch'} · {formatMs(r.duration_ms)}
                  {r.processed != null && ` · ${r.processed} items`}
                  {r.mode === 'simulated' && ' · simulated'}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  )
}
