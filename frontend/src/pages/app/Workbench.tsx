import { useQuery } from '@tanstack/react-query'
import { get } from '@/api/http'
import type { Workbench as WorkbenchData } from '@/api/types'
import { ModeBadge, StateBadge } from '@/components/badges'
import { ErrorState, Loading, PageHeader, Panel } from '@/components/kit'
import { formatMs, formatNum, layerName } from '@/lib/format'
import { cn } from '@/lib/utils'


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
          <div tabIndex={0} className="overflow-x-auto">
            <table className="data w-full min-w-[44rem] text-sm">
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
                    <td className="py-2.5 text-right tabular-nums">{a.runs || 'n/a'}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatMs(a.avg_ms)}</td>
                    <td className="py-2.5 text-right tabular-nums">{a.processed ? formatNum(a.processed) : 'n/a'}</td>
                    <td className={cn('py-2.5 text-right tabular-nums', a.failed > 0 && 'text-flagged')}>{a.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Recent runs" tag={<span className="text-xs text-muted-foreground">refreshes every 5 s</span>}>
          <ul tabIndex={0} className="max-h-[36rem] divide-y overflow-y-auto">
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
