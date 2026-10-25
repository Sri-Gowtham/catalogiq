import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, CircleAlert } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { get, post } from '@/api/http'
import type { Member, Overview as OverviewData, Rule } from '@/api/types'
import { DataTag, StateBadge } from '@/components/badges'
import { ErrorState, Kpi, Loading, PageHeader, Panel } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { formatCompact, formatDateTime, formatDay, formatInrCompact, formatNum, formatPct, PLATFORM_SHORT } from '@/lib/format'
import { cn } from '@/lib/utils'

const LEVEL = { high: 'bg-flagged', medium: 'bg-review', low: 'bg-muted-foreground/40' }

export function Overview() {
  const { me } = useAuth()
  const { data, error, isPending } = useQuery({ queryKey: ['overview'], queryFn: () => get<OverviewData>('/overview'), refetchInterval: 15_000 })

  if (isPending) return <Loading className="h-[70vh]" />
  if (error) return <ErrorState error={error} />
  const c = data.counts
  if (c.total === 0) return <FirstRun name={me?.name.split(' ')[0] ?? ''} role={me?.role ?? 'viewer'} platforms={data.platforms.length} />
  const p = data.performance
  const funnelMax = data.funnel[0]?.count || 1
  const demo = data.workspace.is_demo
  const role = me?.role ?? 'viewer'
  const staff = role !== 'viewer'
  const showAttention = role === 'admin'

  return (
    <>
      <PageHeader
        title={`Good to see you, ${me?.name.split(' ')[0] ?? ''}`}
        description={FOCUS_TEXT[role]}
        tag={role === 'viewer' && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Read-only</span>}
      />

      {role === 'manager' && <ManagerQueue data={data} />}
      {role === 'admin' && <AdminSetup data={data} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Link to="/app/catalog" className="block rounded-xl transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring">
          <Kpi label="Products" value={formatNum(c.total)} />
        </Link>
        <Link to="/app/catalog?status=live" className="block rounded-xl transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring">
          <Kpi label="Live" value={formatNum(c.live)} tone="pass" />
        </Link>
        <Link to="/app/catalog?status=in_enrichment" className="block rounded-xl transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring">
          <Kpi label="In enrichment" value={formatNum(c.in_enrichment)} tone="primary" />
        </Link>
        <Link to="/app/catalog?status=upcoming" className="block rounded-xl transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring">
          <Kpi label="Upcoming" value={formatNum(c.upcoming)} hint={`${c.launching_this_week} this week`} />
        </Link>
        <Link to="/app/catalog?status=ready" className="block rounded-xl transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring">
          <Kpi label="Ready to publish" value={formatNum(c.ready)} />
        </Link>
        <Link to={staff ? "/app/review" : "/app/catalog?status=flagged"} className="block rounded-xl transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring">
          <Kpi label="Flagged" value={formatNum(c.flagged)} tone="flagged" />
        </Link>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel
          lead
          className={showAttention ? 'xl:col-span-2' : 'xl:col-span-3'}
          title="Sales, last 30 days"
          tag={demo && <DataTag kind="demo" />}
          action={
            <Link to="/app/performance" className="text-xs font-medium text-primary hover:underline">
              Performance
            </Link>
          }
        >
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Revenue" value={formatInrCompact(p.revenue)} delta={p.revenue_delta_pct} />
            <Stat label="Orders" value={formatNum(p.orders)} />
            <Stat label="Clicks" value={formatCompact(p.clicks)} />
            <Stat label="Click rate" value={formatPct(p.ctr)} />
          </div>
          <div className="h-56">
            <ResponsiveContainer>
              <AreaChart data={data.series} margin={{ left: 0, right: 8, top: 4 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="day" tickFormatter={formatDay} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickFormatter={(v) => formatInrCompact(v)} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} width={64} />
                <Tooltip formatter={(v) => formatInrCompact(Number(v))} labelFormatter={(l) => formatDay(String(l))} />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="var(--chart-1)" strokeWidth={2} fill="url(#rev)" activeDot={{ r: 4, stroke: 'var(--card)', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {showAttention && (
        <Panel title="Needs attention">
          {data.attention.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing needs you right now.</p>
          ) : (
            <ul className="divide-y">
              {data.attention.map((a) => (
                <li key={a.kind}>
                  <Link to={a.href} className="group flex items-center gap-3 py-2.5 text-sm">
                    <span className={cn('size-2 shrink-0 rounded-full', LEVEL[a.level])} aria-hidden />
                    <span className="flex-1">{a.text}</span>
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4">
            <div>
              <p className="text-xs text-muted-foreground">Average quality score</p>
              <p className="text-lg font-semibold tabular-nums">{data.health.avg_quality ?? 'n/a'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Passed the gate</p>
              <p className="text-lg font-semibold tabular-nums">{formatPct(data.health.gate_pass_rate)}</p>
            </div>
          </div>
        </Panel>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="From feed to shelf">
          <ol className="space-y-3">
            {data.funnel.map((f) => (
              <li key={f.stage}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{f.stage}</span>
                  <span className="font-medium tabular-nums">{formatNum(f.count)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary/80" style={{ width: `${(100 * f.count) / funnelMax}%` }} />
                </div>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel
          title="Where you sell"
          action={
            <Link to="/app/platforms" className="text-xs font-medium text-primary hover:underline">
              Platforms
            </Link>
          }
        >
          <table className="data w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Platform</th>
                <th className="pb-2 text-right font-medium">Live</th>
                <th className="pb-2 text-right font-medium">Queued</th>
                <th className="pb-2 text-right font-medium">Suppressed</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.platforms.map((pl) => (
                <tr key={pl.key}>
                  <td className="py-2">
                    <span className="flex items-center gap-2">
                      {pl.name}
                      {pl.status !== 'connected' && <StateBadge state={pl.status} />}
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums">{pl.live}</td>
                  <td className="py-2 text-right text-muted-foreground tabular-nums">{pl.queued}</td>
                  <td className={cn('py-2 text-right tabular-nums', pl.suppressed ? 'font-medium text-flagged' : 'text-muted-foreground')}>{pl.suppressed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Rank movers this week" tag={demo && <DataTag kind="demo" />}>
          {data.movers.up.length + data.movers.down.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rank changes yet.</p>
          ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {(['up', 'down'] as const).map((dir) => (
              <div key={dir}>
                <p className={cn('mb-2 text-xs font-medium', dir === 'up' ? 'text-pass' : 'text-flagged')}>{dir === 'up' ? 'Climbing' : 'Slipping'}</p>
                <ul className="space-y-2">
                  {data.movers[dir].map((m) => (
                    <li key={`${m.product_id}-${m.platform}`}>
                      <Link to={`/app/products/${m.product_id}?tab=performance`} className="block rounded-md text-sm hover:text-primary">
                        <span className="line-clamp-1">{m.name}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {PLATFORM_SHORT[m.platform] ?? m.platform} · #{m.rank_prev} → #{m.rank}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          )}
        </Panel>

        <Panel
          title="Upcoming launches"
          action={staff &&
            <Link to="/app/publishing" className="text-xs font-medium text-primary hover:underline">
              Publishing
            </Link>
          }
        >
          {data.upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No launches scheduled.</p>
          ) : (
            <ul className="divide-y">
              {data.upcoming.map((u) => (
                <li key={u.id}>
                  <Link to={`/app/products/${u.id}`} className="flex items-center gap-3 py-2 text-sm hover:text-primary">
                    <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">{formatDay(u.launch_date)}</span>
                    <span className="flex-1 truncate">{u.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">Score {u.quality_score ?? 'n/a'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {staff && (
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Batches"
          action={
            <Link to="/app/batches" className="text-xs font-medium text-primary hover:underline">
              All batches
            </Link>
          }
        >
          <ul className="divide-y">
            {data.batches.map((b) => (
              <li key={b.id}>
                <Link to={`/app/batches/${b.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:text-primary">
                  <span className="flex-1 truncate">{b.name}</span>
                  <DataTag kind={b.kind === 'live' ? 'live' : 'demo'} />
                  <span className="w-16 text-right text-xs text-muted-foreground tabular-nums">{b.total} items</span>
                  <StateBadge state={b.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Recent activity">
          {data.activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="space-y-3">
              {data.activity.map((a, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
                  <span className="flex-1">
                    <span className="font-medium">{a.action}</span>
                    {a.entity && <span className="text-muted-foreground"> · {a.entity}</span>}
                    <span className="block text-xs text-muted-foreground">
                      {a.user ?? 'System'} · {formatDateTime(a.at)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      )}
    </>
  )
}

function FirstRun({ name, role, platforms }: { name: string; role: string; platforms: number }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const sample = useMutation({
    mutationFn: () => post<{ batch_id: number }>('/batches/sample'),
    onSuccess: (r) => {
      qc.invalidateQueries()
      navigate(`/app/batches/${r.batch_id}`)
    },
  })
  const staff = role !== 'viewer'
  return (
    <>
      <PageHeader title={`Welcome, ${name}`} description={staff ? 'Your catalog is empty. Three steps to get going.' : 'The catalog is empty. Ask a manager to upload a feed.'} />
      {staff && (
        <ol className="grid gap-4 md:grid-cols-3">
          {[
            { n: 1, t: 'Platforms', d: `${platforms} connected`, done: platforms > 0, to: '/app/platforms', cta: 'Review' },
            { n: 2, t: 'Brand rules', d: 'Claims and trademarks to check against', done: false, to: '/app/rules', cta: 'Add rules' },
            { n: 3, t: 'Supplier feed', d: 'CSV or JSON of your products', done: false, to: '/app/batches', cta: 'Upload feed' },
          ].map((x) => (
            <li key={x.n} className="surface flex flex-col p-5">
              <span className={cn('grid size-7 place-items-center rounded-full text-xs font-semibold', x.done ? 'bg-pass text-white' : 'bg-primary/10 text-primary')}>{x.done ? '✓' : x.n}</span>
              <h2 className="mt-3 font-semibold">{x.t}</h2>
              <p className="mt-1 flex-1 text-sm text-muted-foreground">{x.d}</p>
              <Link to={x.to} className="mt-4 text-sm font-medium text-primary hover:underline">
                {x.cta}
              </Link>
            </li>
          ))}
        </ol>
      )}
      {staff && (
        <div className="surface mt-4 flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="font-medium">Want to see it working first?</p>
            <p className="text-sm text-muted-foreground">Run the bundled sample feed through the agents.</p>
          </div>
          <Button onClick={() => sample.mutate()} disabled={sample.isPending}>
            {sample.isPending ? 'Starting…' : 'Run sample feed'}
          </Button>
          {sample.error && (
            <p role="alert" className="w-full text-sm text-flagged">
              {sample.error.message}
            </p>
          )}
        </div>
      )}
    </>
  )
}

const FOCUS_TEXT = {
  admin: 'Catalog health, channel set-up and your team.',
  manager: 'Your queue first, then how the catalog is doing.',
  viewer: 'How the catalog is selling across platforms.',
}

function Task({ to, n, label, action, tone }: { to: string; n: number; label: string; action: string; tone?: 'flagged' | 'primary' | 'review' }) {
  return (
    <Link to={to} className="group surface flex items-center gap-4 p-4 transition-shadow hover:shadow-md">
      <span
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-xl text-lg font-semibold tabular-nums',
          tone === 'flagged' ? 'bg-flagged/10 text-flagged' : tone === 'review' ? 'bg-review/15 text-warn' : 'bg-primary/10 text-primary',
        )}
      >
        {n}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="text-xs text-primary group-hover:underline">{action}</span>
      </span>
      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}

const num = (data: OverviewData, kind: string) => Number(data.attention.find((a) => a.kind === kind)?.text.match(/\d+/)?.[0] ?? 0)

function ManagerQueue({ data }: { data: OverviewData }) {
  return (
    <section aria-label="Your queue" className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Task to="/app/review" n={num(data, 'review')} label="Waiting for review" action="Review now" tone="flagged" />
      <Task to="/app/publishing" n={data.counts.ready} label="Ready to publish" action="Open publishing" />
      <Task to="/app/performance?tab=flagged" n={num(data, 'underperforming')} label="Underperforming listings" action="See fixes" tone="review" />
      <Task to="/app/batches" n={num(data, 'batches')} label="Batches in progress" action="Track batches" />
    </section>
  )
}

function AdminSetup({ data }: { data: OverviewData }) {
  const team = useQuery({ queryKey: ['team'], queryFn: () => get<Member[]>('/team') })
  const rules = useQuery({ queryKey: ['rules'], queryFn: () => get<Rule[]>('/rules') })
  const connected = data.platforms.filter((p) => p.status !== 'disconnected').length
  return (
    <section aria-label="Workspace set-up" className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Task to="/app/platforms" n={connected} label={`of ${data.platforms.length} platforms connected`} action="Manage platforms" />
      <Task to="/app/settings" n={team.data?.length ?? 0} label="Team members" action="Manage team" />
      <Task to="/app/rules" n={rules.data?.length ?? 0} label="Brand rules active" action="Edit rulebook" />
      <Task to="/app/review" n={num(data, 'review')} label="Waiting for review" action="Open queue" tone="flagged" />
    </section>
  )
}

function Stat({ label, value, delta }: { label: string; value: string; delta?: number | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">
        {value}
        {delta != null && (
          <span className={cn('ml-1.5 text-xs font-medium', delta >= 0 ? 'text-pass' : 'text-flagged')}>
            {delta >= 0 ? '+' : ''}
            {delta}% <span className="sr-only">versus the previous week</span>
          </span>
        )}
      </p>
    </div>
  )
}
