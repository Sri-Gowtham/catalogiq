import { Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ProductDetail } from '@/api/types'
import { DataTag, DemoTag, FlagBadge, RankChange, SeverityBadge, StateBadge } from '@/components/badges'
import { Empty, Panel } from '@/components/kit'
import { formatInr, formatNum } from '@/lib/format'


/* ------------------------------------------------------------------ overview */
export function OverviewTab({ p }: { p: ProductDetail }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Listings" className="lg:col-span-2" tag={p.origin === 'demo' && <DemoTag />}>
        {p.listings.length === 0 ? (
          <Empty title="Not listed anywhere yet">Listings appear once the product is published.</Empty>
        ) : (
          <div tabIndex={0} className="overflow-x-auto">
            <table className="data w-full min-w-[36rem] text-sm">
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
                  <Link to="?tab=performance" className="font-medium text-primary underline underline-offset-2">
                    See the fix
                  </Link>
                </p>
              ))}
          </div>
        )}
      </Panel>
      <Panel title="Data audit" tag={<DataTag kind="live" />}>
        <p className="text-sm text-muted-foreground">
          Score <strong className="text-foreground tabular-nums">{p.audit_score ?? 'n/a'}</strong> out of 100 before any AI ran.
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
