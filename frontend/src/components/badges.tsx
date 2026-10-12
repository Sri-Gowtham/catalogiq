import type { AuditStatus, ListingFlag, Severity } from '@/api/types'
import { useAuth } from '@/lib/auth'
import { STATUS_LABEL } from '@/lib/format'
import { cn } from '@/lib/utils'

const pill = 'inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium whitespace-nowrap'
const amberText = 'text-warn'

const AUDIT: Record<AuditStatus, string> = {
  PASS: 'bg-pass/12 text-pass',
  REVIEW: `bg-review/15 ${amberText}`,
  FLAGGED: 'bg-flagged/12 text-flagged',
}

export function AuditBadge({ status, className }: { status: AuditStatus | null; className?: string }) {
  if (!status) return <span className="text-muted-foreground">n/a</span>
  return <span className={cn(pill, 'font-semibold tracking-wide', AUDIT[status], className)}>{status}</span>
}

const PRODUCT: Record<string, string> = {
  live: 'bg-pass/12 text-pass',
  ready: 'bg-primary/10 text-primary',
  upcoming: 'bg-upcoming/12 text-upcoming',
  in_enrichment: `bg-review/15 ${amberText}`,
  flagged: 'bg-flagged/12 text-flagged',
  draft: 'bg-muted text-muted-foreground',
}

export function ProductStatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(pill, PRODUCT[status] ?? PRODUCT.draft)}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

const RUN: Record<string, string> = {
  completed: 'bg-pass/12 text-pass',
  done: 'bg-pass/12 text-pass',
  live: 'bg-pass/12 text-pass',
  connected: 'bg-pass/12 text-pass',
  running: 'bg-primary/10 text-primary',
  queued: 'bg-muted text-muted-foreground',
  pending: 'bg-muted text-muted-foreground',
  skipped: 'bg-muted text-muted-foreground',
  attention: `bg-review/15 ${amberText}`,
  suppressed: 'bg-flagged/12 text-flagged',
  failed: 'bg-flagged/12 text-flagged',
  rejected: 'bg-flagged/12 text-flagged',
  approved: 'bg-pass/12 text-pass',
  disconnected: 'bg-muted text-muted-foreground',
}

export function StateBadge({ state, className }: { state: string; className?: string }) {
  return (
    <span className={cn(pill, 'capitalize', RUN[state] ?? 'bg-muted text-muted-foreground', className)}>
      {state === 'running' && <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-current motion-reduce:animate-none" />}
      {state.replace(/_/g, ' ')}
    </span>
  )
}

/** "Live" means real pipeline output, "Simulated" an agent that is not built yet, "Demo data" seeded sample numbers. */
export function DataTag({ kind, className }: { kind: 'live' | 'simulated' | 'demo'; className?: string }) {
  const styles = {
    live: 'bg-primary/10 text-primary',
    simulated: 'border border-dashed border-muted-foreground/45 text-muted-foreground',
    demo: 'bg-notice text-notice-foreground',
  }[kind]
  const label = { live: 'Live', simulated: 'Simulated', demo: 'Demo data' }[kind]
  const title = {
    live: 'Real output from a built agent',
    simulated: 'Stand-in output: this agent is not built yet',
    demo: 'Seeded sample numbers, not real marketplace data',
  }[kind]
  return (
    <span title={title} className={cn(pill, styles, className)}>
      <span aria-hidden className={cn('size-1.5 rounded-full', kind === 'live' ? 'bg-primary' : kind === 'demo' ? 'bg-current' : 'bg-muted-foreground/50')} />
      {label}
    </span>
  )
}

export function ModeBadge({ mode, className }: { mode: 'live' | 'simulated'; className?: string }) {
  return <DataTag kind={mode} className={className} />
}

const SEVERITY: Record<Severity, string> = {
  high: 'bg-flagged/12 text-flagged',
  medium: `bg-review/15 ${amberText}`,
  low: 'bg-muted text-muted-foreground',
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={cn(pill, 'capitalize', SEVERITY[severity])}>{severity}</span>
}

export function FlagBadge({ flag }: { flag: ListingFlag }) {
  if (!flag || flag === 'ok') return null
  return flag === 'flag' ? (
    <span className={cn(pill, SEVERITY.high)}>Underperforming</span>
  ) : (
    <span className={cn(pill, SEVERITY.medium)}>Watch</span>
  )
}

export function ScorePill({ score, className }: { score: number | null | undefined; className?: string }) {
  if (score == null) return <span className="text-muted-foreground">n/a</span>
  const tone = score >= 70 ? 'text-pass' : score >= 50 ? amberText : 'text-flagged'
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span
          className={cn('block h-full rounded-full', score >= 70 ? 'bg-pass' : score >= 50 ? 'bg-review' : 'bg-flagged')}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </span>
      <span className={cn('w-6 text-sm font-medium tabular-nums', tone)}>{score}</span>
    </span>
  )
}

export function RankChange({ rank, prev }: { rank: number | null; prev: number | null }) {
  if (rank == null) return <span className="text-muted-foreground">n/a</span>
  const diff = prev == null ? 0 : prev - rank
  return (
    <span className="relative inline-flex items-baseline gap-1.5 tabular-nums">
      <span className="font-medium">#{rank}</span>
      {diff !== 0 && (
        <span className={cn('text-xs', diff > 0 ? 'text-pass' : 'text-flagged')}>
          {diff > 0 ? '▲' : '▼'}
          {Math.abs(diff)}
          <span className="sr-only">{diff > 0 ? ' places up' : ' places down'}</span>
        </span>
      )}
    </span>
  )
}

/** Shown only in the demo workspace, where sales and ranks are seeded. Real workspaces never carry it. */
export function DemoTag() {
  const { me } = useAuth()
  return me?.is_demo ? <DataTag kind="demo" /> : null
}
