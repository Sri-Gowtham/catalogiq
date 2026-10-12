import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { get, post } from '@/api/http'
import type { AbTest, ListingRow, PerfSummary } from '@/api/types'
import { DataTag, DemoTag, FlagBadge, RankChange, StateBadge } from '@/components/badges'
import { Empty, ErrorState, fieldClass, Kpi, Loading, PageHeader, Panel, Segmented } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/toast'
import { useAuth } from '@/lib/auth'
import { formatCompact, formatDay, formatInr, formatInrCompact, formatNum, formatPct, PLATFORM_SHORT } from '@/lib/format'
import { cn } from '@/lib/utils'


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
  const toast = useToast()
  const fix = useMutation({
    mutationFn: (id: number) => post(`/listings/${id}/reoptimize`),
    onSuccess: () => {
      toast.show('A/B test started (simulated)')
      qc.invalidateQueries({ queryKey: ['ab-tests'] })
    },
    onError: (e) => toast.show(e.message, 'error'),
  })

  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params)
    if (v) n.set(k, v)
    else n.delete(k)
    setParams(n, { replace: true })
  }

  if (summary.isPending) return <Loading className="h-[70vh]" />
  if (summary.error) return <ErrorState error={summary.error} />
  const s = summary.data
  const noData = s.series.length === 0

  if (noData)
    return (
      <>
        <PageHeader title="Performance" description="Rank and sales per listing, last 30 days." />
        <Empty title="No sales data yet">Numbers appear here once products are live on a platform.</Empty>
      </>
    )

  return (
    <>
      <PageHeader
        title="Performance"
        description="Rank and sales per listing, last 30 days."
        tag={<DemoTag />}
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
        <Kpi label="Average rank" value={s.avg_rank ? `#${s.avg_rank}` : 'n/a'} />
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
          <div className="h-64" role="img" aria-label={`Line chart of ${metric} over the last 30 days`}>
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
          <div className="h-64" role="img" aria-label={`Bar chart of revenue by category: ${s.by_category.map((c) => `${c.key} ${formatInrCompact(c.revenue)}`).join(', ')}`}>
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
          <div tabIndex={0} className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 font-medium">Platform</th>
                  <th className="pb-2 text-right font-medium">Rank</th>
                  <th className="hidden pb-2 text-right font-medium md:table-cell">Click rate</th>
                  <th className="hidden pb-2 text-right font-medium md:table-cell">Conversion</th>
                  <th className="hidden pb-2 text-right font-medium md:table-cell">Orders</th>
                  <th className="pb-2 text-right font-medium">Revenue</th>
                  <th className="hidden pb-2 pl-4 font-medium lg:table-cell">Diagnosis</th>
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
                      {l.diagnosis && <span className="mt-1 block text-xs text-[oklch(0.5_0.12_70)] lg:hidden">{l.diagnosis}</span>}
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
                    <td className="hidden py-2.5 text-right tabular-nums md:table-cell">{formatPct(l.ctr)}</td>
                    <td className="hidden py-2.5 text-right tabular-nums md:table-cell">{formatPct(l.conversion)}</td>
                    <td className="hidden py-2.5 text-right tabular-nums md:table-cell">{formatNum(l.orders)}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatInr(l.revenue)}</td>
                    <td className="hidden max-w-72 py-2.5 pl-4 text-xs text-muted-foreground lg:table-cell">
                      {l.diagnosis ?? 'n/a'}
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
