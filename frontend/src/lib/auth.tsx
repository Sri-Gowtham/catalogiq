import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { get, post, setUnauthorizedHandler } from '@/api/http'
import type { Me, Role, TokenOut } from '@/api/types'

interface AuthValue {
  me: Me | null
  loading: boolean
  /** Called after a successful login or signup; the server has already set the session cookie. */
  signIn: (out: TokenOut) => void
  signOut: () => void
  canWrite: boolean
  isAdmin: boolean
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  // /auth/session always answers 200 (null when signed out), so this check never shows up as a failed request
  const session = useQuery({ queryKey: ['me'], queryFn: () => get<Me | null>('/auth/session'), retry: false, staleTime: 60_000 })

  const signOut = useCallback(() => {
    void post('/auth/logout').finally(() => {
      qc.clear()
      qc.setQueryData(['me'], null)
      navigate('/login')
    })
  }, [qc, navigate])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      qc.clear()
      qc.setQueryData(['me'], null)
      navigate('/login', { replace: true })
    })
  }, [qc, navigate])

  const signIn = useCallback(
    (out: TokenOut) => {
      qc.clear()
      qc.setQueryData(['me'], out.me)
    },
    [qc],
  )

  const value = useMemo<AuthValue>(() => {
    const me = session.data ?? null
    return {
      me,
      loading: session.isPending,
      signIn,
      signOut,
      canWrite: me?.role === 'admin' || me?.role === 'manager',
      isAdmin: me?.role === 'admin',
    }
  }, [session.data, session.isPending, signIn, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}

export const startDemo = (role: Role = 'admin') => post<TokenOut>(`/auth/demo?role=${role}`)
