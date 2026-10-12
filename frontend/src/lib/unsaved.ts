import { useEffect } from 'react'

let dirty = false

/** True while an editor holds changes that were not saved. */
export const hasUnsaved = () => dirty

/** Asks before discarding unsaved changes; returns true when it is fine to carry on. */
export function confirmDiscard(): boolean {
  if (!dirty) return true
  const ok = window.confirm('You have unsaved changes. Discard them?')
  if (ok) dirty = false
  return ok
}

/**
 * Marks the page as holding unsaved changes. While marked, closing the tab asks first, and so does clicking
 * any in-app link (caught before the router acts on it).
 */
export function useUnsavedChanges(isDirty: boolean) {
  useEffect(() => {
    dirty = isDirty
    if (!isDirty) return
    const beforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.('a[href]')
      if (link && !confirmDiscard()) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', onClick, true)
      dirty = false
    }
  }, [isDirty])
}
