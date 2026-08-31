import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import {
  useCreateFamilyMutation,
  useFamiliesQuery,
  useRecentExpensesQuery,
} from '@/lib/queries'
import { toast } from '@/lib/stores'
import { formatDateTime, formatMoney } from '@/lib/format'
import { familySchema, zodFormResolver, type FamilyValues } from '@/lib/validations'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronRight, Plus, Receipt, Users, Wallet } from 'lucide-react'

const roleLabel: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
}

export function DashboardPage() {
  const navigate = useNavigate()
  const families = useFamiliesQuery()
  const recent = useRecentExpensesQuery(8)
  const createFamily = useCreateFamilyMutation()

  const [open, setOpen] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FamilyValues>({
    resolver: zodFormResolver(familySchema),
    defaultValues: { name: '' },
  })

  async function onCreate(values: FamilyValues) {
    const { families: created } = await createFamily.mutateAsync(values.name)
    reset()
    setOpen(false)
    toast.success(`Family “${values.name}” created`)
    const family = created[0]
    if (family) navigate(`/admin/families/${family.id}/ledgers`)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus />
              New family
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form
              onSubmit={(e) => void handleSubmit(onCreate)(e)}
              noValidate
            >
              <DialogHeader>
                <DialogTitle>Create a family</DialogTitle>
                <DialogDescription>
                  A shared space for ledgers, categories and expenses — invite
                  members after creating it.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4 py-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="family-name">Family name</Label>
                  <Input
                    id="family-name"
                    autoFocus
                    aria-invalid={errors.name ? true : undefined}
                    {...register('name')}
                    placeholder="The Johnsons"
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">
                      {errors.name.message}
                    </p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating…' : 'Create family'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {families.isError && (
        <p className="text-sm text-destructive">{families.error.message}</p>
      )}

      {families.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : families.data && families.data.families.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Wallet className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No families yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a family to start recording expenses with the people you
              live with.
            </p>
            <Button className="mt-4" onClick={() => setOpen(true)}>
              <Plus />
              Create your first family
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {families.data?.families.map((family) => (
            <Card key={family.id} className="relative">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle>{family.name}</CardTitle>
                  <Badge variant="outline">{roleLabel[family.role]}</Badge>
                </div>
                <CardDescription className="flex items-center gap-1.5">
                  <Users className="size-3.5" />
                  {family.memberCount} member
                  {family.memberCount === 1 ? '' : 's'}
                  {' · '}
                  <Wallet className="size-3.5" />
                  {family.ledgerCount} ledger
                  {family.ledgerCount === 1 ? '' : 's'}
                </CardDescription>
              </CardHeader>
              <Link
                to={`/admin/families/${family.id}/ledgers`}
                className="absolute inset-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label={`Open ${family.name}`}
              >
                <span className="sr-only">Open {family.name}</span>
              </Link>
              <ChevronRight className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Recent expenses</h2>
        {recent.data && recent.data.expenses.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              <Receipt className="mx-auto size-6" />
              <p className="mt-2">
                Nothing recorded yet. Open a ledger and add your first expense.
              </p>
            </CardContent>
          </Card>
        )}
        {recent.data?.expenses.map((expense) => (
          <Card key={expense.id} size="sm">
            <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {expense.description ?? 'Expense'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {expense.ledger.family.name} · {expense.ledger.name} ·{' '}
                  {formatDateTime(expense.occurredAt)}
                  {expense.category ? ` · ${expense.category.name}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {expense.category === null && (
                  <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
                    Uncategorized
                  </Badge>
                )}
                <span className="font-semibold tabular-nums">
                  {formatMoney(expense.amount, expense.currency)}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
