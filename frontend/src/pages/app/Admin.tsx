import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { del, get, patch, post } from '@/api/http'
import type { AuditLogRow, Member, Reports as ReportsData, Role } from '@/api/types'
import { DataTag } from '@/components/badges'
import { ErrorState, fieldClass, Kpi, Loading, PageHeader, Panel } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { formatDateTime, formatInr, formatNum } from '@/lib/format'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/utils'

export function Reports() {
  const { data, error, isPending } = useQuery({ queryKey: ['reports'], queryFn: () => get<ReportsData>('/reports/summary') })
  if (isPending) return <Loading className="h-[60vh]" />
  if (error) return <ErrorState error={error} />

  const exportCsv = () => {
    const rows = [['Category', 'Products', 'Average quality'], ...data.categories.map((c) => [c.category, String(c.products), String(c.avg_quality ?? '')])]
    const blob = new Blob([rows.map((r) => r.map((x) => `"${x.replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'catalogiq-categories.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <PageHeader
        title="Reports"
        description="Time saved and quality by category."
        actions={
          <Button variant="outline" onClick={exportCsv}>
            <Download className="size-4" /> Export CSV
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Products processed" value={formatNum(data.products_processed)} />
        <Kpi label="Stopped early by the audit" value={formatNum(data.flagged_early)} tone="flagged" />
        <Kpi label="Hours saved (estimate)" value={formatNum(data.hours_saved_estimate)} tone="pass" />
        <Kpi label="Cost saved (estimate)" value={formatInr(data.cost_saved_estimate)} tone="pass" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="How the estimate is made">
          <ul className="space-y-2 text-sm text-muted-foreground">
            {data.assumptions.map((a) => (
              <li key={a}>• {a}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Estimates, not measured results.</p>
        </Panel>
        <Panel title="Quality by category">
          <table className="data w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="pb-2 font-medium">Category</th>
                <th className="pb-2 text-right font-medium">Products</th>
                <th className="pb-2 text-right font-medium">Average quality</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.categories.map((c) => (
                <tr key={c.category}>
                  <td className="py-2">
                    <Link to={`/app/catalog?category=${encodeURIComponent(c.category)}`} className="hover:text-primary">
                      {c.category}
                    </Link>
                  </td>
                  <td className="py-2 text-right tabular-nums">{c.products}</td>
                  <td className="py-2 text-right tabular-nums">{c.avg_quality ?? 'n/a'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  )
}

export function Settings() {
  const { me, canWrite } = useAuth()
  const log = useQuery({ queryKey: ['audit-log'], queryFn: () => get<AuditLogRow[]>('/audit-log'), enabled: canWrite })
  if (!me) return null
  return (
    <>
      <PageHeader title="Settings" description="Workspace, team and change history." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Workspace">
          <dl className="divide-y text-sm">
            {[
              ['Name', me.workspace_name],
              ['Plan', `${me.plan[0].toUpperCase()}${me.plan.slice(1)} (mock billing)`],
              ['Your role', me.role],
              ['Data', me.is_demo ? 'Sample catalog (Demo data)' : 'Your own data'],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 py-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className={k === 'Your role' ? 'capitalize' : undefined}>{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <TeamPanel />
      </div>
      {canWrite && (
        <Panel className="mt-4" title="Audit log" tag={<DataTag kind="live" />}>
          {log.isPending ? (
            <Loading className="h-40" />
          ) : log.error ? (
            <ErrorState error={log.error} />
          ) : (
            <ul tabIndex={0} className="max-h-96 divide-y overflow-y-auto">
              {log.data.map((r) => (
                <li key={r.id} className="grid gap-1 py-2 text-sm sm:grid-cols-[10rem_1fr_10rem]">
                  <span className="text-xs text-muted-foreground">{formatDateTime(r.at)}</span>
                  <span>
                    <span className="font-medium">{r.action}</span>
                    {r.entity && <span className="text-muted-foreground"> · {r.entity}</span>}
                    {r.detail && <span className="block text-xs text-muted-foreground">{r.detail}</span>}
                  </span>
                  <span className="text-xs text-muted-foreground sm:text-right">{r.user ?? 'System'}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </>
  )
}

const ROLE_TEXT: Record<Role, string> = {
  admin: 'Everything, including platforms, rules and team',
  manager: 'Review, edit and publish products',
  viewer: 'Read-only dashboards and reports',
}

function TeamPanel() {
  const { me, isAdmin } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const team = useQuery({ queryKey: ['team'], queryFn: () => get<Member[]>('/team') })
  const [invited, setInvited] = useState<{ email: string; password: string } | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['team'] })
  const invite = useMutation({
    mutationFn: (body: { name: string; email: string; role: Role }) => post<{ temporary_password: string }>('/team', body),
    onSuccess: (r, v) => {
      setInvited({ email: v.email, password: r.temporary_password })
      refresh()
    },
  })
  const setRole = useMutation({
    mutationFn: ({ id, role }: { id: number; role: Role }) => patch(`/team/${id}`, { role }),
    onSuccess: () => {
      toast.show('Role updated')
      refresh()
    },
  })
  const remove = useMutation({
    mutationFn: (id: number) => del(`/team/${id}`),
    onSuccess: () => {
      toast.show('Teammate removed')
      refresh()
    },
  })
  const error = invite.error ?? setRole.error ?? remove.error

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>
    invite.mutate({ name: f.name, email: f.email, role: f.role as Role }, { onSuccess: () => form.reset() })
  }

  return (
    <Panel title="Team" tag={team.data && <span className="text-xs text-muted-foreground">{team.data.length}</span>}>
      {team.isPending ? (
        <Loading className="h-32" />
      ) : team.error ? (
        <ErrorState error={team.error} />
      ) : (
        <ul className="divide-y">
          {team.data.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {m.name.split(' ').map((x) => x[0]).join('').slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {m.name} {m.id === me?.user_id && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
              </span>
              {isAdmin && m.id !== me?.user_id ? (
                <>
                  <select
                    aria-label={`Role for ${m.name}`}
                    value={m.role}
                    onChange={(e) => setRole.mutate({ id: m.id, role: e.target.value as Role })}
                    className={cn(fieldClass, 'h-8 w-28 capitalize')}
                  >
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button type="button" aria-label={`Remove ${m.name}`} onClick={() => window.confirm(`Remove ${m.name} from this workspace?`) && remove.mutate(m.id)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-flagged">
                    <Trash2 className="size-4" />
                  </button>
                </>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">{m.role}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-flagged">{error.message}</p>}
      {isAdmin && (
        <form onSubmit={submit} className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-[1fr_1fr_7rem_auto]">
          <input name="name" required minLength={2} placeholder="Name" aria-label="Name" className={fieldClass} />
          <input name="email" type="email" required placeholder="Email" aria-label="Email" spellCheck={false} className={fieldClass} />
          <select name="role" aria-label="Role" defaultValue="manager" className={fieldClass}>
            <option value="manager">Manager</option>
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>
          <Button type="submit" className="h-9" disabled={invite.isPending}>
            Invite
          </Button>
        </form>
      )}
      {invited && (
        <p role="status" className="mt-3 rounded-lg bg-pass/8 p-3 text-xs">
          {invited.email} can sign in with <span className="font-mono font-medium">{invited.password}</span>. Email delivery is not built yet, so share it directly.
        </p>
      )}
      <dl className="mt-4 grid gap-1.5 border-t pt-4 text-xs">
        {(Object.keys(ROLE_TEXT) as Role[]).map((r) => (
          <div key={r} className="flex gap-2">
            <dt className="w-16 font-medium capitalize">{r}</dt>
            <dd className="text-muted-foreground">{ROLE_TEXT[r]}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  )
}
