import { useState, type FormEvent, type ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { post } from '@/api/http'
import type { TokenOut } from '@/api/types'
import { Field, fieldClass, Logo } from '@/components/kit'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { startDemo, useAuth } from '@/lib/auth'

function AuthFrame({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <header>
          <Link to="/" className="inline-block">
            <Logo />
          </Link>
        </header>
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

function PasswordInput({ name = 'password', autoComplete, minLength }: { name?: string; autoComplete: string; minLength?: number }) {
  const [shown, setShown] = useState(false)
  return (
    <span className="relative block">
      <input name={name} type={shown ? 'text' : 'password'} autoComplete={autoComplete} required minLength={minLength} className={cn(fieldClass, 'pr-10')} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-pressed={shown}
        aria-label={shown ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground"
      >
        {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </span>
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
          <PasswordInput autoComplete="current-password" />
        </Field>
        <p className="text-right text-sm">
          <Link to="/forgot-password" className="text-primary underline underline-offset-2">
            Forgot your password?
          </Link>
        </p>
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
          <PasswordInput autoComplete="new-password" minLength={8} />
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <AuthFrame title="Talk to us" subtitle="Tell us about your catalog and we will set up a walkthrough." footer={<Link to="/" className="text-primary underline underline-offset-2">Back to home</Link>}>
      {sent ? (
        <p role="status" className="rounded-lg border bg-pass/8 p-4 text-sm">
          Thanks, your request is saved. This is a prototype, so nobody is emailed yet; the team reads requests from the database.
        </p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            const f = Object.fromEntries(new FormData(e.currentTarget))
            setBusy(true)
            setError(null)
            try {
              await post('/contact', { name: f.name, email: f.email, sku_range: f.skus, message: f.message || null })
              setSent(true)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not send your request')
            } finally {
              setBusy(false)
            }
          }}
          className="space-y-4"
        >
          <Field label="Name">
            <input name="name" autoComplete="name" required minLength={2} className={fieldClass} />
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
          <Field label="Anything we should know? (optional)">
            <textarea name="message" rows={3} maxLength={1000} className={cn(fieldClass, 'h-auto py-2')} />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-flagged">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Sending…' : 'Request a demo'}
          </Button>
        </form>
      )}
    </AuthFrame>
  )
}

export function ForgotPassword() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ message: string; link?: string } | null>(null)
  return (
    <AuthFrame
      title="Reset your password"
      subtitle="Enter your work email and we will send a reset link."
      footer={
        <Link to="/login" className="text-primary underline underline-offset-2">
          Back to log in
        </Link>
      }
    >
      {done ? (
        <div role="status" className="space-y-3 rounded-lg border bg-pass/8 p-4 text-sm">
          <p>{done.message}</p>
          <p className="text-muted-foreground">Email delivery is not built in this prototype. The link is printed in the server log.</p>
          {done.link && (
            <p>
              Local demo shortcut:{' '}
              <Link to={done.link} className="font-medium text-primary underline underline-offset-2">
                open the reset link
              </Link>
            </p>
          )}
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            setError(null)
            try {
              const r = await post<{ message: string; reset_link?: string }>('/auth/forgot', { email: new FormData(e.currentTarget).get('email') })
              setDone({ message: r.message, link: r.reset_link })
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not send the link')
            } finally {
              setBusy(false)
            }
          }}
          className="space-y-4"
        >
          <Field label="Work email">
            <input name="email" type="email" autoComplete="email" required spellCheck={false} className={fieldClass} placeholder="you@company.com" />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-flagged">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
    </AuthFrame>
  )
}

export function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  return (
    <AuthFrame
      title="Choose a new password"
      subtitle="At least 8 characters."
      footer={
        <Link to="/forgot-password" className="text-primary underline underline-offset-2">
          Need a new link?
        </Link>
      }
    >
      {done ? (
        <div role="status" className="space-y-3 rounded-lg border bg-pass/8 p-4 text-sm">
          <p>Your password was changed.</p>
          <Button className="w-full" onClick={() => navigate('/login')}>
            Log in
          </Button>
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            setError(null)
            try {
              await post('/auth/reset', { token, password: new FormData(e.currentTarget).get('password') })
              setDone(true)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not change the password')
            } finally {
              setBusy(false)
            }
          }}
          className="space-y-4"
        >
          <Field label="New password">
            <PasswordInput autoComplete="new-password" minLength={8} />
          </Field>
          {!token && (
            <p role="alert" className="text-sm text-flagged">
              This page needs the link from your reset email.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-flagged">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy || !token}>
            {busy ? 'Saving…' : 'Change password'}
          </Button>
        </form>
      )}
    </AuthFrame>
  )
}
