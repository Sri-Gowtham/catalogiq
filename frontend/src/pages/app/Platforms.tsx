import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { get, post } from '@/api/http'
import type { Coverage, Platform } from '@/api/types'
import { DemoTag, StateBadge } from '@/components/badges'
import { ErrorState, Loading, PageHeader, Panel } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/toast'
import { useAuth } from '@/lib/auth'
import { formatInrCompact, formatNum, formatPct, PLATFORM_SHORT } from '@/lib/format'

const KIND = { marketplace: 'Marketplace', quick_commerce: 'Quick commerce', own_site: 'Brand store' } as Record<string, string>

export function Platforms() {
  const { isAdmin } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const { data, error, isPending } = useQuery({ queryKey: ['platforms'], queryFn: () => get<Platform[]>('/platforms') })
  const { data: cov } = useQuery({ queryKey: ['coverage'], queryFn: () => get<Coverage>('/platforms/coverage') })
  const toggle = useMutation({
    mutationFn: ({ key, status }: { key: string; status: string }) => post(`/platforms/${key}/status`, { status }),
    onSuccess: (_, v) => {
      toast.show(v.status === 'connected' ? 'Platform reconnected' : 'Platform disconnected')
      qc.invalidateQueries()
    },
  })

  if (isPending) return <Loading className="h-[70vh]" />
  if (error) return <ErrorState error={error} />

  return (
    <>
      <PageHeader title="Platforms" description="Channels, listings and coverage." tag={<DemoTag />} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.map((p) => (
          <section key={p.key} className="surface flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{p.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {KIND[p.kind] ?? p.kind} · {p.region}
                </p>
              </div>
              <StateBadge state={p.status} />
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <Stat label="Live" value={formatNum(p.live)} />
              <Stat label="Queued" value={formatNum(p.queued)} />
              <Stat label="Suppressed" value={formatNum(p.suppressed)} danger={p.suppressed > 0} />
              <Stat label="Avg rank" value={p.avg_rank ? `#${p.avg_rank}` : 'n/a'} />
              <Stat label="Click rate" value={formatPct(p.ctr)} />
              <Stat label="Revenue 30d" value={formatInrCompact(p.revenue)} />
            </dl>
            <details className="mt-4 border-t pt-3 text-sm">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Content and image rules</summary>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                <li>Title up to {p.rules.title_limit} characters</li>
                <li>
                  {p.rules.bullet_count} bullets, up to {p.rules.bullet_limit} characters each
                </li>
                <li>Description up to {p.rules.desc_limit} characters</li>
                <li>Mandatory: {p.rules.mandatory.join(', ')}</li>
                <li>
                  Images: at least {p.rules.images.min_px} px, {p.rules.images.min_count}+ images{p.rules.images.white_bg ? ', white main background' : ''}
                </li>
                {p.rules.bilingual && <li>Bilingual listing (English and Arabic)</li>}
              </ul>
            </details>
            <div className="mt-auto flex items-center justify-between gap-2 pt-4">
              <Link to={`/app/catalog?platform=${p.key}`} className="text-sm font-medium text-primary hover:underline">
                View products
              </Link>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={toggle.isPending}
                  onClick={() => (p.status === 'disconnected' || window.confirm(`Disconnect ${p.name}? Its listings stop syncing.`)) && toggle.mutate({ key: p.key, status: p.status === 'disconnected' ? 'connected' : 'disconnected' })}
                >
                  {p.status === 'disconnected' ? 'Reconnect' : 'Disconnect'}
                </Button>
              )}
            </div>
          </section>
        ))}
      </div>

      {cov && cov.rows.length > 0 && (
        <Panel title="Coverage: live products by category and platform" className="mt-4">
          <div tabIndex={0} className="overflow-x-auto">
            <table className="data w-full min-w-[40rem] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="pb-2 font-medium">Category</th>
                  <th className="pb-2 text-right font-medium">Products</th>
                  {cov.platforms.map((k) => (
                    <th key={k} className="pb-2 text-center font-medium">
                      {PLATFORM_SHORT[k] ?? k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {cov.rows.map((r) => (
                  <tr key={r.category}>
                    <td className="py-2 font-medium">{r.category}</td>
                    <td className="py-2 text-right text-muted-foreground tabular-nums">{r.products}</td>
                    {cov.platforms.map((k) => {
                      const n = r.cells[k] ?? 0
                      const share = r.products ? n / r.products : 0
                      return (
                        <td key={k} className="p-1 text-center">
                          <Link
                            to={`/app/catalog?platform=${k}&category=${encodeURIComponent(r.category)}`}
                            className="block rounded-md py-1.5 tabular-nums hover:ring-2 hover:ring-primary/40"
                            style={{ background: n ? `color-mix(in oklch, var(--primary) ${Math.round(8 + share * 50)}%, transparent)` : 'var(--muted)' }}
                            aria-label={`${n} ${r.category} products live on ${PLATFORM_SHORT[k] ?? k}`}
                          >
                            {n || '·'}
                          </Link>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Empty cells are expansion gaps.</p>
        </Panel>
      )}
    </>
  )
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={danger ? 'font-semibold text-flagged tabular-nums' : 'font-semibold tabular-nums'}>{value}</dd>
    </div>
  )
}
