import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import {
  useCreateLedgerMutation,
  useDeleteLedgerMutation,
  useFamilyQuery,
} from '@/lib/queries'
import { toast } from '@/lib/stores'
import { formatMoney } from '@/lib/format'
import { ledgerSchema, zodFormResolver, type LedgerValues } from '@/lib/validations'
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
import { Textarea } from '@/components/ui/textarea'
import { ChevronRight, Plus, Trash2 } from 'lucide-react'

export function LedgersPage() {
  const { familyId = '' } = useParams<{ familyId: string }>()
  const { data: family } = useFamilyQuery(familyId)
  const createLedger = useCreateLedgerMutation()
  const deleteLedger = useDeleteLedgerMutation()

  const [open, setOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LedgerValues>({
    resolver: zodFormResolver(ledgerSchema),
    defaultValues: { name: '', description: '' },
  })

  async function onCreate(values: LedgerValues) {
    await createLedger.mutateAsync({
      familyId,
      data: {
        name: values.name,
        description: values.description || undefined,
      },
    })
    reset()
    setOpen(false)
    toast.success(`Ledger “${values.name}” created`)
  }

  async function confirmDelete(ledgerId: string) {
    setDeletingId(null)
    await deleteLedger.mutateAsync({ ledgerId, familyId })
    toast.success('Ledger deleted')
  }

  const ledgers = family?.ledgers ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Ledgers</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus />
              New ledger
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={(e) => void handleSubmit(onCreate)(e)} noValidate>
              <DialogHeader>
                <DialogTitle>New ledger</DialogTitle>
                <DialogDescription>
                  A place to record expenses, e.g. “Household”, “Vacation”,
                  “Renovation”. Categories are shared across ledgers.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4 py-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ledger-name">Name</Label>
                  <Input
                    id="ledger-name"
                    aria-invalid={errors.name ? true : undefined}
                    {...register('name')}
                    placeholder="Household"
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">
                      {errors.name.message}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ledger-desc">Description (optional)</Label>
                  <Textarea
                    id="ledger-desc"
                    {...register('description')}
                    placeholder="Day to day spending"
                  />
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
                  {isSubmitting ? 'Creating…' : 'Create ledger'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {ledgers.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No ledgers yet — create one to start recording expenses.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {ledgers.map((ledger) => (
            <Card key={ledger.id} className="relative">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <CardTitle>{ledger.name}</CardTitle>
                    {ledger.description && (
                      <CardDescription>{ledger.description}</CardDescription>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setDeletingId(ledger.id)}
                    aria-label={`Delete ${ledger.name}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold tabular-nums">
                    {formatMoney(ledger.sum)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {ledger.expenseCount} expense
                    {ledger.expenseCount === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {ledger.uncategorizedCount > 0 ? (
                    <Badge
                      variant="outline"
                      className="text-amber-600 dark:text-amber-400"
                    >
                      {ledger.uncategorizedCount} uncategorized
                    </Badge>
                  ) : (
                    <Badge variant="outline">All categorized</Badge>
                  )}
                </div>
              </CardContent>
              <Link
                to={`/admin/families/${familyId}/ledgers/${ledger.id}`}
                className="absolute inset-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label={`Open ${ledger.name}`}
              >
                <span className="sr-only">Open {ledger.name}</span>
              </Link>
              <ChevronRight className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={deletingId !== null}
        onOpenChange={(o) => !o && setDeletingId(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete ledger?</DialogTitle>
            <DialogDescription>
              This permanently deletes the ledger and all of its expenses.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteLedger.isPending}
              onClick={() => deletingId && void confirmDelete(deletingId)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
