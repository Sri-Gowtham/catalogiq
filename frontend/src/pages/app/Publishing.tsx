import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { get } from '@/api/http'
import type { Publishing as PublishingData } from '@/api/types'
import { DataTag, StateBadge } from '@/components/badges'
import { Empty, ErrorState, Kpi, Loading, PageHeader, Panel, Segmented } from '@/components/kit'
import { formatDay, formatNum } from '@/lib/format'


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
            <div tabIndex={0} className="max-h-[36rem] overflow-auto">
              <table className="data w-full min-w-[36rem] text-sm">
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
                      <td className="py-2 text-right tabular-nums">{r.quality_score ?? 'n/a'}</td>
                      <td className="py-2 text-right">{view === 'queue' ? <StateBadge state={r.status} /> : r.rank ? `#${r.rank}` : 'n/a'}</td>
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
