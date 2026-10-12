import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { get, post } from '@/api/http'
import type { Batch, BatchDetail as BatchDetailData, ProductList } from '@/api/types'
import { AuditBadge, DataTag, ModeBadge, ProductStatusBadge, ScorePill, StateBadge } from '@/components/badges'
import { Empty, ErrorState, Kpi, Loading, PageHeader, Panel } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { useTitle } from '@/lib/title'
import { formatDateTime, formatMs, formatNum, layerName, STATUS_LABEL } from '@/lib/format'
import { cn } from '@/lib/utils'

const active = (s: string) => s === 'queued' || s === 'running'

function Progress({ b }: { b: Batch }) {
  const pct = b.status === 'completed' ? 100 : Math.round((100 * b.stage_index) / Math.max(b.stage_total, 1))
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${b.name} progress`}>
        <div className={cn('h-full rounded-full', b.status === 'failed' ? 'bg-flagged' : 'bg-primary')} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
    </div>
  )
}

function UploadControls() {
  const { canWrite } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const done = (r: { batch_id: number }) => {
    qc.invalidateQueries()
    navigate(`/app/batches/${r.batch_id}`)
  }
  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData()
      body.append('file', file)
      return post<{ batch_id: number }>('/batches/upload', body)
    },
    onSuccess: done,
    onError: (e) => setError(e.message),
  })
  const sample = useMutation({ mutationFn: () => post<{ batch_id: number }>('/batches/sample'), onSuccess: done, onError: (e) => setError(e.message) })
  if (!canWrite) return null
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => sample.mutate()} disabled={sample.isPending}>
          {sample.isPending ? 'Starting…' : 'Run sample feed'}
        </Button>
        <Button onClick={() => input.current?.click()} disabled={upload.isPending}>
          <Upload className="size-4" /> {upload.isPending ? 'Uploading…' : 'Upload feed'}
        </Button>
        <input
          ref={input}
          type="file"
          accept=".csv,.json"
          className="sr-only"
          aria-label="Supplier feed file"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) upload.mutate(f)
            e.target.value = ''
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-xs text-flagged">
          {error}
        </p>
      )}
    </div>
  )
}

export function Batches() {
  const { data, error, isPending } = useQuery({
    queryKey: ['batches'],
    queryFn: () => get<Batch[]>('/batches'),
    refetchInterval: (q) => (q.state.data?.some((b) => active(b.status)) ? 1500 : 15_000),
  })
  return (
    <>
      <PageHeader
        title="Batches"
        description="Supplier feeds, processed live by the agent workbench."
        actions={<UploadControls />}
      />
      {isPending ? (
        <Loading className="h-96" />
      ) : error ? (
        <ErrorState error={error} />
      ) : data.length === 0 ? (
        <Empty title="No batches yet">Upload a supplier feed (CSV or JSON) to start.</Empty>
      ) : (
        <div tabIndex={0} className="surface overflow-x-auto p-0">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Batch</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Current stage</th>
                <th className="px-3 py-2.5 font-medium">Progress</th>
                <th className="px-3 py-2.5 text-right font-medium">Items</th>
                <th className="px-3 py-2.5 text-right font-medium">Flagged</th>
                <th className="px-4 py-2.5 font-medium">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.map((b) => (
                <tr key={b.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link to={`/app/batches/${b.id}`} className="font-medium hover:text-primary">
                      {b.name}
                    </Link>
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      {b.source_file} <DataTag kind={b.kind === 'live' ? 'live' : 'demo'} />
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <StateBadge state={b.status} />
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{b.status === 'completed' ? 'Finished' : b.stage_name}</td>
                  <td className="px-3 py-3">
                    <Progress b={b} />
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatNum(b.total)}</td>
                  <td className={cn('px-3 py-3 text-right tabular-nums', b.flagged > 0 && 'font-medium text-flagged')}>{b.flagged}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDateTime(b.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export function BatchDetail() {
  const { id } = useParams()
  const { data, error, isPending } = useQuery({
    queryKey: ['batch', id],
    queryFn: () => get<BatchDetailData>(`/batches/${id}`),
    refetchInterval: (q) => (q.state.data && active(q.state.data.batch.status) ? 1000 : false),
  })
  const { data: products } = useQuery({
    queryKey: ['products', 'batch', id, data?.batch.status],
    queryFn: () => get<ProductList>(`/products?batch_id=${id}&page_size=100&sort=status`),
    enabled: !!data,
  })

  useTitle(data?.batch.name)
  if (isPending) return <Loading className="h-[70vh]" />
  if (error) return <ErrorState error={error} />
  const b = data.batch

  return (
    <>
      <Link to="/app/batches" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Batches
      </Link>
      <PageHeader
        title={b.name}
        tag={
          <>
            <StateBadge state={b.status} />
            <DataTag kind={b.kind === 'live' ? 'live' : 'demo'} />
          </>
        }
        description={`${b.source_file ?? 'Feed'} · started ${formatDateTime(b.created_at)}${b.finished_at ? ` · finished ${formatDateTime(b.finished_at)}` : ''}`}
      />
      {b.error && (
        <p role="alert" className="mb-4 rounded-lg bg-flagged/8 p-3 text-sm text-flagged">
          {b.error}
        </p>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Items in feed" value={formatNum(b.total)} />
        <Kpi label="Flagged by audit" value={formatNum(b.flagged)} tone="flagged" hint="Stopped before enrichment" />
        <Kpi label="Ready or live" value={formatNum(b.ready)} tone="pass" />
        <Kpi label="Stage" value={`${Math.min(b.stage_index + (b.status === 'completed' ? 0 : 1), b.stage_total)} / ${b.stage_total}`} hint={b.status === 'completed' ? 'Finished' : b.stage_name} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[26rem_1fr]">
        <Panel title="Pipeline run" tag={<span className="text-xs text-muted-foreground" aria-live="polite">{active(b.status) ? 'Updating live…' : ''}</span>}>
          <ol className="relative space-y-1">
            {data.stages.map((s, i) => (
              <li key={s.agent_id} className={cn('flex items-start gap-3 rounded-lg p-2', s.status === 'running' && 'bg-primary/6')}>
                <span
                  className={cn(
                    'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
                    s.status === 'done' && 'bg-pass text-white',
                    s.status === 'running' && 'bg-primary text-primary-foreground',
                    s.status === 'failed' && 'bg-flagged text-white',
                    (s.status === 'pending' || s.status === 'skipped') && 'border border-dashed text-muted-foreground',
                  )}
                >
                  {s.status === 'done' ? '✓' : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {s.name} <ModeBadge mode={s.mode} />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {layerName(s.layer)}
                    {s.status !== 'pending' && (
                      <>
                        {' · '}
                        {formatMs(s.duration_ms)}
                        {s.processed != null && ` · ${s.processed} processed`}
                        {!!s.skipped && ` · ${s.skipped} skipped`}
                        {s.tokens != null && ` · ${formatNum(s.tokens)} tokens`}
                      </>
                    )}
                  </p>
                  {s.note && <p className="text-xs text-muted-foreground italic">{s.note}</p>}
                </div>
                <StateBadge state={s.status} />
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="Products in this batch" tag={products && <span className="text-xs text-muted-foreground">{products.total}</span>}>
          <div className="mb-3 flex flex-wrap gap-2">
            {Object.entries(data.product_status).map(([k, n]) => (
              <span key={k} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
                {STATUS_LABEL[k] ?? k} <strong className="tabular-nums">{n}</strong>
              </span>
            ))}
          </div>
          {!products ? (
            <Loading className="h-60" />
          ) : products.items.length === 0 ? (
            <Empty title={active(b.status) ? 'Products appear when the run finishes' : 'No products'} />
          ) : (
            <div tabIndex={0} className="max-h-[32rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="pb-2 font-medium">Product</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Audit</th>
                    <th className="pb-2 font-medium">Quality</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {products.items.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2 pr-3">
                        <Link to={`/app/products/${p.id}`} className="hover:text-primary">
                          <span className="block truncate font-medium">{p.name ?? p.sku}</span>
                          <span className="text-xs text-muted-foreground" translate="no">
                            {p.sku}
                          </span>
                        </Link>
                      </td>
                      <td className="py-2">
                        <ProductStatusBadge status={p.status} />
                      </td>
                      <td className="py-2">
                        <span className="flex items-center gap-2">
                          <AuditBadge status={p.audit_status} />
                          <span className="text-xs tabular-nums">{p.audit_score}</span>
                        </span>
                      </td>
                      <td className="py-2">
                        <ScorePill score={p.quality_score} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}
