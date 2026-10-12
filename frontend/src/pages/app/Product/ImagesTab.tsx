import { Check, X } from 'lucide-react'
import type { ProductDetail } from '@/api/types'
import { DemoTag } from '@/components/badges'
import { AuthImage, Panel } from '@/components/kit'


/* ------------------------------------------------------------------ images */
export function ImagesTab({ p }: { p: ProductDetail }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_26rem]">
      <Panel title="Image set" tag={<DemoTag />}>
        <div className="grid gap-4 sm:grid-cols-3">
          {p.images.map((img) => (
            <figure key={img.kind}>
              <AuthImage productId={p.id} kind={img.kind} alt={`${img.kind} image of ${p.name}`} className="aspect-square w-full border" />
              <figcaption className="mt-2 text-sm">
                <span className="flex items-center justify-between">
                  <span className="font-medium capitalize">{img.kind}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {img.width}×{img.height}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {img.bg_white ? 'Plain white background' : 'Coloured background'} · quality {img.quality_score ?? 'n/a'}
                </span>
                {img.notes && <span className="mt-0.5 block text-xs text-flagged">{img.notes}</span>}
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Illustrations for the demo brand. Real catalogs use brand photos.</p>
      </Panel>
      <Panel title="Checks per platform">
        <div className="space-y-4">
          {p.image_reports.map((r) => (
            <div key={r.platform_key}>
              <p className="mb-1.5 text-sm font-medium">{r.platform_name}</p>
              <ul className="space-y-1">
                {r.checks.map((c) => (
                  <li key={c.rule} className="flex items-start gap-2 text-sm">
                    {c.ok ? <Check className="mt-0.5 size-4 shrink-0 text-pass" aria-label="Pass" /> : <X className="mt-0.5 size-4 shrink-0 text-flagged" aria-label="Fail" />}
                    <span>
                      {c.rule}
                      {c.detail && <span className="block text-xs text-muted-foreground">{c.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground">Illustrative rules, configurable per platform.</p>
      </Panel>
    </div>
  )
}
