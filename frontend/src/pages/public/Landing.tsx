import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ArrowRight, Check, CircleAlert, FileSpreadsheet, Store, TrendingDown } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { startDemo, useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

gsap.registerPlugin(useGSAP)

function DemoButton({ className, label = 'View demo' }: { className?: string; label?: string }) {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="inline-flex flex-col">
      <Button
        size="lg"
        variant="outline"
        className={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            signIn(await startDemo())
            navigate('/app')
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not open the demo')
            setBusy(false)
          }
        }}
      >
        {busy ? 'Opening…' : label}
      </Button>
      {error && (
        <span role="alert" className="mt-2 text-xs text-flagged">
          {error}
        </span>
      )}
    </span>
  )
}

const PAINS = [
  { icon: FileSpreadsheet, title: 'Messy supplier data', text: 'Feeds arrive with missing weights, mixed units and vague categories.' },
  { icon: Store, title: 'Every platform wants it differently', text: 'Title limits, bullet rules, image rules and languages change per marketplace.' },
  { icon: CircleAlert, title: 'Errors reach the shelf', text: 'Wrong allergens or restricted claims get published and listings get suppressed.' },
  { icon: TrendingDown, title: 'Nobody watches what happens next', text: 'A listing slips in rank and the team finds out weeks later from the sales report.' },
]

const STEPS = [
  { n: '01', title: 'Ingest and audit', text: 'Every supplier record is scored before any AI runs. Bad data is flagged, not enriched.' },
  { n: '02', title: 'Enrich per platform', text: 'One clean record becomes content shaped for each marketplace and your brand rules.' },
  { n: '03', title: 'Gate and publish', text: 'Every listing is scored out of 100. Only 70 and above goes live.' },
  { n: '04', title: 'Watch and fix', text: 'Rank and sales are tracked per listing, with a fix proposed when one slips.' },
]

const PLATFORMS = ['Amazon India', 'Flipkart', 'Noon (UAE)', 'Blinkit', 'Your brand website']

const PLANS = [
  { name: 'Starter', price: '₹14,999', unit: '/month', text: 'For brands with up to 500 products.', items: ['2 platforms', 'Data audit and quality gate', 'Review queue', 'Email support'] },
  {
    name: 'Growth',
    price: '₹39,999',
    unit: '/month',
    text: 'For growing catalogs selling everywhere.',
    items: ['Up to 5,000 products', 'All supported platforms', 'Performance tracking and A/B tests', 'Brand rulebook by region', 'Roles for your team'],
    featured: true,
  },
  { name: 'Enterprise', price: 'Custom', unit: '', text: 'For large FMCG portfolios.', items: ['Unlimited products', 'Your own agent workbench', 'Single sign-on', 'Dedicated onboarding'] },
]

const FAQ = [
  {
    q: 'Is this a CRM?',
    a: 'No. A CRM tracks customers and deals. CatalogIQ tracks products: their data quality, the content on each platform, and how each listing ranks and sells.',
  },
  {
    q: 'What is the agent workbench?',
    a: 'The AI agents run on a separate workbench. CatalogIQ connects to it, sends feeds for processing and shows each run live. You can swap the workbench without changing how your team works.',
  },
  {
    q: 'What is real in this prototype?',
    a: 'Feed ingestion and the data audit run for real. The other agents are marked Simulated, and rankings, clicks and sales in the demo are seeded sample data, labelled Demo data on every screen.',
  },
  { q: 'Do you publish to marketplaces directly?', a: 'Not yet. Publishing in this prototype is simulated; no marketplace API is called.' },
  { q: 'Are the prices final?', a: 'No. They are indicative prices for discussion while the product is being validated.' },
]

function Screen({ src, alt, dark }: { src: string; alt: string; dark?: boolean }) {
  return (
    <figure className={cn('overflow-hidden rounded-2xl border p-1.5 shadow-[0_24px_60px_-20px_rgb(0_40_90/0.35)]', dark ? 'border-white/15 bg-white/5' : 'bg-card')}>
      <img src={src} alt={alt} width={1440} height={900} className="block w-full rounded-xl" loading="lazy" />
    </figure>
  )
}

export function Landing() {
  const root = useRef<HTMLDivElement>(null)
  const { me } = useAuth()

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.reveal', { y: 16, opacity: 0, duration: 0.6, stagger: 0.08, ease: 'power2.out' })
              })
      return () => mm.revert()
    },
    { scope: root },
  )

  return (
    <div ref={root} className="min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-primary focus-visible:px-3 focus-visible:py-2 focus-visible:text-sm focus-visible:text-primary-foreground"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Link to="/">
            <Logo />
          </Link>
          <nav aria-label="Site" className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#platforms" className="hover:text-foreground">Platforms</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            {me ? (
              <Button nativeButton={false} render={<Link to="/app" />}>Open app</Button>
            ) : (
              <>
                <Button variant="ghost" nativeButton={false} render={<Link to="/login" />}>
                  Log in
                </Button>
                <Button nativeButton={false} render={<Link to="/signup" />}>Start free</Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="outline-none">
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 pt-14 pb-20 lg:grid-cols-[1fr_1.1fr] lg:pt-20">
          <div>
            <h1 className="reveal text-4xl font-semibold tracking-tight sm:text-5xl lg:leading-[1.08]">Every product, ready for every shelf.</h1>
            <p className="reveal mt-5 max-w-lg text-lg text-muted-foreground">
              Audit supplier data, shape content for each marketplace, block weak listings, then track rank and sales.
            </p>
            <div className="reveal mt-8 flex flex-wrap items-start gap-3">
              <Button size="lg" nativeButton={false} render={<Link to="/signup" />}>
                Start free <ArrowRight className="size-4" />
              </Button>
              <DemoButton />
            </div>
          </div>
          <div className="reveal">
            <Screen src="/screens/overview.png" alt="CatalogIQ overview dashboard with product counts, sales trend and items needing attention" />
          </div>
        </section>

        <section className="border-y bg-card/60">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 lg:grid-cols-[1fr_1.3fr]">
            <h2 className="max-w-md text-2xl font-semibold tracking-tight sm:text-3xl">Five platforms means five versions of every product.</h2>
            <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {PAINS.map((p) => (
                <li key={p.title} className="flex gap-3">
                  <p.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                  <div>
                    <h3 className="font-semibold">{p.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{p.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
          <ol className="mt-10 grid gap-8 border-t pt-8 md:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n}>
                <span className="font-mono text-sm text-primary">{s.n}</span>
                <h3 className="mt-2 font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-[oklch(0.25_0.04_255)] text-white">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-20 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">One record. A listing shaped for each shelf.</h2>
              <p className="mt-4 text-white/70">Compare titles, bullets, attributes and image checks for every platform side by side.</p>
              <ul className="mt-6 space-y-2 text-sm text-white/80">
                {['Character limits per platform', 'Missing mandatory fields', 'Image rules per marketplace'].map((t) => (
                  <li key={t} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-[oklch(0.8_0.12_155)]" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <Screen src="/screens/compare.png" alt="Product page comparing listing content across Amazon India, Flipkart, Noon, Blinkit and the brand website" dark />
          </div>
        </section>

        <section id="platforms" className="scroll-mt-20 border-y bg-card/60">
          <div className="mx-auto max-w-6xl px-5 py-16 text-center">
            <h2 className="text-xl font-semibold tracking-tight">Built for the platforms you sell on</h2>
            <ul className="mt-8 flex flex-wrap justify-center gap-3">
              {PLATFORMS.map((p) => (
                <li key={p} className="rounded-full border bg-card px-4 py-2 text-sm font-medium">
                  {p}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-xs text-muted-foreground">Not affiliated with these platforms.</p>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Pricing</h2>
          <p className="mt-3 text-muted-foreground">Indicative prices in Indian rupees, excluding GST.</p>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <div key={plan.name} className={cn('surface flex flex-col p-6', plan.featured && 'ring-2 ring-primary')}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{plan.name}</h3>
                  {plan.featured && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Most chosen</span>}
                </div>
                <p className="mt-4">
                  <span className="text-3xl font-semibold tracking-tight tabular-nums">{plan.price}</span>
                  <span className="text-sm text-muted-foreground">{plan.unit}</span>
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{plan.text}</p>
                <ul className="mt-6 flex-1 space-y-2 text-sm">
                  {plan.items.map((i) => (
                    <li key={i} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-pass" aria-hidden /> {i}
                    </li>
                  ))}
                </ul>
                <Button className="mt-6" variant={plan.featured ? 'default' : 'outline'} nativeButton={false} render={<Link to={plan.name === 'Enterprise' ? '/contact' : '/signup'} />}>
                  {plan.name === 'Enterprise' ? 'Talk to us' : 'Start free'}
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section id="faq" className="scroll-mt-20 border-t bg-card/60">
          <div className="mx-auto max-w-3xl px-5 py-20">
            <h2 className="text-2xl font-semibold tracking-tight">Questions</h2>
            <div className="mt-8 divide-y rounded-xl border bg-card">
              {FAQ.map((f) => (
                <details key={f.q} className="group px-5 py-4">
                  <summary className="cursor-pointer list-none font-medium marker:hidden">
                    <span className="flex items-center justify-between gap-4">
                      {f.q}
                      <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
                    </span>
                  </summary>
                  <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">See your catalog the way shoppers do.</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" nativeButton={false} render={<Link to="/signup" />}>
              Start free
            </Button>
            <DemoButton />
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-muted-foreground">
          <Logo className="text-sm text-foreground" />
          <p>Academic prototype · SNS College of Technology · UC-49</p>
        </div>
      </footer>
    </div>
  )
}
