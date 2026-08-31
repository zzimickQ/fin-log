import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { useFamilyQuery } from '@/lib/queries'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Users, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'

const roleLabel: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
}

export function FamilyLayout() {
  const { familyId } = useParams<{ familyId: string }>()
  const { data: family, error, isPending } = useFamilyQuery(familyId ?? null)

  if (!familyId) return null

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading family…</p>
  }
  if (error || !family) {
    return (
      <Card className="p-6">
        <p className="text-sm text-destructive">{error?.message ?? 'Family not found'}</p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link to="/admin/dashboard">Back to dashboard</Link>
        </Button>
      </Card>
    )
  }

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'text-sm font-medium transition-colors hover:text-foreground',
      isActive ? 'text-foreground' : 'text-muted-foreground',
    )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{family.name}</h1>
            <Badge variant="outline">{roleLabel[family.myRole]}</Badge>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="size-4" />
            {family.members.length} member
            {family.members.length === 1 ? '' : 's'}
            {' · '}
            <Wallet className="size-4" />
            {family.ledgers.length} ledger
            {family.ledgers.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <nav className="flex items-center gap-4 border-b pb-2">
        <NavLink
          to={`/admin/families/${family.id}/ledgers`}
          className={tabClass}
        >
          Ledgers
        </NavLink>
        <NavLink
          to={`/admin/families/${family.id}/categories`}
          className={tabClass}
        >
          Categories
        </NavLink>
        <NavLink
          to={`/admin/families/${family.id}/members`}
          className={tabClass}
        >
          Members
        </NavLink>
      </nav>

      <Outlet />
    </div>
  )
}
