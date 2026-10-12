import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { post } from '@/api/http'
import type { TokenOut } from '@/api/types'
import { Field, fieldClass, Logo } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { startDemo, useAuth } from '@/lib/auth'

function AuthFrame({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link to="/" className="w-fit">
          <Logo />
        </Link>
        <main id="main" className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-6 text-sm text-muted-foreground">{footer}</div>
        </main>
      </div>
      <aside className="hidden flex-col justify-center border-l bg-card/70 p-12 lg:flex">
        <blockquote className="max-w-md">
          <p className="text-lg font-medium">“Five platforms, five versions of every product, and no one checking them before they go live.”</p>
          <footer className="mt-3 text-sm text-muted-foreground">The problem CatalogIQ is built for</footer>
        </blockquote>
        <ul className="mt-10 max-w-md space-y-3 text-sm text-muted-foreground">
          <li>• Supplier data is audited before any AI runs</li>
          <li>• Content is shaped per platform and checked against brand rules</li>
          <li>• Nothing below a quality score of 70 is published</li>
          <li>• Rank, clicks and sales are tracked for every listing</li>
        </ul>
      </aside>
    </div>
  )
}

function DemoLink() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          signIn(await startDemo())
          navigate('/app')
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy ? 'Opening…' : 'Use the demo workspace'}
    </Button>
  )
}

export function Login() {
  const { me, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/app'
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (me) return <Navigate to={from} replace />

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    try {
      signIn(await post<TokenOut>('/auth/login', { email: f.get('email'), password: f.get('password') }))
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthFrame
      title="Log in"
      subtitle="Welcome back to your catalog."
      footer={
        <>
          New to CatalogIQ?{' '}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Create a workspace
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Work email">
          <input name="email" type="email" autoComplete="email" required spellCheck={false} className={fieldClass} placeholder="you@company.com" />
        </Field>
        <Field label="Password">
          <input name="password" type="password" autoComplete="current-password" required className={fieldClass} />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-flagged">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
      <DemoLink />
      <p className="mt-3 text-xs text-muted-foreground">
        Demo logins: demo@, manager@ or viewer@acmefoods.example with password <span className="font-mono">Demo@12345</span>.
      </p>
    </AuthFrame>
  )
}

export function Signup() {
  const { me, signIn } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (me) return <Navigate to="/app" replace />

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.currentTarget))
    if (String(f.password).length < 8) return setError('Use at least 8 characters for the password.')
    setBusy(true)
    setError(null)
    try {
      signIn(await post<TokenOut>('/auth/signup', f))
      navigate('/onboarding', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthFrame
      title="Create your workspace"
      subtitle="Free while in pilot. No card needed."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Your name">
          <input name="name" autoComplete="name" required minLength={2} className={fieldClass} />
        </Field>
        <Field label="Work email">
          <input name="email" type="email" autoComplete="email" required spellCheck={false} className={fieldClass} placeholder="you@company.com" />
        </Field>
        <Field label="Company">
          <input name="company" autoComplete="organization" required minLength={2} className={fieldClass} />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <input name="password" type="password" autoComplete="new-password" required minLength={8} className={fieldClass} />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-flagged">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Creating…' : 'Create workspace'}
        </Button>
      </form>
    </AuthFrame>
  )
}

export function Contact() {
  const [sent, setSent] = useState(false)
  return (
    <AuthFrame title="Talk to us" subtitle="Tell us about your catalog and we will set up a walkthrough." footer={<Link to="/" className="text-primary hover:underline">Back to home</Link>}>
      {sent ? (
        <p role="status" className="rounded-lg border bg-pass/8 p-4 text-sm">
          Thanks. This is a prototype, so no message was sent. In the product, our team would reply within one working day.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setSent(true)
          }}
          className="space-y-4"
        >
          <Field label="Name">
            <input name="name" autoComplete="name" required className={fieldClass} />
          </Field>
          <Field label="Work email">
            <input name="email" type="email" autoComplete="email" required spellCheck={false} className={fieldClass} />
          </Field>
          <Field label="Number of products">
            <select name="skus" className={fieldClass} defaultValue="100-500">
              <option>Under 100</option>
              <option>100-500</option>
              <option>500-5,000</option>
              <option>More than 5,000</option>
            </select>
          </Field>
          <Button type="submit" className="w-full">
            Request a demo
          </Button>
        </form>
      )}
    </AuthFrame>
  )
}
