import { Link } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function NotFoundPage() {
  return (
    <main id="main" className="mx-auto max-w-xl px-5 py-24">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">That page does not exist</h1>
      <Link to="/" className={cn(buttonVariants({ variant: 'outline' }), 'mt-6')}>
        Back to home
      </Link>
    </main>
  )
}
