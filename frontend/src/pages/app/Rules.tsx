import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { del, get, post } from '@/api/http'
import type { Rule, RuleFinding } from '@/api/types'
import { DataTag } from '@/components/badges'
import { ErrorState, Field, fieldClass, Loading, PageHeader, Panel } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/toast'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'


/* ================================================================== rulebook */
const KIND_LABEL: Record<Rule['kind'], string> = {
  restricted_claim: 'Restricted claim',
  mandatory_claim: 'Mandatory claim',
  trademark: 'Trademark',
  allergen_format: 'Allergen format',
}
const REGION_LABEL = { ALL: 'All regions', IN: 'India', AE: 'UAE', US: 'United States' }

export function Rules() {
  const { isAdmin } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const { data, error, isPending } = useQuery({ queryKey: ['rules'], queryFn: () => get<Rule[]>('/rules') })
  const [text, setText] = useState('Acme Dark Chocolate is a sugar free superfood that helps cure fatigue. Made with real cocoa.')
  const [region, setRegion] = useState<Rule['region']>('IN')
  const check = useMutation({ mutationFn: () => post<{ passed: boolean; findings: RuleFinding[]; rules_checked: number }>('/rules/test', { text, region }) })
  const add = useMutation({
    mutationFn: (body: Partial<Rule>) => post('/rules', body),
    onSuccess: () => {
      toast.show('Rule added')
      qc.invalidateQueries({ queryKey: ['rules'] })
    },
  })
  const remove = useMutation({
    mutationFn: (id: number) => del(`/rules/${id}`),
    onSuccess: () => {
      toast.show('Rule deleted')
      qc.invalidateQueries({ queryKey: ['rules'] })
    },
  })

  const submitRule = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>
    add.mutate({ region: f.region as Rule['region'], kind: f.kind as Rule['kind'], value: f.value, note: f.note || null }, { onSuccess: () => form.reset() })
  }

  const marked = () => {
    const findings = check.data?.findings ?? []
    const out: React.ReactNode[] = []
    let at = 0
    findings.forEach((f, i) => {
      if (f.start < at) return
      out.push(text.slice(at, f.start))
      out.push(
        <mark key={i} title={f.message} className={cn('rounded px-0.5', f.severity === 'high' ? 'bg-flagged/20' : 'bg-review/25')}>
          {text.slice(f.start, f.end)}
        </mark>,
      )
      at = f.end
    })
    out.push(text.slice(at))
    return out
  }

  return (
    <>
      <PageHeader title="Brand rulebook" description="Claims and trademark rules, by region." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Test a sentence" tag={<DataTag kind="live" />}>
          <Field label="Copy to check">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className={cn(fieldClass, 'h-auto py-2')} />
          </Field>
          <div className="mt-3 flex items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Region</span>
              <select value={region} onChange={(e) => setRegion(e.target.value as Rule['region'])} className={cn(fieldClass, 'w-44')}>
                {Object.entries(REGION_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <Button onClick={() => check.mutate()} disabled={!text.trim() || check.isPending}>
              {check.isPending ? 'Checking…' : 'Check'}
            </Button>
          </div>
          {check.data && (
            <div className="mt-4" aria-live="polite">
              <p className={cn('text-sm font-medium', check.data.passed ? 'text-pass' : 'text-flagged')}>
                {check.data.passed ? 'Passes' : 'Blocked'} · {check.data.findings.length} finding(s) against {check.data.rules_checked} rules
              </p>
              <p className="mt-2 rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed">{marked()}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {check.data.findings.map((f, i) => (
                  <li key={i} className="flex gap-2">
                    <span className={f.severity === 'high' ? 'text-flagged' : 'text-warn'}>●</span>“{f.match}”: {f.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel title="Rules" tag={data && <span className="text-xs text-muted-foreground">{data.length}</span>}>
          {isPending ? (
            <Loading className="h-60" />
          ) : error ? (
            <ErrorState error={error} />
          ) : (
            <ul tabIndex={0} className="max-h-96 divide-y overflow-y-auto">
              {data.map((r) => (
                <li key={r.id} className="flex items-start gap-3 py-2 text-sm">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">{REGION_LABEL[r.region]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{r.value}</span>
                    <span className="block text-xs text-muted-foreground">
                      {KIND_LABEL[r.kind]}
                      {r.note && ` · ${r.note}`}
                    </span>
                  </span>
                  {isAdmin && (
                    <button type="button" aria-label={`Delete rule ${r.value}`} onClick={() => window.confirm(`Delete the rule "${r.value}"?`) && remove.mutate(r.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-flagged">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {isAdmin && (
            <form onSubmit={submitRule} className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-2">
              <select name="kind" className={fieldClass} aria-label="Rule type" defaultValue="restricted_claim">
                {Object.entries(KIND_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select name="region" className={fieldClass} aria-label="Region" defaultValue="ALL">
                {Object.entries(REGION_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <input name="value" required minLength={2} placeholder="Word or phrase, e.g. immunity booster" className={fieldClass} aria-label="Word or phrase" />
              <input name="note" placeholder="Why (optional)" className={fieldClass} aria-label="Reason" />
              <Button type="submit" className="sm:col-span-2" disabled={add.isPending}>
                Add rule
              </Button>
              {add.error && <p className="text-sm text-flagged sm:col-span-2">{add.error.message}</p>}
            </form>
          )}
        </Panel>
      </div>
    </>
  )
}
