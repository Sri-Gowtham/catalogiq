import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { get, getToken, post, setToken, setUnauthorizedHandler } from '@/api/http'
import type { Me, Role, TokenOut } from '@/api/types'

interface AuthValue {
  me: Me | null
  loading: boolean
  signIn: (out: TokenOut) => void
  signOut: () => void
  canWrite: boolean
  isAdmin: boolean
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const hasToken = !!getToken()
  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => get<Me>('/auth/me'), enabled: hasToken, retry: false, staleTime: 60_000 })

  const signOut = useCallback(() => {
    setToken(null)
    qc.clear()
    navigate('/login')
  }, [qc, navigate])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      qc.clear()
      navigate('/login', { replace: true })
    })
  }, [qc, navigate])

  const signIn = useCallback(
    (out: TokenOut) => {
      setToken(out.token)
      qc.clear()
      qc.setQueryData(['me'], out.me)
    },
    [qc],
  )

  const value = useMemo<AuthValue>(() => {
    const me = hasToken ? (meQuery.data ?? null) : null
    return {
      me,
      loading: hasToken && meQuery.isPending,
      signIn,
      signOut,
      canWrite: me?.role === 'admin' || me?.role === 'manager',
      isAdmin: me?.role === 'admin',
    }
  }, [hasToken, meQuery.data, meQuery.isPending, signIn, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}

export const startDemo = (role: Role = 'admin') => post<TokenOut>(`/auth/demo?role=${role}`)
