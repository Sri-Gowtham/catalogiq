import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { get, post } from '@/api/http'
import type { ProductDetail, ReviewItem } from '@/api/types'
import { AuditBadge, SeverityBadge, StateBadge } from '@/components/badges'
import { AuthImage, Empty, ErrorState, Loading, PageHeader, Panel, Segmented } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/toast'
import { useAuth } from '@/lib/auth'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

export function Review() {
  const { canWrite } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [status, setStatus] = useState<'pending' | 'resolved'>('pending')
  const [selected, setSelected] = useState<number[]>([])
  const [openId, setOpenId] = useState<number | null>(null)
  const { data, error, isPending } = useQuery({ queryKey: ['review', status], queryFn: () => get<ReviewItem[]>(`/review?status=${status}`) })

  const done = () => {
    setSelected([])
    qc.invalidateQueries()
  }
  const resolve = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'approve' | 'reject' }) => post(`/review/${id}/resolve`, { action }),
    onSuccess: (_, v) => {
      toast.show(v.action === 'approve' ? 'Approved and sent back for enrichment' : 'Rejected and returned to the supplier')
      done()
    },
    onError: (e) => toast.show(e.message, 'error'),
  })
  const bulk = useMutation({
    mutationFn: (action: 'approve' | 'reject') => post('/review/bulk', { ids: selected, action }),
    onSuccess: (_, action) => {
      toast.show(`${selected.length} item${selected.length === 1 ? '' : 's'} ${action === 'approve' ? 'approved' : 'rejected'}`)
      done()
    },
    onError: (e) => toast.show(e.message, 'error'),
  })

  const open = data?.find((r) => r.id === openId) ?? data?.[0]

  return (
    <>
      <PageHeader
        title="Review queue"
        description="Approve to re-enrich, or reject to return to the supplier."
        actions={
          <Segmented
            label="Show"
            value={status}
            onChange={(v) => {
              setStatus(v)
              setSelected([])
            }}
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'resolved', label: 'Resolved' },
            ]}
          />
        }
      />
      {isPending ? (
        <Loading className="h-96" />
      ) : error ? (
        <ErrorState error={error} />
      ) : data.length === 0 ? (
        <Empty title={status === 'pending' ? 'Nothing to review' : 'Nothing resolved yet'}>{status === 'pending' && 'Every record cleared the audit and the quality gate.'}</Empty>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_28rem]">
          <div className="surface overflow-hidden p-0">
            {canWrite && status === 'pending' && (
              <div className="flex flex-wrap items-center gap-3 border-b bg-muted/40 px-4 py-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={selected.length === data.length}
                    onChange={(e) => setSelected(e.target.checked ? data.map((r) => r.id) : [])}
                  />
                  Select all
                </label>
                <span className="text-muted-foreground" aria-live="polite">
                  {selected.length} selected
                </span>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" disabled={!selected.length || bulk.isPending} onClick={() => window.confirm(`Reject ${selected.length} item(s) and return them to the supplier?`) && bulk.mutate('reject')}>
                    Reject
                  </Button>
                  <Button size="sm" disabled={!selected.length || bulk.isPending} onClick={() => bulk.mutate('approve')}>
                    Approve selected
                  </Button>
                </div>
              </div>
            )}
            <ul className="divide-y">
              {data.map((r) => (
                <li key={r.id} className={cn('flex items-start gap-3 px-4 py-3', open?.id === r.id && 'bg-primary/4')}>
                  {canWrite && status === 'pending' && (
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.sku}`}
                      className="mt-1 size-4 accent-[var(--primary)]"
                      checked={selected.includes(r.id)}
                      onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id)))}
                    />
                  )}
                  <button type="button" onClick={() => setOpenId(r.id)} className="min-w-0 flex-1 text-left">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.name ?? r.sku}</span>
                      <SeverityBadge severity={r.severity} />
                      {r.status !== 'pending' && <StateBadge state={r.status} />}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground" translate="no">
                      {r.sku} · {r.category ?? 'No category'} · {formatDateTime(r.created_at)}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-sm text-foreground/80">{r.reason}</span>
                  </button>
                  <span className="flex items-center gap-1.5 text-xs tabular-nums">
                    <AuditBadge status={r.audit_status} /> {r.audit_score}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {open && <ReviewDetail item={open} onResolve={(action) => (action === 'approve' || window.confirm('Reject this record and return it to the supplier?')) && resolve.mutate({ id: open.id, action })} busy={resolve.isPending} canWrite={canWrite} />}
        </div>
      )}
    </>
  )
}

function ReviewDetail({ item, onResolve, busy, canWrite }: { item: ReviewItem; onResolve: (a: 'approve' | 'reject') => void; busy: boolean; canWrite: boolean }) {
  const { data: p } = useQuery({ queryKey: ['product', String(item.product_id)], queryFn: () => get<ProductDetail>(`/products/${item.product_id}`) })
  return (
    <Panel className="h-fit xl:sticky xl:top-20" title="Details" action={<Link to={`/app/products/${item.product_id}`} className="text-xs font-medium text-primary hover:underline">Open product</Link>}>
      <div className="flex gap-3">
        <AuthImage productId={item.product_id} alt="" className="size-16 shrink-0 border" />
        <div>
          <p className="font-medium">{item.name ?? item.sku}</p>
          <p className="text-xs text-muted-foreground">{item.sku}</p>
        </div>
      </div>
      <p className="mt-4 rounded-lg bg-flagged/6 p-3 text-sm">{item.reason}</p>
      {p && (
        <>
          <p className="mt-4 mb-1.5 text-xs font-medium text-muted-foreground">Supplier record</p>
          <dl className="divide-y rounded-lg border text-sm">
            {Object.entries(p.source).map(([k, v]) => {
              const issue = p.audit_issues.find((i) => i.field === k)
              return (
                <div key={k} className={cn('grid grid-cols-[6.5rem_1fr] gap-2 px-3 py-1.5', issue && 'bg-flagged/5')}>
                  <dt className="text-muted-foreground capitalize">{k}</dt>
                  <dd className="break-words">
                    {v == null || v === '' ? <span className="text-flagged">Missing</span> : String(v)}
                    {issue && <span className="block text-xs text-flagged">{issue.issue}</span>}
                  </dd>
                </div>
              )
            })}
          </dl>
        </>
      )}
      {canWrite && item.status === 'pending' && (
        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="flex-1" disabled={busy} onClick={() => onResolve('reject')}>
            Reject, return to supplier
          </Button>
          <Button className="flex-1" disabled={busy} onClick={() => onResolve('approve')}>
            Approve
          </Button>
        </div>
      )}
    </Panel>
  )
}
