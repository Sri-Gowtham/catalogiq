import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const TITLES: [string, string][] = [
  ['/app/catalog', 'Products'],
  ['/app/products', 'Product'],
  ['/app/batches', 'Batches'],
  ['/app/review', 'Review queue'],
  ['/app/platforms', 'Platforms'],
  ['/app/publishing', 'Publishing'],
  ['/app/performance', 'Performance'],
  ['/app/rules', 'Brand rulebook'],
  ['/app/workbench', 'Agent workbench'],
  ['/app/reports', 'Reports'],
  ['/app/settings', 'Settings'],
  ['/app', 'Overview'],
  ['/login', 'Log in'],
  ['/signup', 'Create your workspace'],
  ['/contact', 'Talk to us'],
  ['/onboarding', 'Set up your workspace'],
]

/** Sets the browser tab title from the route; detail pages call `useTitle` to name the record. */
export function useRouteTitle() {
  const { pathname } = useLocation()
  useEffect(() => {
    const hit = TITLES.find(([p]) => pathname === p || pathname.startsWith(`${p}/`))
    document.title = hit ? `${hit[1]} | CatalogIQ` : 'CatalogIQ: catalog operations for FMCG and retail'
  }, [pathname])
}

export function useTitle(title: string | null | undefined) {
  useEffect(() => {
    if (title) document.title = `${title} | CatalogIQ`
  }, [title])
}
