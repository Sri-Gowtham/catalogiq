import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, type Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
]

/** Three-way switch: light, follow the system, or dark. */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, set] = useTheme()
  return (
    <div role="radiogroup" aria-label="Colour theme" className={cn('inline-flex rounded-lg bg-muted p-0.5', className)}>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          aria-label={o.label}
          title={o.label}
          onClick={() => set(o.value)}
          className={cn('grid size-7 place-items-center rounded-md transition-colors', theme === o.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
        >
          <o.icon className="size-4" aria-hidden />
        </button>
      ))}
    </div>
  )
}
