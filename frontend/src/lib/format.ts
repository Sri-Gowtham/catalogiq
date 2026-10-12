const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const inrCompact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 })
const num = new Intl.NumberFormat('en-IN')
const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 })
const day = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' })
const dateTime = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export const formatInr = (v: number | null | undefined) => (v == null ? 'n/a' : inr.format(v))
export const formatInrCompact = (v: number | null | undefined) => (v == null ? 'n/a' : inrCompact.format(v))
export const formatNum = (v: number | null | undefined) => (v == null ? 'n/a' : num.format(v))
export const formatCompact = (v: number | null | undefined) => (v == null ? 'n/a' : compact.format(v))
export const formatPct = (v: number | null | undefined, digits = 1) => (v == null ? 'n/a' : `${v.toFixed(digits)}%`)

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return 'n/a'
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  return Number.isNaN(d.getTime()) ? 'n/a' : day.format(d)
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'n/a'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'n/a' : dateTime.format(d)
}

export function formatMs(ms: number | null | undefined): string {
  if (ms == null) return 'n/a'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

export function layerName(layer: number): string {
  return { 1: 'Nervous system', 2: 'Brain', 3: 'Immune system' }[layer] ?? `Layer ${layer}`
}

export const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  in_enrichment: 'In enrichment',
  flagged: 'Flagged',
  ready: 'Ready',
  upcoming: 'Upcoming',
  live: 'Live',
}

export const PLATFORM_SHORT: Record<string, string> = {
  amazon_in: 'Amazon',
  flipkart: 'Flipkart',
  noon: 'Noon',
  blinkit: 'Blinkit',
  website: 'Website',
}
