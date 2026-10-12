import { Check, X } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Tone = 'success' | 'error'
interface Toast {
  id: number
  text: string
  tone: Tone
}

const ToastContext = createContext<{ show: (text: string, tone?: Tone) => void } | null>(null)

/** Short confirmations for actions that otherwise change something off-screen. Announced politely to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const next = useRef(1)
  const dismiss = useCallback((id: number) => setItems((cur) => cur.filter((t) => t.id !== id)), [])
  const show = useCallback(
    (text: string, tone: Tone = 'success') => {
      const id = next.current++
      setItems((cur) => [...cur.slice(-3), { id, text, tone }])
      window.setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4000)
    },
    [dismiss],
  )
  const value = useMemo(() => ({ show }), [show])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className="surface pointer-events-auto flex items-start gap-3 p-3 text-sm shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
          >
            <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-white', t.tone === 'error' ? 'bg-flagged' : 'bg-pass')}>
              {t.tone === 'error' ? <X className="size-3" aria-hidden /> : <Check className="size-3" aria-hidden />}
            </span>
            <p className="flex-1">{t.text}</p>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast outside ToastProvider')
  return ctx
}
