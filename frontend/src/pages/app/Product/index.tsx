import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, X } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { get, post } from '@/api/http'
import type { ProductDetail } from '@/api/types'
import { AuditBadge, DataTag, ProductStatusBadge } from '@/components/badges'
import { AuthImage, ErrorState, Loading } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { TabBar, panelId, tabId } from '@/components/TabBar'
import { useToast } from '@/components/toast'
import { useAuth } from '@/lib/auth'
import { useTitle } from '@/lib/title'
import { confirmDiscard } from '@/lib/unsaved'
import { formatInr } from '@/lib/format'
import { OverviewTab } from './OverviewTab'
import { ContentTab } from './ContentTab'
import { ImagesTab } from './ImagesTab'
import { SourceTab } from './SourceTab'
import { ScoreTab } from './ScoreTab'
import { PerformanceTab } from './PerformanceTab'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'content', label: 'Platform content' },
  { key: 'images', label: 'Images' },
  { key: 'source', label: 'Source vs enriched' },
  { key: 'score', label: 'Score' },
  { key: 'performance', label: 'Performance' },
] as const
type Tab = (typeof TABS)[number]['key']



export function Product() {
  const { canWrite } = useAuth()
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'overview') as Tab
  const { data: p, error, isPending } = useQuery({ queryKey: ['product', id], queryFn: () => get<ProductDetail>(`/products/${id}`) })

  useTitle(p?.name ?? p?.sku)
  if (isPending) return <Loading className="h-[70vh]" />
  if (error) return <ErrorState error={error} />

  const demo = p.origin === 'demo'
  const setTab = (t: Tab) => {
    if (!confirmDiscard()) return
    const next = new URLSearchParams(params)
    next.set('tab', t)
    setParams(next, { replace: true })
  }

  return (
    <>
      <Link to="/app/catalog" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Products
      </Link>
      <div className="mb-6 flex flex-wrap items-start gap-5">
        <AuthImage productId={p.id} alt={`Front of pack for ${p.name ?? p.sku}`} className="size-16 shrink-0 border sm:size-24" />
        <div className="min-w-[15rem] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{p.name ?? 'Untitled product'}</h1>
            <ProductStatusBadge status={p.status} />
            <DataTag kind={demo ? 'demo' : 'live'} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground" translate="no">
            {p.sku} · {p.category ?? 'No category'} · {p.size ?? 'No size'} · {formatInr(p.price)}
            {p.batch_name && (
              <>
                {' · '}
                {canWrite ? (
                  <Link to={`/app/batches/${p.batch_id}`} className="text-primary underline underline-offset-2">
                    {p.batch_name}
                  </Link>
                ) : (
                  p.batch_name
                )}
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-5 text-sm">
            <Metric label="Audit score" value={p.audit_score} extra={<AuditBadge status={p.audit_status} />} />
            <Metric label="Quality score" value={p.quality_score} extra={<span className="text-xs text-muted-foreground">gate 70</span>} />
            <Metric label="Live on" value={p.listings.filter((l) => l.status === 'live').length} extra={<span className="text-xs text-muted-foreground">of {p.content.length} platforms</span>} />
          </div>
        </div>
        <PublishButton product={p} />
      </div>

      {(p.gate_blocked || p.review) && (
        <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-flagged/30 bg-flagged/6 p-4 text-sm">
          <X className="mt-0.5 size-4 shrink-0 text-flagged" />
          <div className="flex-1">
            <p className="font-medium">{p.gate_blocked ? 'Blocked by the quality gate' : 'Waiting for review'}</p>
            <p className="text-muted-foreground">{p.gate_reason ?? p.review?.reason}</p>
          </div>
          {p.review?.status === 'pending' && canWrite && (
            <Link to="/app/review" className="text-sm font-medium text-primary hover:underline">
              Open review queue
            </Link>
          )}
        </div>
      )}

      <TabBar label="Product sections" idPrefix="product" items={TABS.map((t) => ({ key: t.key, label: t.label }))} value={tab} onChange={setTab} />

      <div role="tabpanel" id={panelId('product', tab)} aria-labelledby={tabId('product', tab)}>
        {tab === 'overview' && <OverviewTab p={p} />}
        {tab === 'content' && <ContentTab p={p} />}
        {tab === 'images' && <ImagesTab p={p} />}
        {tab === 'source' && <SourceTab p={p} />}
        {tab === 'score' && <ScoreTab p={p} />}
        {tab === 'performance' && <PerformanceTab p={p} />}
      </div>
    </>
  )
}

function Metric({ label, value, extra }: { label: string; value: number | null; extra?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="flex items-center gap-2 text-lg font-semibold tabular-nums">
        {value ?? 'n/a'} {extra}
      </p>
    </div>
  )
}

function PublishButton({ product }: { product: ProductDetail }) {
  const { canWrite } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const targets = product.content.filter((c) => !product.listings.some((l) => l.platform_key === c.platform_key && l.status === 'live')).map((c) => c.platform_key)
  const m = useMutation({
    mutationFn: () => post<{ results: { platform: string; message: string }[] }>(`/products/${product.id}/publish`, { platforms: targets }),
    onSuccess: (r) => {
      toast.show(`Published to ${r.results.length} platform${r.results.length === 1 ? '' : 's'} (simulated, no marketplace call)`)
      qc.invalidateQueries()
    },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Publish failed', 'error'),
  })
  if (!canWrite || targets.length === 0) return null
  const allowed = ['ready', 'upcoming', 'live'].includes(product.status) && (product.quality_score ?? 0) >= 70
  return (
    <div className="flex flex-col items-end gap-1">
      <Button disabled={!allowed || m.isPending} onClick={() => m.mutate()} title={allowed ? undefined : 'Only products that pass the quality gate can be published'}>
        {m.isPending ? 'Publishing…' : `Publish to ${targets.length} more`}
      </Button>
    </div>
  )
}
