import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import {
  useCategorizeExpenseMutation,
  useCreateExpenseMutation,
  useDeleteExpenseMutation,
  useExpensesQuery,
  useFamilyQuery,
  useUpdateExpenseMutation,
} from '@/lib/queries'
import { toast, useLedgerFiltersStore } from '@/lib/stores'
import {
  categoryPaths,
  formatDateTime,
  formatMoney,
  toLocalInputValue,
} from '@/lib/format'
import {
  expenseCaptureSchema,
  expenseEditSchema,
  zodFormResolver,
  type ExpenseCaptureValues,
  type ExpenseEditValues,
} from '@/lib/validations'
import type { CategoryNode, Expense } from '@/lib/types'
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
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Pencil, Search, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Flatten the tree into selectable options with depth-indented labels. */
function categoryOptions(
  nodes: CategoryNode[],
  depth = 0,
): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = []
  for (const node of nodes) {
    out.push({ id: node.id, label: `${'　'.repeat(depth)}${node.name}` })
    out.push(...categoryOptions(node.children, depth + 1))
  }
  return out
}

export function LedgerDetailPage() {
  const { familyId = '', ledgerId = '' } = useParams<{
    familyId: string
    ledgerId: string
  }>()

  const { data: family } = useFamilyQuery(familyId)
  const filters = useLedgerFiltersStore((s) => s.filters)
  const setFilters = useLedgerFiltersStore((s) => s.setFilters)
  const limit = useLedgerFiltersStore((s) => s.limit)
  const setLimit = useLedgerFiltersStore((s) => s.setLimit)

  const { data: list, isPending, isError, error } = useExpensesQuery(
    ledgerId,
    filters,
    limit,
  )

  const ledger = family?.ledgers.find((l) => l.id === ledgerId)
  const paths = categoryPaths(family?.categories ?? [])

  if (!family || !ledger) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to={`/admin/families/${familyId}/ledgers`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          All ledgers
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {ledger.name}
            </h2>
            {ledger.description && (
              <p className="text-sm text-muted-foreground">
                {ledger.description}
              </p>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums">
              {formatMoney(ledger.sum)}
            </span>
            <span className="text-xs text-muted-foreground">
              {ledger.expenseCount} total
            </span>
          </div>
        </div>
      </div>

      <CaptureForm ledgerId={ledgerId} familyId={familyId} />

      <FiltersBar
        filters={filters}
        onChange={setFilters}
        categoryOptions={categoryOptions(family.categories)}
      />

      {isError && <p className="text-sm text-destructive">{error.message}</p>}

      <div className="flex flex-col gap-2">
        {!isPending && list && list.expenses.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {filters.uncategorized || filters.categoryId || filters.search
                ? 'No expenses match the current filters.'
                : 'No expenses yet. Record your first one above — you can add a category later.'}
            </CardContent>
          </Card>
        )}
        {list?.expenses.map((expense) => (
          <ExpenseRow
            key={expense.id}
            expense={expense}
            paths={paths}
            familyId={familyId}
            ledgerId={ledgerId}
            categoryOptions={categoryOptions(family.categories)}
          />
        ))}
      </div>

      {list && list.total > list.expenses.length && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLimit(limit + 50)}
          >
            Load more ({list.total - list.expenses.length} remaining)
          </Button>
        </div>
      )}
    </div>
  )
}

// ---------- quick capture form ----------

function CaptureForm({
  ledgerId,
  familyId,
}: {
  ledgerId: string
  familyId: string
}) {
  const { data: family } = useFamilyQuery(familyId)
  const createExpense = useCreateExpenseMutation()
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseCaptureValues>({
    resolver: zodFormResolver(expenseCaptureSchema),
    defaultValues: {
      amount: undefined,
      description: '',
      paidById: '',
      occurredAt: toLocalInputValue(new Date()),
    },
  })

  async function onSubmit(values: ExpenseCaptureValues) {
    await createExpense.mutateAsync({
      ledgerId,
      familyId,
      data: {
        amount: values.amount,
        description: values.description || undefined,
        paidById: values.paidById || null,
        occurredAt: values.occurredAt
          ? new Date(`${values.occurredAt}T12:00:00`).toISOString()
          : undefined,
      },
    })
    reset({
      amount: undefined,
      description: '',
      paidById: '',
      occurredAt: toLocalInputValue(new Date()),
    })
    toast.success('Expense recorded')
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Record an expense</CardTitle>
        <CardDescription>
          Just the essentials — you can assign a category later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          className="flex flex-wrap items-end gap-3"
          noValidate
        >
          <div className="flex min-w-32 flex-col gap-1.5">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="0.00"
              autoFocus
              aria-invalid={errors.amount ? true : undefined}
              {...register('amount')}
            />
            {errors.amount && (
              <p className="text-sm text-destructive">
                {errors.amount.message}
              </p>
            )}
          </div>
          <div className="min-w-48 flex-1 flex-col gap-1.5">
            <Label htmlFor="description" className="mb-1.5">
              Description
            </Label>
            <Input
              id="description"
              placeholder="Groceries, taxi, coffee…"
              maxLength={200}
              {...register('description')}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paid-by">Paid by</Label>
            <Controller
              control={control}
              name="paidById"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="paid-by" className="min-w-36">
                    <SelectValue placeholder="Me (default)" />
                  </SelectTrigger>
                  <SelectContent>
                    {(family?.members ?? []).map((m) => (
                      <SelectItem key={m.id} value={m.user.id}>
                        {m.user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="occurred">Date</Label>
            <Input id="occurred" type="date" {...register('occurredAt')} />
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Add'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ---------- filters ----------

function FiltersBar({
  filters,
  onChange,
  categoryOptions,
}: {
  filters: { search: string; uncategorized: boolean; categoryId: string }
  onChange: (patch: Partial<typeof filters>) => void
  categoryOptions: { id: string; label: string }[]
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="w-56 pl-8"
          placeholder="Search description…"
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
        />
      </div>
      <Select
        value={filters.categoryId}
        onValueChange={(v) => onChange({ categoryId: v })}
      >
        <SelectTrigger size="sm">
          <SelectValue placeholder="All categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All categories</SelectItem>
          <SelectItem value="__uncategorized__">Uncategorized</SelectItem>
          {categoryOptions.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant={filters.uncategorized ? 'secondary' : 'outline'}
        size="sm"
        onClick={() => onChange({ uncategorized: !filters.uncategorized })}
      >
        Only uncategorized
      </Button>
    </div>
  )
}

// ---------- expense row ----------

function ExpenseRow({
  expense,
  paths,
  familyId,
  ledgerId,
  categoryOptions,
}: {
  expense: Expense
  paths: Map<string, string>
  familyId: string
  ledgerId: string
  categoryOptions: { id: string; label: string }[]
}) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const categorize = useCategorizeExpenseMutation()
  const deleteExpense = useDeleteExpenseMutation()

  const isUncategorized = expense.category === null

  return (
    <Card size="sm">
      <CardContent className="flex flex-wrap items-center gap-3 py-3">
        <div className="min-w-24">
          <p className="text-[0.8rem] font-semibold tabular-nums">
            {formatMoney(expense.amount, expense.currency)}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDateTime(expense.occurredAt)}
          </p>
        </div>
        <div className="min-w-40 flex-1 flex-col">
          <p className="text-sm font-medium">
            {expense.description ?? 'Expense'}
          </p>
          <p className="text-xs text-muted-foreground">
            {isUncategorized ? (
              <span className="text-amber-600 dark:text-amber-400">
                Uncategorized
              </span>
            ) : (
              paths.get(expense.category!.id) ?? expense.category!.name
            )}
            {expense.paidBy && ` · paid by ${expense.paidBy.name}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Select
            value={expense.category?.id ?? '__none__'}
            onValueChange={(v) =>
              void categorize.mutateAsync({
                expenseId: expense.id,
                ledgerId,
                familyId,
                categoryId: v === '__none__' ? null : v,
              })
            }
            disabled={categorize.isPending}
          >
            <SelectTrigger
              size="sm"
              className={cn(
                'max-w-56',
                isUncategorized &&
                  'border-amber-500/50 text-amber-600 dark:text-amber-400',
              )}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Uncategorized</SelectItem>
              {categoryOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Edit expense"
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-destructive"
            aria-label="Delete expense"
            onClick={() => setConfirming(true)}
          >
            <Trash2 />
          </Button>
        </div>
      </CardContent>

      <EditExpenseDialog
        expense={expense}
        familyId={familyId}
        ledgerId={ledgerId}
        open={editing}
        onOpenChange={setEditing}
        categoryOptions={categoryOptions}
      />

      <Dialog
        open={confirming}
        onOpenChange={(o) => !o && setConfirming(false)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete expense?</DialogTitle>
            <DialogDescription>
              {formatMoney(expense.amount, expense.currency)}{' '}
              {expense.description ? `— ${expense.description}` : ''} will be
              permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteExpense.isPending}
              onClick={() =>
                void deleteExpense
                  .mutateAsync({ expenseId: expense.id, ledgerId, familyId })
                  .then(() => setConfirming(false))
              }
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// ---------- edit dialog ----------

function EditExpenseDialog({
  expense,
  familyId,
  ledgerId,
  open,
  onOpenChange,
  categoryOptions,
}: {
  expense: Expense
  familyId: string
  ledgerId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  categoryOptions: { id: string; label: string }[]
}) {
  const { data: family } = useFamilyQuery(familyId)
  const updateExpense = useUpdateExpenseMutation()
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseEditValues>({
    resolver: zodFormResolver(expenseEditSchema),
    defaultValues: {
      amount: expense.amount,
      description: expense.description ?? '',
      note: expense.note ?? '',
      categoryId: expense.category?.id ?? '',
      paidById: expense.paidBy?.id ?? '',
      occurredAt: toLocalInputValue(new Date(expense.occurredAt)),
    },
  })

  async function onSubmit(values: ExpenseEditValues) {
    await updateExpense.mutateAsync({
      expenseId: expense.id,
      ledgerId,
      familyId,
      data: {
        amount: values.amount,
        description: values.description || null,
        note: values.note || null,
        paidById: values.paidById || null,
        categoryId: values.categoryId || null,
        occurredAt: new Date(`${values.occurredAt}T12:00:00`).toISOString(),
      },
    })
    onOpenChange(false)
    toast.success('Expense updated')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
          <DialogHeader>
            <DialogTitle>Edit expense</DialogTitle>
            <DialogDescription>
              Update the details, or clear the category to leave it
              uncategorized.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-amount">Amount</Label>
              <Input
                id="edit-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                aria-invalid={errors.amount ? true : undefined}
                {...register('amount')}
              />
              {errors.amount && (
                <p className="text-sm text-destructive">
                  {errors.amount.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-date">Date</Label>
              <Input
                id="edit-date"
                type="date"
                aria-invalid={errors.occurredAt ? true : undefined}
                {...register('occurredAt')}
              />
              {errors.occurredAt && (
                <p className="text-sm text-destructive">
                  {errors.occurredAt.message}
                </p>
              )}
            </div>
            <div className="col-span-2 flex flex-col gap-2">
              <Label htmlFor="edit-desc">Description</Label>
              <Input
                id="edit-desc"
                maxLength={200}
                {...register('description')}
              />
            </div>
            <div className="col-span-2 flex flex-col gap-2">
              <Label htmlFor="edit-note">Note</Label>
              <Textarea id="edit-note" {...register('note')} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-category">Category</Label>
              <Controller
                control={control}
                name="categoryId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="edit-category" className="w-full">
                      <SelectValue placeholder="Uncategorized" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Uncategorized</SelectItem>
                      {categoryOptions.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-paid">Paid by</Label>
              <Controller
                control={control}
                name="paidById"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="edit-paid" className="w-full">
                      <SelectValue placeholder="Nobody (unknown)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Nobody (unknown)</SelectItem>
                      {(family?.members ?? []).map((m) => (
                        <SelectItem key={m.id} value={m.user.id}>
                          {m.user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
