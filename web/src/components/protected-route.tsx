import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '@/lib/auth-client'

/**
 * Route guard: redirects unauthenticated users to /sign-in.
 * Optionally requires email verification via `requireVerified`.
 */
export function ProtectedRoute({
  requireVerified = false,
}: {
  requireVerified?: boolean
}) {
  const { data: session, isPending } = useSession()
  const location = useLocation()

  if (isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        Checking session…
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/sign-in" replace state={{ from: location }} />
  }

  if (requireVerified && session.user.emailVerified === false) {
    return <Navigate to="/verify-email" replace state={{ from: location }} />
  }

  return <Outlet />
}
