import { useSession } from '@/lib/auth-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function DashboardPage() {
  const { data: session, isPending } = useSession()

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  const user = session?.user

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        {user && (
          <Badge variant="outline">
            {user.emailVerified ? 'Verified' : 'Unverified'}
          </Badge>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Welcome{user?.name ? `, ${user.name}` : ''} 👋</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Signed in as{' '}
            <span className="font-medium text-foreground">{user?.email}</span>.
          </p>
          <p className="mt-2">
            This is a protected route — add your finance logging UI here.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
