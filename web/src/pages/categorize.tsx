import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useActiveLedgerRow } from '@/lib/active-ledger'
import {
  useCategorizeBatchMutation,
  useExpensesQuery,
  useFamilyQuery,
} from '@/lib/queries'
import { toast, useTimeFormatStore } from '@/lib/stores'
import { flattenCategories } from '@/lib/category-helpers'
import { formatExpenseTime, formatMoney } from '@/lib/format'
import type { Expense, MyLedger } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Check,
  CheckCheck,
  Folder,
  PencilLine,
  Tag,
  Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const PAGE = 100

export function CategorizePage() {
  const { ledger, isPending } = useActiveLedgerRow()

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  if (!ledger) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <Wallet className="size-8 text-muted-foreground" />
        <p className="font-medium">No ledgers yet</p>
        <p className="text-sm text-muted-foreground">
          Create a ledger to start recording expenses.
        </p>
        <Button asChild size="sm">
          <Link to="/admin/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    )
  }

  return (
    <CategorizeFlow
      key={ledger.id}
      ledger={ledger}
    />
  )
}

function CategorizeFlow({ ledger }: { ledger: MyLedger }) {
  const { data: family } = useFamilyQuery(ledger.familyId)
  const categorizeBatch = useCategorizeBatchMutation()

  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [categoryId, setCategoryId] = useState('')

  const { data, isPending, isError, error } = useExpensesQuery(
    ledger.id,
    { search: '', uncategorized: true, categoryId: '' },
    limit,
  )

  const expenses = useMemo(() => data?.expenses ?? [], [data])
  const total = data?.total ?? 0
  const categories = useMemo(() => family?.categories ?? [], [family])
  const flatCategories = useMemo(() => flattenCategories(categories), [categories])

  const selectedSum = useMemo(
    () =>
      expenses
        .filter((e) => selected.has(e.id))
        .reduce((acc, e) => acc + e.amount, 0),
    [expenses, selected],
  )

  const canAssign = selected.size > 0 && categoryId !== ''
  const assigning = categorizeBatch.isPending

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function assign() {
    if (!canAssign || assigning) return
    const items = [...selected].map((expenseId) => ({
      expenseId,
      categoryId,
    }))
    try {
      const result = await categorizeBatch.mutateAsync({
        ledgerId: ledger.id,
        familyId: ledger.familyId,
        items,
      })
      const name = flatCategories.find((c) => c.id === categoryId)?.name
      setSelected(new Set())
      setCategoryId('')
      toast.success(`Assigned ${result.count} to “${name ?? 'category'}”`)
    } catch {
      // Error toast is handled by the mutation's onError.
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Categorize</h1>
          <p className="truncate text-sm text-muted-foreground">
            {ledger.familyName} — uncategorized only
          </p>
        </div>
        {total > 0 && (
          <Badge variant="outline" className="shrink-0 text-amber-600 dark:text-amber-400">
            {total} to sort
          </Badge>
        )}
      </div>

      {isError && <p className="text-sm text-destructive">{error.message}</p>}

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading expenses…</p>
      ) : expenses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CheckCheck className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">All caught up</p>
            <p className="text-sm text-muted-foreground">
              No uncategorized expenses in this ledger.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link to="/log">
                <PencilLine />
                Log an expense
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {expenses.map((expense) => (
              <ExpenseSelectRow
                key={expense.id}
                expense={expense}
                checked={selected.has(expense.id)}
                onToggle={() => toggle(expense.id)}
              />
            ))}
          </div>

          {total > expenses.length && (
            <div className="flex flex-col items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLimit((l) => l + PAGE)}
              >
                Load more ({total - expenses.length} remaining)
              </Button>
              <p className="text-xs text-muted-foreground">
                Only loaded expenses can be selected in one batch.
              </p>
            </div>
          )}

          {flatCategories.length === 0 && (
            <Card>
              <CardContent className="py-3 text-sm text-muted-foreground">
                No categories in <span className="font-medium">{ledger.familyName}</span>{' '}
                yet — add some under{' '}
                <Link
                  to={`/admin/families/${ledger.familyId}/categories`}
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  Admin › Categories
                </Link>
                , then come back to sort these.
              </CardContent>
            </Card>
          )}

          {selected.size > 0 && (
            <AssignBar
              count={selected.size}
              sum={selectedSum}
              categoryId={categoryId}
              onCategoryChange={setCategoryId}
              categories={flatCategories}
              canAssign={canAssign}
              assigning={assigning}
              onAssign={() => void assign()}
              onClear={() => {
                setSelected(new Set())
                setCategoryId('')
              }}
            />
          )}
        </>
      )}
    </div>
  )
}

// ---------- selectable uncategorized row ----------

function ExpenseSelectRow({
  expense,
  checked,
  onToggle,
}: {
  expense: Expense
  checked: boolean
  onToggle: () => void
}) {
  const mode = useTimeFormatStore((s) => s.mode)
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-3 text-left transition-colors',
        checked
          ? 'border-primary bg-primary/[0.04] ring-1 ring-primary/30'
          : 'border-border hover:bg-muted/40',
      )}
    >
      <span
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors',
          checked
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-input bg-background',
        )}
      >
        {checked && <Check className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {expense.description ?? 'Expense'}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {formatExpenseTime(expense.occurredAt, mode, { withDate: true })}
          {expense.paidBy ? ` · paid by ${expense.paidBy.name}` : ''}
        </span>
      </span>
      <span className="shrink-0 font-semibold tabular-nums">
        {formatMoney(expense.amount, expense.currency)}
      </span>
    </button>
  )
}

// ---------- sticky in-memory assign bar ----------

function AssignBar({
  count,
  sum,
  categoryId,
  onCategoryChange,
  categories,
  canAssign,
  assigning,
  onAssign,
  onClear,
}: {
  count: number
  sum: number
  categoryId: string
  onCategoryChange: (id: string) => void
  categories: { id: string; name: string; depth: number }[]
  canAssign: boolean
  assigning: boolean
  onAssign: () => void
  onClear: () => void
}) {
  const selectedName =
    categories.find((c) => c.id === categoryId)?.name ?? ''

  return (
    // +env(safe-area-inset-bottom): keep the bar clear of the PWA home
    // indicator, which sits under the taller bottom nav in standalone mode.
    <div className="sticky bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-10 md:bottom-4">
      <Card className="shadow-lg">
        <CardContent className="flex flex-col gap-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Tag className="size-4" />
              {count} selected
              <span className="font-semibold tabular-nums">
                · {formatMoney(sum)}
              </span>
            </p>
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Clear
            </button>
          </div>

          <Select
            value={categoryId}
            onValueChange={(v) => onCategoryChange(v)}
            disabled={assigning}
          >
            <SelectTrigger className="w-full" aria-label="Category for the batch">
              <SelectValue
                placeholder={
                  <span className="flex items-center gap-1.5">
                    <Folder className="size-4" />
                    Choose a category…
                  </span>
                }
              />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span style={{ paddingLeft: c.depth * 14 }}>{c.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            size="lg"
            disabled={!canAssign || assigning}
            onClick={onAssign}
          >
            {assigning
              ? 'Assigning…'
              : selectedName
                ? `Assign ${count} to ${selectedName}`
                : 'Pick a category first'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
