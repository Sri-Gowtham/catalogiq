import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Inbox, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { raw } from '@/api/http'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function PageHeader({ title, description, actions, tag }: { title: string; description?: ReactNode; actions?: ReactNode; tag?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {tag}
        </div>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Panel({ title, action, children, className, tag, lead }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; tag?: ReactNode; lead?: boolean }) {
  return (
    <section className={cn(lead ? 'surface-raised surface-wash' : 'surface', 'p-5', className)}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {tag}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/** Tiny trend line for a KPI tile; decorative, the number beside it carries the meaning. */
export function Sparkline({ data, className }: { data: number[]; className?: string }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const span = Math.max(...data) - min || 1
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * 100).toFixed(1)},${(22 - ((v - min) / span) * 20).toFixed(1)}`)
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden className={cn('h-6 w-full text-primary', className)}>
      <polygon points={`0,24 ${pts.join(' ')} 100,24`} fill="currentColor" opacity="0.1" />
      <polyline points={pts.join(' ')} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function Kpi({ label, value, hint, tone, spark }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'pass' | 'review' | 'flagged' | 'primary'; spark?: number[] }) {
  const toneClass = tone ? { pass: 'text-pass', review: 'text-warn', flagged: 'text-flagged', primary: 'text-primary' }[tone] : ''
  const rail = tone ? { pass: 'bg-pass', review: 'bg-review', flagged: 'bg-flagged', primary: 'bg-primary' }[tone] : 'bg-border'
  return (
    <div className="surface relative overflow-hidden p-4 transition-shadow hover:shadow-[var(--shadow-raised)]">
      <span aria-hidden className={cn('absolute inset-y-3 left-0 w-0.5 rounded-r-full', rail)} />
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn('mt-1.5 text-2xl font-semibold tracking-tight tabular-nums', toneClass)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {spark && <Sparkline data={spark} className="mt-2" />}
    </div>
  )
}

export function Loading({ className }: { className?: string }) {
  return (
    <div role="status">
      <span className="sr-only">Loading…</span>
      <Skeleton className={cn('h-40 w-full rounded-2xl', className)} />
    </div>
  )
}

export function ErrorState({ error }: { error: unknown }) {
  return (
    <div role="alert" className="surface flex items-start gap-3 p-5 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-flagged" />
      <div>
        <p className="font-medium">Something went wrong</p>
        <p className="mt-0.5 text-muted-foreground">{error instanceof Error ? error.message : 'Please try again.'}</p>
      </div>
    </div>
  )
}

export function Empty({ title, children, icon: Icon = Inbox, action }: { title: string; children?: ReactNode; icon?: LucideIcon; action?: ReactNode }) {
  return (
    <div className="surface-wash flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center">
      <span className="grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground ring-1 ring-primary/10">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="mt-3 text-sm font-medium">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Product images need the Authorization header, so they are fetched and shown from a data URL (nothing to revoke). */
export function AuthImage({ productId, kind = 'front', alt, className }: { productId: number; kind?: string; alt: string; className?: string }) {
  const { data: src } = useQuery({
    queryKey: ['image', productId, kind],
    queryFn: async () => {
      const blob = await (await raw(`/products/${productId}/image/${kind}.svg`)).blob()
      return new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result))
        r.onerror = () => reject(r.error)
        r.readAsDataURL(blob)
      })
    },
    staleTime: Infinity,
    retry: false,
  })
  return (
    <div className={cn('overflow-hidden rounded-lg bg-muted', className)}>
      {src ? <img src={src} alt={alt} loading="lazy" decoding="async" className="size-full object-contain" /> : <span className="sr-only">{alt}</span>}
    </div>
  )
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-lg bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'shrink-0 rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors',
            value === o.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const fieldClass =
  'h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30'

export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: ReactNode; error?: string | null }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-flagged">{error}</span>}
    </label>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}>
      <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary)_70%,oklch(0.6_0.15_230))] text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_2px_6px_-2px_var(--primary)]">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7l8-4 8 4-8 4-8-4z" />
          <path d="M4 12l8 4 8-4" />
          <path d="M4 17l8 4 8-4" />
        </svg>
      </span>
      CatalogIQ
    </span>
  )
}

/** Larger view of an image in a native modal dialog: Escape closes it, focus is trapped and returned by the browser. */
export function Lightbox({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(92vw,44rem)] rounded-2xl border bg-card p-4 shadow-2xl backdrop:bg-foreground/40"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">{title}</p>
        <button type="button" onClick={onClose} className="rounded-lg border px-2.5 py-1 text-sm hover:bg-muted">
          Close
        </button>
      </div>
      {open && children}
    </dialog>
  )
}
