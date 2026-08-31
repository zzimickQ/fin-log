import { Link, NavLink, Outlet } from 'react-router-dom'
import { useSession, signOut } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/toaster'
import { LogOut, Wallet } from 'lucide-react'

export function AppShell() {
  const { data: session, isPending } = useSession()

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium transition-colors hover:text-foreground ${
      isActive ? 'text-foreground' : 'text-muted-foreground'
    }`

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Wallet className="size-5" />
            Fin Log
          </Link>
          <nav className="flex items-center gap-4">
            <NavLink to="/" className={navLinkClass} end>
              Home
            </NavLink>
            {!isPending && session && (
              <NavLink to="/admin/dashboard" className={navLinkClass}>
                Admin
              </NavLink>
            )}
            {!isPending &&
              (session ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => signOut({ callbackURL: '/' })}
                >
                  <LogOut className="size-4" />
                  Sign out
                </Button>
              ) : (
                <Button asChild size="sm">
                  <Link to="/sign-in">Sign in</Link>
                </Button>
              ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <Toaster />
    </div>
  )
}
