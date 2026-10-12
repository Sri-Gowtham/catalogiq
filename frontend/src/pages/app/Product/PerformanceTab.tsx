import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { get, post } from '@/api/http'
import type { ListingPerformance, ProductDetail } from '@/api/types'
import { DataTag, DemoTag, RankChange, StateBadge } from '@/components/badges'
import { Empty, ErrorState, Loading, Panel, Segmented } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/toast'
import { useAuth } from '@/lib/auth'
import { formatDay, formatInr, formatNum, formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'


/* ------------------------------------------------------------------ performance */
const COLORS = ['var(--primary)', 'oklch(0.65 0.15 155)', 'oklch(0.7 0.15 70)', 'oklch(0.6 0.18 300)', 'oklch(0.6 0.18 25)']

export function PerformanceTab({ p }: { p: ProductDetail }) {
  const { canWrite } = useAuth()
  const qc = useQueryClient()
  const [metric, setMetric] = useState<'rank' | 'clicks' | 'orders'>('rank')
  const { data, isPending, error } = useQuery({ queryKey: ['product-perf', p.id], queryFn: () => get<ListingPerformance[]>(`/products/${p.id}/performance`) })
  const toast = useToast()
  const test = useMutation({
    mutationFn: (listingId: number) => post(`/listings/${listingId}/reoptimize`),
    onSuccess: () => {
      toast.show('A/B test started (simulated)')
      qc.invalidateQueries()
    },
    onError: (e) => toast.show(e.message, 'error'),
  })

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
        tag={<DemoTag />}
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
        <div className="h-72" role="img" aria-label={`Line chart of ${metric} over the last 30 days for each platform`}>
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
