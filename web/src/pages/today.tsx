import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useActiveLedgerRow } from '@/lib/active-ledger'
import {
  useFamilyQuery,
  useLedgerBreakdownQuery,
  useLedgerExpensesInRangeQuery,
  useLedgerTotalsQuery,
} from '@/lib/queries'
import { formatMoney } from '@/lib/format'
import type { CategoryNode, Expense, FamilyMember } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ExpenseListItem } from '@/components/expense-list-item'
import { PencilLine, Tag, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'

const DOT_COLORS = [
  'bg-sky-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-teal-500',
  'bg-blue-500',
  'bg-orange-500',
]

/**
 * The signed-in home tab: a glance at today's spending for the active
 * ledger (total + breakdown by main category + list of today's expenses).
 */
export function TodayHome() {
  const navigate = useNavigate()
  const { ledger, isPending } = useActiveLedgerRow()

  // Local-day window: midnight → now. Computed once per mount.
  const { from, to } = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return { from: start.toISOString(), to: new Date().toISOString() }
  }, [])

  const totals = useLedgerTotalsQuery(ledger?.id ?? null, from, to)
  const breakdown = useLedgerBreakdownQuery(ledger?.id ?? null, from, to)
  const { data: family } = useFamilyQuery(ledger?.familyId ?? null)
  const transactions = useLedgerExpensesInRangeQuery(
    ledger?.id ?? null,
    from,
    to,
  )
  const count = totals.data?.count ?? 0
  const sum = totals.data?.sum ?? 0

  const categoryLabelFor = useMemo(() => {
    // Category id → breadcrumb label, e.g. Food › Groceries.
    const parents = new Map<string, string | null>()
    const names = new Map<string, string>()
    const walk = (nodes: CategoryNode[], parent: string | null) => {
      for (const n of nodes) {
        parents.set(n.id, parent)
        names.set(n.id, n.name)
        walk(n.children, n.id)
      }
    }
    walk(family?.categories ?? [], null)
    return (categoryId: string) => {
      const parts: string[] = []
      let cur: string | null = categoryId
      while (cur) {
        const name = names.get(cur)
        if (!name) break
        parts.unshift(name)
        cur = parents.get(cur) ?? null
      }
      return parts.join(' › ')
    }
  }, [family])

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
        <Button asChild size="lg">
          <Link to="/admin/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    )
  }

  const loading = totals.isPending || breakdown.isPending

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}{' '}
          · {ledger.familyName}
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-1 py-7 text-center">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Spent today
          </p>
          {loading ? (
            <div className="h-11 w-52 animate-pulse rounded-lg bg-muted" />
          ) : (
            <p className="text-5xl font-bold tracking-tight tabular-nums">
              {formatMoney(sum)}
            </p>
          )}
          {!loading && (
            <p className="text-sm text-muted-foreground">
              {count === 0
                ? 'Nothing logged yet today'
                : `${count} transaction${count === 1 ? '' : 's'} today`}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Only shown while there's categorization work to do. */}
      {!isPending && ledger.uncategorizedCount > 0 && (
        <Button asChild variant="outline" size="lg" className="w-full">
          <Link to="/categorize">
            <Tag className="size-5 text-amber-600 dark:text-amber-400" />
            <span className="flex-1 text-left">
              Categorize {ledger.uncategorizedCount} uncategorized
            </span>
          </Link>
        </Button>
      )}

      <Button size="xl" className="w-full" onClick={() => navigate('/log')}>
        <PencilLine />
        Log an expense
      </Button>

      {!loading && count > 0 && (
        <CategoryBreakdown
          rows={breakdown.data?.categories ?? []}
          uncategorized={breakdown.data?.uncategorized ?? { sum: 0, count: 0 }}
        />
      )}

      {!transactions.isPending &&
        transactions.data &&
        transactions.data.length > 0 && (
          <TodayTransactions
            expenses={transactions.data}
            members={family?.members ?? []}
            categoryLabelFor={categoryLabelFor}
          />
        )}
    </div>
  )
}

// ---------- today's transactions (shared item) ----------

function TodayTransactions({
  expenses,
  members,
  categoryLabelFor,
}: {
  expenses: Expense[]
  members: FamilyMember[]
  categoryLabelFor: (categoryId: string) => string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Transactions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col">
        {expenses.map((expense) => (
          <ExpenseListItem
            key={expense.id}
            expense={expense}
            members={members}
            categoryLabelFor={categoryLabelFor}
            // The date is obviously “today” on this screen.
            withDate={false}
          />
        ))}
      </CardContent>
    </Card>
  )
}

// ---------- today's spending by main category ----------

function CategoryBreakdown({
  rows,
  uncategorized,
}: {
  rows: { id: string; name: string; sum: number; count: number }[]
  uncategorized: { sum: number; count: number }
}) {
  // Nothing to list: no category spending and nothing uncategorized today.
  if (rows.length === 0 && uncategorized.count === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Today by category
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col">
        {rows.map((row, i) => (
          <div
            key={row.id}
            className="flex items-center justify-between gap-3 border-b py-2.5 last:border-0"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  'size-2.5 shrink-0 rounded-full',
                  DOT_COLORS[i % DOT_COLORS.length],
                )}
              />
              <span className="truncate text-sm font-medium">{row.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {row.count}
              </span>
            </span>
            <span className="shrink-0 text-sm font-semibold tabular-nums">
              {formatMoney(row.sum)}
            </span>
          </div>
        ))}
        {uncategorized.count > 0 && (
          <div className="flex items-center justify-between gap-3 border-b py-2.5 last:border-0">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full bg-amber-400" />
              <span className="truncate text-sm font-medium text-amber-600 dark:text-amber-400">
                Uncategorized
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {uncategorized.count}
              </span>
            </span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-400">
              {formatMoney(uncategorized.sum)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
