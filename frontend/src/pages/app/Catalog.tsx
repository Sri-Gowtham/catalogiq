import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Search } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { get, post } from '@/api/http'
import type { Facets, ProductDetail, ProductList, ProductSummary } from '@/api/types'
import { AuditBadge, DataTag, FlagBadge, ProductStatusBadge, ScorePill } from '@/components/badges'
import { AuthImage, Empty, ErrorState, fieldClass, Loading, PageHeader } from '@/components/kit'
import { useToast } from '@/components/toast'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { formatDay, PLATFORM_SHORT, STATUS_LABEL } from '@/lib/format'
import { cn } from '@/lib/utils'

const SORTS = [
  { value: 'sku', label: 'SKU' },
  { value: 'name', label: 'Name' },
  { value: 'quality', label: 'Highest quality first' },
  { value: 'quality_asc', label: 'Lowest quality first' },
  { value: 'status', label: 'Status' },
  { value: 'rank', label: 'Best rank' },
  { value: 'launch', label: 'Launch date' },
]
const PAGE_SIZES = [25, 50, 100]
const VIEWS_KEY = 'catalogiq.views'

interface SavedView {
  name: string
  query: string
}

function loadViews(): SavedView[] {
  try {
    const v = JSON.parse(localStorage.getItem(VIEWS_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x?.name === 'string' && typeof x?.query === 'string') : []
  } catch {
    return []
  }
}

function storeViews(views: SavedView[]) {
  try {
    localStorage.setItem(VIEWS_KEY, JSON.stringify(views))
  } catch {
    // storage blocked: views last until the tab closes
  }
}

/** A cell that starts with = + - or @ would run as a formula in a spreadsheet, so it is prefixed with a quote. */
const csvCell = (v: unknown) => {
  const s = String(v ?? '')
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return `"${safe.replace(/"/g, '""')}"`
}

function exportCsv(rows: ProductSummary[]) {
  const head = ['SKU', 'Name', 'Category', 'Status', 'Audit', 'Audit score', 'Quality score', 'Live on', 'Best rank']
  const body = rows.map((p) => [p.sku, p.name, p.category, STATUS_LABEL[p.status] ?? p.status, p.audit_status, p.audit_score, p.quality_score, p.live_platforms.map((k) => PLATFORM_SHORT[k] ?? k).join('; '), p.best_rank])
  const blob = new Blob([[head, ...body].map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'catalogiq-products.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}

export function Catalog() {
  const { canWrite } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState<number[]>([])
  const [views, setViews] = useState<SavedView[]>(loadViews)
  const [publishing, setPublishing] = useState(false)
  const page = Number(params.get('page') ?? 1)
  const pageSize = PAGE_SIZES.includes(Number(params.get('page_size'))) ? Number(params.get('page_size')) : 25
  const sort = params.get('sort') ?? 'sku'

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const query = new URLSearchParams(params)
  query.set('page_size', String(pageSize))
  const { data, error, isPending, isFetching } = useQuery({
    queryKey: ['products', query.toString()],
    queryFn: () => get<ProductList>(`/products?${query}`),
    placeholderData: keepPreviousData,
  })
  const { data: facets } = useQuery({ queryKey: ['facets'], queryFn: () => get<Facets>('/products/facets'), staleTime: 30_000 })

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1
  const active = ['status', 'category', 'platform', 'q', 'flagged'].some((k) => params.get(k))
  const rows = data?.items ?? []
  const allOnPage = rows.length > 0 && rows.every((r) => selected.includes(r.id))
  const chosen = rows.filter((r) => selected.includes(r.id))

  const saveView = () => {
    const name = window.prompt('Name this view', '')?.trim()
    if (!name) return
    const next = [...views.filter((v) => v.name !== name), { name, query: params.toString() }].slice(-12)
    setViews(next)
    storeViews(next)
    toast.show(`View "${name}" saved in this browser`)
  }
  const deleteView = (name: string) => {
    const next = views.filter((v) => v.name !== name)
    setViews(next)
    storeViews(next)
  }

  /** Publishes each selected product that has passed the gate to every platform it is not live on yet. */
  const publishSelected = async () => {
    const eligible = chosen.filter((p) => ['ready', 'upcoming', 'live'].includes(p.status) && (p.quality_score ?? 0) >= 70)
    if (eligible.length === 0) return toast.show('None of the selected products have passed the quality gate', 'error')
    if (!window.confirm(`Publish ${eligible.length} product(s) to every platform they are not live on? (simulated)`)) return
    setPublishing(true)
    let done = 0
    let failed = 0
    for (const p of eligible) {
      try {
        const d = await get<ProductDetail>(`/products/${p.id}`)
        const targets = d.content.filter((c) => !d.listings.some((l) => l.platform_key === c.platform_key && l.status === 'live')).map((c) => c.platform_key)
        if (targets.length) await post(`/products/${p.id}/publish`, { platforms: targets })
        done += 1
      } catch {
        failed += 1
      }
    }
    setPublishing(false)
    setSelected([])
    qc.invalidateQueries()
    toast.show(`${done} product${done === 1 ? '' : 's'} published${failed ? `, ${failed} failed` : ''} (simulated)`, failed ? 'error' : 'success')
  }

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

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">Saved views</span>
          <select
            aria-label="Saved views"
            value=""
            onChange={(e) => {
              const v = views.find((x) => x.name === e.target.value)
              if (v) setParams(new URLSearchParams(v.query), { replace: true })
            }}
            className={cn(fieldClass, 'h-8 w-44')}
          >
            <option value="">{views.length ? 'Choose a view' : 'None saved'}</option>
            {views.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" variant="outline" onClick={saveView}>
          Save this view
        </Button>
        {views.length > 0 && (
          <select
            aria-label="Delete a saved view"
            value=""
            onChange={(e) => e.target.value && deleteView(e.target.value)}
            className={cn(fieldClass, 'h-8 w-40')}
          >
            <option value="">Delete a view…</option>
            {views.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name}
              </option>
            ))}
          </select>
        )}
        <span className="ml-auto flex items-center gap-2" aria-live="polite">
          {chosen.length > 0 && <span className="text-muted-foreground tabular-nums">{chosen.length} selected</span>}
          <Button size="sm" variant="outline" disabled={rows.length === 0} onClick={() => exportCsv(chosen.length ? chosen : rows)}>
            <Download className="size-3.5" /> Export {chosen.length ? 'selected' : 'this page'}
          </Button>
          {canWrite && (
            <Button size="sm" disabled={chosen.length === 0 || publishing} onClick={publishSelected}>
              {publishing ? 'Publishing…' : 'Publish selected'}
            </Button>
          )}
        </span>
      </div>

      {isPending ? (
        <Loading className="h-96" />
      ) : error ? (
        <ErrorState error={error} />
      ) : rows.length === 0 ? (
        <Empty title="No products match">Try a different search or clear the filters.</Empty>
      ) : (
        <div className={cn('surface overflow-hidden p-0 transition-opacity', isFetching && 'opacity-70')}>
          <div tabIndex={0} className="overflow-x-auto">
            <table className="w-full min-w-[58rem] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-10 py-2.5 pl-4 font-medium">
                    <input
                      type="checkbox"
                      aria-label="Select all products on this page"
                      className="size-4 accent-[var(--primary)]"
                      checked={allOnPage}
                      onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.id) : [])}
                    />
                  </th>
                  <SortHeader label="Product" sort={sort} asc="name" onSort={(v) => set('sort', v)} />
                  <SortHeader label="Status" sort={sort} asc="status" onSort={(v) => set('sort', v)} className="px-3" />
                  <th className="px-3 py-2.5 font-medium">Audit</th>
                  <SortHeader label="Quality" sort={sort} asc="quality_asc" desc="quality" onSort={(v) => set('sort', v)} className="px-3" />
                  <th className="px-3 py-2.5 font-medium">Live on</th>
                  <SortHeader label="Best rank" sort={sort} asc="rank" onSort={(v) => set('sort', v)} className="px-3 text-right" />
                  <th className="px-4 py-2.5 font-medium">Signals</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((p) => (
                  <tr key={p.id} className={cn('hover:bg-muted/40', selected.includes(p.id) && 'bg-primary/4')}>
                    <td className="py-2.5 pl-4">
                      <input
                        type="checkbox"
                        aria-label={`Select ${p.name ?? p.sku}`}
                        className="size-4 accent-[var(--primary)]"
                        checked={selected.includes(p.id)}
                        onChange={(e) => setSelected((cur) => (e.target.checked ? [...cur, p.id] : cur.filter((x) => x !== p.id)))}
                      />
                    </td>
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
                        {p.live_platforms.length === 0 && (
                          <span className="text-muted-foreground">
                            <span aria-hidden>·</span>
                            <span className="sr-only">Not live</span>
                          </span>
                        )}
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
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2.5 text-sm">
            <p className="text-muted-foreground tabular-nums" aria-live="polite">
              {(page - 1) * data.page_size + 1}–{Math.min(page * data.page_size, data.total)} of {data.total}
            </p>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-muted-foreground">
                Rows
                <select value={pageSize} onChange={(e) => set('page_size', e.target.value === '25' ? null : e.target.value)} className={cn(fieldClass, 'h-8 w-20')}>
                  {PAGE_SIZES.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
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

/** Column header that sorts on click. Cycles descending, ascending, off when both are given; ascending, off when only `asc` is. */
function SortHeader({ label, sort, asc, desc, onSort, className }: { label: string; sort: string; asc: string; desc?: string; onSort: (v: string | null) => void; className?: string }): ReactNode {
  const on = sort === asc ? 'ascending' : desc && sort === desc ? 'descending' : 'none'
  const Icon = on === 'ascending' ? ArrowUp : on === 'descending' ? ArrowDown : ArrowUpDown
  const next = on === 'none' ? (desc ?? asc) : on === 'descending' ? asc : null
  return (
    <th aria-sort={on} className={cn('py-2.5 font-medium', className ?? 'px-4')}>
      <button type="button" onClick={() => onSort(next)} className="inline-flex items-center gap-1 rounded hover:text-foreground">
        {label}
        <Icon className={cn('size-3', on === 'none' && 'opacity-50')} aria-hidden />
      </button>
    </th>
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
