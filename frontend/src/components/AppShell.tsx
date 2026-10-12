import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart3,
  Bell,
  Bot,
  BookCheck,
  Boxes,
  ClipboardCheck,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Search,
  Send,
  Settings,
  Store,
  X,
} from 'lucide-react'
import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { get, post } from '@/api/http'
import type { Notification, Overview, Role } from '@/api/types'
import { Loading, Logo } from '@/components/kit'
import { startDemo, useAuth } from '@/lib/auth'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

const STAFF: Role[] = ['admin', 'manager']

/** Which roles see each page. Viewers get the read-only business view; managers run the catalog; admins also control set-up. */
export const NAV: { label: string; items: { to: string; label: string; icon: typeof Package; end?: boolean; badge?: 'review'; roles?: Role[] }[] }[] = [
  {
    label: 'Catalog',
    items: [
      { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/app/catalog', label: 'Products', icon: Package },
      { to: '/app/batches', label: 'Batches', icon: Boxes, roles: STAFF },
      { to: '/app/review', label: 'Review queue', icon: ClipboardCheck, badge: 'review', roles: STAFF },
    ],
  },
  {
    label: 'Channels',
    items: [
      { to: '/app/platforms', label: 'Platforms', icon: Store },
      { to: '/app/publishing', label: 'Publishing', icon: Send, roles: STAFF },
      { to: '/app/performance', label: 'Performance', icon: BarChart3 },
    ],
  },
  {
    label: 'Control',
    items: [
      { to: '/app/rules', label: 'Brand rulebook', icon: BookCheck, roles: STAFF },
      { to: '/app/workbench', label: 'Agent workbench', icon: Bot, roles: STAFF },
      { to: '/app/reports', label: 'Reports', icon: FileBarChart },
      { to: '/app/settings', label: 'Settings', icon: Settings },
    ],
  },
]

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { me } = useAuth()
  const { data } = useQuery({ queryKey: ['overview'], queryFn: () => get<Overview>('/overview'), staleTime: 30_000 })
  const pending = data?.attention.find((a) => a.kind === 'review')?.text.match(/\d+/)?.[0]
  return (
    <nav aria-label="Main" className="flex flex-col gap-5 px-3 py-4">
      {NAV.map((group) => ({ ...group, items: group.items.filter((i) => !i.roles || (me && i.roles.includes(me.role))) }))
        .filter((g) => g.items.length > 0)
        .map((group) => (
        <div key={group.label}>
          <p className="px-2 pb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground/80 uppercase">{group.label}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors',
                      isActive ? 'bg-primary/8 font-medium text-primary' : 'text-foreground/75 hover:bg-muted hover:text-foreground',
                    )
                  }
                >
                  <item.icon className="size-4 shrink-0" aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && pending && (
                    <span className="rounded-full bg-flagged/12 px-1.5 text-[11px] font-semibold text-flagged tabular-nums">{pending}</span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function useClickAway(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return ref
}

function Notifications() {
  const [open, setOpen] = useState(false)
  const ref = useClickAway(open, () => setOpen(false))
  const qc = useQueryClient()
  const { data = [] } = useQuery({ queryKey: ['notifications'], queryFn: () => get<Notification[]>('/notifications'), refetchInterval: 30_000 })
  const markRead = useMutation({ mutationFn: () => post('/notifications/read'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) })
  const unread = data.filter((n) => !n.read).length
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Bell className="size-4" />
        {unread > 0 && <span className="absolute top-2 right-2 size-2 rounded-full bg-flagged" />}
      </button>
      {open && (
        <div className="surface absolute right-0 z-40 mt-2 w-80 overflow-hidden p-0">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={() => markRead.mutate()} className="text-xs font-medium text-primary hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {data.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">You are all caught up.</li>}
            {data.map((n) => (
              <li key={n.id} className={cn('border-b px-4 py-3 text-sm last:border-0', !n.read && 'bg-primary/4')}>
                <p>{n.text}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(n.created_at)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function UserMenu() {
  const { me, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useClickAway(open, () => setOpen(false))
  if (!me) return null
  const initials = me.name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-muted"
      >
        <span className="grid size-7 place-items-center rounded-full bg-primary/12 text-xs font-semibold text-primary">{initials}</span>
        <span className="hidden text-left text-sm leading-tight sm:block">
          <span className="block font-medium">{me.name}</span>
          <span className="block text-xs text-muted-foreground capitalize">{me.role}</span>
        </span>
      </button>
      {open && (
        <div className="surface absolute right-0 z-40 mt-2 w-60 p-1.5">
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium">{me.email}</p>
            <p className="truncate text-xs text-muted-foreground">{me.workspace_name}</p>
          </div>
          <Link to="/app/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-muted">
            <Settings className="size-4" /> Settings
          </Link>
          <button type="button" onClick={signOut} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-muted">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

const ROLE_INFO: Record<Role, string> = {
  admin: 'Full control: platforms, rules, team and publishing',
  manager: 'Runs the catalog: reviews, edits and publishes',
  viewer: 'Read-only: dashboards, products and performance',
}

/** Demo only: jump between the three demo users to see what each role gets. */
function RoleSwitcher() {
  const { me, signIn } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState<Role | null>(null)
  if (!me?.is_demo) return null
  return (
    <div role="radiogroup" aria-label="View the demo as" className="hidden items-center gap-1 rounded-lg border bg-card p-0.5 md:flex">
      <span className="px-2 text-xs text-muted-foreground">View as</span>
      {(['admin', 'manager', 'viewer'] as Role[]).map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={me.role === r}
          title={ROLE_INFO[r]}
          disabled={busy !== null}
          onClick={async () => {
            if (me.role === r) return
            setBusy(r)
            try {
              signIn(await startDemo(r))
              navigate('/app')
            } finally {
              setBusy(null)
            }
          }}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors',
            me.role === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {busy === r ? '…' : r}
        </button>
      ))}
    </div>
  )
}

function NoAccess() {
  const { me } = useAuth()
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <p className="text-sm font-medium text-muted-foreground">Restricted</p>
      <h1 className="mt-2 text-xl font-semibold">This page is for managers and admins</h1>
      <p className="mt-2 text-sm text-muted-foreground">You are signed in as a {me?.role}. {me && ROLE_INFO[me.role]}.</p>
      <Link to="/app" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">
        Back to overview
      </Link>
    </div>
  )
}

function GlobalSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    navigate(q.trim() ? `/app/catalog?q=${encodeURIComponent(q.trim())}` : '/app/catalog')
  }
  return (
    <form role="search" onSubmit={submit} className="relative hidden w-full max-w-sm md:block">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        type="search"
        name="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search products by name or SKU…"
        aria-label="Search products"
        autoComplete="off"
        className="h-9 w-full rounded-lg border border-input bg-card pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
      />
    </form>
  )
}

export function AppShell() {
  const { me, loading } = useAuth()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  if (loading) return <Loading className="m-8 h-[60vh] w-auto" />
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (!me.onboarded) return <Navigate to="/onboarding" replace />
  const item = NAV.flatMap((g) => g.items).find((i) => i.to !== '/app' && location.pathname.startsWith(i.to))
  const allowed = !item?.roles || item.roles.includes(me.role)

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-primary focus-visible:px-3 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-primary-foreground"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-screen flex-col border-r bg-card/60 lg:flex">
        <div className="flex h-14 items-center border-b px-5">
          <Link to="/app">
            <Logo />
          </Link>
        </div>
        <div className="border-b px-5 py-3">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Workspace</p>
          <p className="truncate text-sm font-medium">{me.workspace_name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground capitalize">{me.role}</span> access
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <Sidebar />
        </div>
        {me.role !== 'viewer' && <WorkbenchStatus />}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-foreground/30" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-card shadow-xl">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <Logo />
              <button type="button" aria-label="Close menu" onClick={() => setMobileOpen(false)} className="grid size-9 place-items-center rounded-lg hover:bg-muted">
                <X className="size-4" />
              </button>
            </div>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="min-w-0">
        {me.is_demo && (
          <div className="border-b bg-[oklch(0.97_0.03_75)] px-5 py-1.5 text-center text-xs text-[oklch(0.42_0.1_65)]">
            <strong className="font-semibold">Demo workspace</strong> · sales and rankings are sample data
          </div>
        )}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
          <button type="button" aria-label="Open menu" onClick={() => setMobileOpen(true)} className="grid size-9 place-items-center rounded-lg hover:bg-muted lg:hidden">
            <Menu className="size-4" />
          </button>
          <Link to="/app" className="lg:hidden">
            <Logo />
          </Link>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-2">
            <RoleSwitcher />
            <Notifications />
            <UserMenu />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-6 outline-none sm:px-6 lg:py-8">
          <Suspense fallback={<Loading className="h-[60vh]" />}>
            {allowed ? <Outlet /> : <NoAccess />}
          </Suspense>
        </main>
      </div>
    </div>
  )
}

function WorkbenchStatus() {
  const { data } = useQuery({
    queryKey: ['workbench'],
    queryFn: () => get<{ connection: { name: string; status: string } }>('/workbench'),
    staleTime: 60_000,
  })
  const ok = data?.connection.status === 'connected'
  return (
    <Link to="/app/workbench" className="m-3 flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 text-xs hover:bg-muted">
      <span className={cn('size-2 rounded-full', ok ? 'bg-pass' : 'bg-muted-foreground/40')} aria-hidden />
      <span className="min-w-0">
        <span className="block font-medium">Agent workbench</span>
        <span className="block truncate text-muted-foreground">{data ? `${data.connection.name} · ${data.connection.status}` : 'Checking…'}</span>
      </span>
    </Link>
  )
}
