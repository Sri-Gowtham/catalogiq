import { useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { post } from '@/api/http'
import { Loading, Logo } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

const PLATFORMS = [
  { key: 'amazon_in', name: 'Amazon India', note: 'Marketplace · India' },
  { key: 'flipkart', name: 'Flipkart', note: 'Marketplace · India' },
  { key: 'blinkit', name: 'Blinkit', note: 'Quick commerce · India' },
  { key: 'noon', name: 'Noon', note: 'Marketplace · UAE, bilingual' },
  { key: 'website', name: 'Brand website', note: 'Your own store' },
]

export function Onboarding() {
  const { me, loading } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [platforms, setPlatforms] = useState<string[]>(['amazon_in', 'flipkart'])
  const [demo, setDemo] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) return <Loading className="m-8 h-[60vh] w-auto" />
  if (!me) return <Navigate to="/login" replace />
  if (me.onboarded) return <Navigate to="/app" replace />
  if (me.role !== 'admin') return <p className="p-10 text-center text-sm">Ask your workspace admin to finish setting up the workspace.</p>

  const finish = async () => {
    setBusy(true)
    setError(null)
    try {
      await post('/workspace/onboarding', { platforms, load_demo_data: demo })
      await qc.invalidateQueries()
      navigate('/app', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not finish set-up')
      setBusy(false)
    }
  }

  const steps = ['Platforms', 'Your data', 'Done']
  return (
    <div className="min-h-screen">
      <header className="flex h-16 items-center border-b px-6">
        <Logo />
      </header>
      <main id="main" className="mx-auto max-w-2xl px-5 py-12">
        <ol className="mb-10 flex items-center gap-3 text-sm" aria-label="Set-up steps">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-3" aria-current={i === step ? 'step' : undefined}>
              <span
                className={cn(
                  'grid size-6 place-items-center rounded-full text-xs font-semibold',
                  i < step ? 'bg-pass text-white' : i === step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={i === step ? 'font-medium' : 'text-muted-foreground'}>{s}</span>
              {i < steps.length - 1 && <span className="h-px w-8 bg-border" />}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <section>
            <h1 className="text-2xl font-semibold tracking-tight">Where do you sell, {me.name.split(' ')[0]}?</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">CatalogIQ shapes content and checks images against the rules of each platform you pick.</p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {PLATFORMS.map((p) => {
                const on = platforms.includes(p.key)
                return (
                  <label
                    key={p.key}
                    className={cn('surface flex cursor-pointer items-start gap-3 p-4 transition-colors', on && 'border-primary/60 bg-primary/4')}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-[var(--primary)]"
                      checked={on}
                      onChange={() => setPlatforms((cur) => (on ? cur.filter((k) => k !== p.key) : [...cur, p.key]))}
                    />
                    <span>
                      <span className="block text-sm font-medium">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">{p.note}</span>
                    </span>
                  </label>
                )
              })}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Connections are simulated in this prototype: no marketplace account is linked.</p>
            <Button className="mt-8" disabled={platforms.length === 0} onClick={() => setStep(1)}>
              Continue
            </Button>
          </section>
        )}

        {step === 1 && (
          <section>
            <h1 className="text-2xl font-semibold tracking-tight">Start with sample data?</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">You can upload your own supplier feed at any time from Batches.</p>
            <div className="mt-8 grid gap-3">
              {[
                { v: true, t: 'Load the sample catalog', d: '240 products from a fictional brand on all five platforms, with 30 days of sample performance. Clearly labelled Demo data.' },
                { v: false, t: 'Start empty', d: 'Begin with an empty catalog and upload a supplier feed (CSV or JSON).' },
              ].map((o) => (
                <label key={o.t} className={cn('surface flex cursor-pointer items-start gap-3 p-4', demo === o.v && 'border-primary/60 bg-primary/4')}>
                  <input type="radio" name="demo" className="mt-1 size-4 accent-[var(--primary)]" checked={demo === o.v} onChange={() => setDemo(o.v)} />
                  <span>
                    <span className="block text-sm font-medium">{o.t}</span>
                    <span className="block text-sm text-muted-foreground">{o.d}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-8 flex gap-2">
              <Button variant="outline" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button onClick={() => setStep(2)}>Continue</Button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <h1 className="text-2xl font-semibold tracking-tight">Ready to go</h1>
            <ul className="mt-6 space-y-2 text-sm">
              <li>
                <strong>Workspace:</strong> {me.workspace_name}
              </li>
              <li>
                <strong>Platforms:</strong> {PLATFORMS.filter((p) => platforms.includes(p.key)).map((p) => p.name).join(', ')}
              </li>
              <li>
                <strong>Data:</strong> {demo ? 'Sample catalog' : 'Empty catalog'}
              </li>
            </ul>
            {error && (
              <p role="alert" className="mt-4 text-sm text-flagged">
                {error}
              </p>
            )}
            <div className="mt-8 flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} disabled={busy}>
                Back
              </Button>
              <Button onClick={finish} disabled={busy}>
                {busy ? 'Setting up…' : 'Open my workspace'}
              </Button>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
