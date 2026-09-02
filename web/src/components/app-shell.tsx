import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '@/lib/auth-client'
import { useSyncActiveLedger } from '@/lib/active-ledger'
import { useMyLedgersQuery } from '@/lib/queries'
import { Button } from '@/components/ui/button'
import { LedgerSwitcher } from '@/components/ledger-switcher'
import { Toaster } from '@/components/toaster'
import { UserMenu } from '@/components/user-menu'
import { ChartColumnBig, Home, Settings, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'

const mainNav = [
  { to: '/', label: 'Today', icon: Home, end: true },
  { to: '/analytics', label: 'Analytics', icon: ChartColumnBig, end: false },
  { to: '/admin/dashboard', label: 'Admin', icon: Settings, end: false },
]

export function AppShell() {
  const { data: session, isPending } = useSession()
  const signedIn = !isPending && Boolean(session)
  const location = useLocation()

  // The active-ledger switcher only makes sense for the capture flows —
  // hide it inside the admin area, where ledgers are managed, not "current".
  const inAdmin = location.pathname.startsWith('/admin')
  const showLedgerSwitcher = signedIn && !inAdmin

  // Load the switcher data and keep the active ledger valid only when
  // signed in (public pages don't need it).
  useMyLedgersQuery(signedIn)
  useSyncActiveLedger(signedIn)

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors hover:text-foreground',
      isActive
        ? 'text-foreground'
        : 'text-muted-foreground hover:bg-muted/60',
    )

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-2 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Wallet className="size-5" />
            <span className="hidden min-[420px]:inline">Fin Log</span>
          </Link>

          {showLedgerSwitcher && <LedgerSwitcher className="hidden sm:flex" />}

          <nav className="flex items-center gap-1">
            {!isPending && (
              <>
                {signedIn ? (
                  <>
                    <div className="hidden items-center gap-1 sm:flex">
                      <NavLink
                        to="/"
                        className={navLinkClass}
                        end
                        title="Today"
                      >
                        <Home className="size-4" />
                        <span className="hidden md:inline">Today</span>
                      </NavLink>
                      <NavLink
                        to="/analytics"
                        className={navLinkClass}
                        title="Analytics"
                      >
                        <ChartColumnBig className="size-4" />
                        <span className="hidden md:inline">Analytics</span>
                      </NavLink>
                    </div>
                    <UserMenu />
                  </>
                ) : (
                  <>
                    <NavLink to="/" className={navLinkClass} end title="Home">
                      <Home className="size-4" />
                      <span className="hidden md:inline">Home</span>
                    </NavLink>
                    <Button asChild size="sm">
                      <Link to="/sign-in">Sign in</Link>
                    </Button>
                  </>
                )}
              </>
            )}
          </nav>
        </div>

        {/* Mobile: ledger switcher sits on its own row under the brand row. */}
        {showLedgerSwitcher && (
          <div className="border-t px-4 py-1.5 sm:hidden">
            <LedgerSwitcher className="max-w-none" />
          </div>
        )}
      </header>

      <main
        className={cn(
          'mx-auto w-full max-w-5xl flex-1 px-4 py-6',
          signedIn && 'pb-24 md:pb-8',
        )}
      >
        <Outlet />
      </main>

      {/* Mobile bottom nav (main entry points for the capture flows).
          `pb-[env(safe-area-inset-bottom)]` keeps the buttons above the
          home indicator / gesture bar when installed as a PWA
          (standalone mode; index.html sets viewport-fit=cover). */}
      {signedIn && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          <div className="mx-auto grid max-w-md grid-cols-3">
            {mainNav.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.68rem] font-medium transition-colors',
                    isActive
                      ? 'text-foreground'
                      : 'text-muted-foreground active:text-foreground',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className="size-6"
                      strokeWidth={isActive ? 2.2 : 1.8}
                    />
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}

      <Toaster />
    </div>
  )
}
