import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface TabItem<T extends string> {
  key: T
  label: string
  badge?: ReactNode
}

/**
 * Accessible tabs: one tab stop, arrow keys / Home / End move between tabs, each tab points at its panel.
 * The panel must carry `id={panelId(idPrefix, value)}`, `role="tabpanel"` and `aria-labelledby={tabId(idPrefix, value)}`.
 */
export const tabId = (prefix: string, key: string) => `${prefix}-tab-${key}`
export const panelId = (prefix: string, key: string) => `${prefix}-panel-${key}`

export function TabBar<T extends string>({
  label,
  items,
  value,
  onChange,
  idPrefix,
  variant = 'underline',
}: {
  label: string
  items: TabItem<T>[]
  value: T
  onChange: (key: T) => void
  idPrefix: string
  variant?: 'underline' | 'pill'
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const onKeyDown = (e: KeyboardEvent) => {
    const focused = items.findIndex((t) => refs.current[t.key] === document.activeElement)
    const i = focused >= 0 ? focused : items.findIndex((t) => t.key === value)
    const target =
      e.key === 'ArrowRight' ? (i + 1) % items.length : e.key === 'ArrowLeft' ? (i - 1 + items.length) % items.length : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : -1
    if (target < 0) return
    e.preventDefault()
    onChange(items[target].key)
    refs.current[items[target].key]?.focus()
  }
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={cn('flex gap-1', variant === 'underline' ? 'mb-5 overflow-x-auto border-b' : 'mb-4 flex-wrap gap-2')}>
      {items.map((t) => {
        const selected = t.key === value
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[t.key] = el
            }}
            id={tabId(idPrefix, t.key)}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={panelId(idPrefix, t.key)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={cn(
              'flex items-center gap-2 text-sm font-medium whitespace-nowrap transition-colors',
              variant === 'underline'
                ? cn('-mb-px border-b-2 px-3 py-2', selected ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')
                : cn('rounded-lg border px-3 py-1.5', selected ? 'border-primary bg-primary/6 text-primary' : 'bg-card hover:bg-muted'),
            )}
          >
            {t.label}
            {t.badge}
          </button>
        )
      })}
    </div>
  )
}
