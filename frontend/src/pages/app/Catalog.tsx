import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { get } from '@/api/http'
import type { Facets, ProductList } from '@/api/types'
import { AuditBadge, DataTag, FlagBadge, ProductStatusBadge, ScorePill } from '@/components/badges'
import { AuthImage, Empty, ErrorState, fieldClass, Loading, PageHeader } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { formatDay, PLATFORM_SHORT, STATUS_LABEL } from '@/lib/format'
import { cn } from '@/lib/utils'

const SORTS = [
  { value: 'sku', label: 'SKU' },
  { value: 'name', label: 'Name' },
  { value: 'quality', label: 'Quality score' },
  { value: 'quality_asc', label: 'Lowest quality first' },
  { value: 'status', label: 'Status' },
  { value: 'rank', label: 'Best rank' },
  { value: 'launch', label: 'Launch date' },
]

export function Catalog() {
  const [params, setParams] = useSearchParams()
  const page = Number(params.get('page') ?? 1)

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const query = new URLSearchParams(params)
  query.set('page_size', '25')
  const { data, error, isPending, isFetching } = useQuery({
    queryKey: ['products', query.toString()],
    queryFn: () => get<ProductList>(`/products?${query}`),
    placeholderData: keepPreviousData,
  })
  const { data: facets } = useQuery({ queryKey: ['facets'], queryFn: () => get<Facets>('/products/facets'), staleTime: 30_000 })

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1
  const active = ['status', 'category', 'platform', 'q', 'flagged'].some((k) => params.get(k))

  return (
    <>
      <PageHeader title="Products" description="Scores, status and where each product is live." />

      <div className="surface mb-4 flex flex-wrap items-end gap-3 p-3">
        <form
          role="search"
          aria-label="Filter products"
          className="relative min-w-52 flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            const q = String(new FormData(e.currentTarget).get('q') ?? '').trim()
            set('q', q || null)
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input key={params.get('q') ?? ''} type="search" name="q" defaultValue={params.get('q') ?? ''} placeholder="Name or SKU…" aria-label="Search products" className={cn(fieldClass, 'pl-9')} />
        </form>
        <Select label="Status" value={params.get('status')} onChange={(v) => set('status', v)} options={facets?.status.map((f) => ({ value: f.key, label: `${STATUS_LABEL[f.key] ?? f.key} (${f.count})` }))} />
        <Select label="Category" value={params.get('category')} onChange={(v) => set('category', v)} options={facets?.category.map((f) => ({ value: f.key, label: `${f.key} (${f.count})` }))} />
        <Select label="Live on" value={params.get('platform')} onChange={(v) => set('platform', v)} options={facets?.platform.map((f) => ({ value: f.key, label: `${PLATFORM_SHORT[f.key] ?? f.key} (${f.count})` }))} />
        <Select label="Sort by" value={params.get('sort')} onChange={(v) => set('sort', v)} options={SORTS} placeholder="SKU" />
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={params.get('flagged') === 'true'} onChange={(e) => set('flagged', e.target.checked ? 'true' : null)} />
          Flagged listings only
        </label>
        {active && (
          <Button variant="ghost" size="sm" onClick={() => setParams({}, { replace: true })}>
            Clear filters
          </Button>
        )}
      </div>

      {isPending ? (
        <Loading className="h-96" />
      ) : error ? (
        <ErrorState error={error} />
      ) : data.items.length === 0 ? (
        <Empty title="No products match">Try a different search or clear the filters.</Empty>
      ) : (
        <div className={cn('surface overflow-hidden p-0 transition-opacity', isFetching && 'opacity-70')}>
          <div tabIndex={0} className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Audit</th>
                  <th className="px-3 py-2.5 font-medium">Quality</th>
                  <th className="px-3 py-2.5 font-medium">Live on</th>
                  <th className="px-3 py-2.5 text-right font-medium">Best rank</th>
                  <th className="px-4 py-2.5 font-medium">Signals</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.items.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <Link to={`/app/products/${p.id}`} className="flex items-center gap-3 hover:text-primary">
                        <AuthImage productId={p.id} alt="" className="size-10 shrink-0" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{p.name ?? 'Untitled product'}</span>
                          <span className="block text-xs text-muted-foreground" translate="no">
                            {p.sku} · {p.category ?? 'No category'}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <ProductStatusBadge status={p.status} />
                      {p.status === 'upcoming' && p.launch_date && <span className="mt-0.5 block text-xs text-muted-foreground">{formatDay(p.launch_date)}</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <AuditBadge status={p.audit_status} />
                    </td>
                    <td className="px-3 py-2.5">
                      <ScorePill score={p.quality_score} />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex flex-wrap gap-1">
                        {p.live_platforms.length === 0 && <span className="text-muted-foreground"><span aria-hidden>·</span><span className="sr-only">Not live</span></span>}
                        {p.live_platforms.map((k) => (
                          <span key={k} className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium">
                            {PLATFORM_SHORT[k] ?? k}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.best_rank ? `#${p.best_rank}` : '·'}</td>
                    <td className="px-4 py-2.5">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <FlagBadge flag={p.flag} />
                        {p.origin === 'live' && <DataTag kind="live" />}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t px-4 py-2.5 text-sm">
            <p className="text-muted-foreground tabular-nums" aria-live="polite">
              {(page - 1) * data.page_size + 1}–{Math.min(page * data.page_size, data.total)} of {data.total}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => set('page', String(page + 1))}>
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Select({
  label,
  value,
  onChange,
  options = [],
  placeholder = 'All',
}: {
  label: string
  value: string | null
  onChange: (v: string | null) => void
  options?: { value: string; label: string }[]
  placeholder?: string
}) {
  return (
    <label className="block min-w-36">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={fieldClass}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
