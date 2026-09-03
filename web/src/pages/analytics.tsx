import { forwardRef, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useActiveLedgerRow } from '@/lib/active-ledger'
import {
  useDeleteExpenseMutation,
  useFamilyQuery,
  useLedgerAnalyticsCategoriesQuery,
  useLedgerAnalyticsDaysQuery,
  useLedgerExpenseRowsQuery,
  useLedgerTotalsQuery,
  useUpdateExpenseMutation,
  type ExpenseRowsFilter,
} from '@/lib/queries'
import { formatMoney } from '@/lib/format'
import { toast } from '@/lib/stores'
import type {
  CategoryNode,
  Expense,
  FamilyMember,
  MyLedger,
} from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ExpenseListItem } from '@/components/expense-list-item'
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowUpDown,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  FolderTree,
  Receipt,
  Trash2,
  Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------- types ----------

type PresetId =
  | 'this-week'
  | 'last-week'
  | 'two-weeks-ago'
  | 'this-month'
  | 'last-month'
  | 'month'
  | 'custom'

type Grouping = 'category' | 'date' | 'list'
type SortId = 'newest' | 'oldest' | 'highest' | 'lowest'

type Drill =
  | { kind: 'root' }
  | { kind: 'cat'; path: string[] }
  | { kind: 'cat-expenses'; path: string[]; catId: string }
  | { kind: 'date'; dateKey: string }
  | { kind: 'uncategorized' }

interface GroupRowModel {
  key: string
  label: string
  note?: string
  count: number
  sum: number
  uncategorized?: boolean
  sortDate?: string
  onOpen: () => void
}

interface CatRef {
  name: string
  parentId: string | null
}

const PRESETS: { id: Exclude<PresetId, 'month'>; label: string }[] = [
  { id: 'this-week', label: 'This week' },
  { id: 'last-week', label: 'Last week' },
  { id: 'two-weeks-ago', label: '2 weeks ago' },
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'custom', label: 'Custom…' },
]

const GROUPINGS: { id: Grouping; label: string }[] = [
  { id: 'category', label: 'By category' },
  { id: 'date', label: 'By date' },
  { id: 'list', label: 'All expenses' },
]

const SORTS: { id: SortId; label: string }[] = [
  { id: 'newest', label: 'Time · newest first' },
  { id: 'oldest', label: 'Time · oldest first' },
  { id: 'highest', label: 'Amount · high → low' },
  { id: 'lowest', label: 'Amount · low → high' },
]

// ---------- page ----------

export function AnalyticsPage() {
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
  return <AnalyticsFlow key={ledger.id} ledger={ledger} />
}

function AnalyticsFlow({ ledger }: { ledger: MyLedger }) {
  const { data: family } = useFamilyQuery(ledger.familyId)
  const roots = useMemo(() => family?.categories ?? [], [family])
  const members = useMemo(() => family?.members ?? [], [family])

  // ---- options state ----
  const now = useMemo(() => new Date(), [])
  const [preset, setPreset] = useState<PresetId>('this-week')
  const [monthVal, setMonthVal] = useState('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [grouping, setGrouping] = useState<Grouping>('category')
  const [sortId, setSortId] = useState<SortId>('highest')

  const range = useMemo(
    () => resolveRange(preset, now, monthVal, customFrom, customTo),
    [preset, now, monthVal, customFrom, customTo],
  )
  const tzOffset = useMemo(() => -new Date().getTimezoneOffset(), [])

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="truncate text-sm text-muted-foreground">
          {ledger.familyName}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <RangePicker
          label={range.label}
          preset={preset}
          onPreset={setPreset}
          monthVal={monthVal}
          onMonth={(v) => {
            setMonthVal(v)
            if (v) setPreset('month')
          }}
          customFrom={customFrom}
          onCustomFrom={setCustomFrom}
          customTo={customTo}
          onCustomTo={setCustomTo}
        />
        <GroupingPicker grouping={grouping} onGrouping={setGrouping} />
        <SortingPicker sortId={sortId} onSort={setSortId} />
      </div>

      <Results
        key={`${grouping}:${range.from}:${range.to}`}
        ledgerId={ledger.id}
        familyId={ledger.familyId}
        roots={roots}
        members={members}
        from={range.from}
        to={range.to}
        tzOffset={tzOffset}
        grouping={grouping}
        sortId={sortId}
      />
    </div>
  )
}

// ---------- pickers ----------

function PickerPill(
  {
    icon: Icon,
    label,
    open,
    ...props
  }: {
    icon: typeof CalendarDays
    label: string
    open: boolean
  } & React.ButtonHTMLAttributes<HTMLButtonElement>,
  ref: React.ForwardedRef<HTMLButtonElement>,
) {
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      className={cn(
        'flex max-w-full items-center gap-1.5 rounded-full border py-1 pr-2 pl-2.5 text-xs font-medium transition-colors',
        open
          ? 'border-primary/40 bg-muted text-foreground'
          : 'border-input bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
        props.className,
      )}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{label}</span>
      <ChevronDown className="size-3 shrink-0 opacity-60" />
    </button>
  )
}

const PickerPillForwarded = forwardRef(PickerPill)

function PopoverTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  )
}

function OptionList({
  options,
  selected,
  onSelect,
}: {
  options: { id: string; label: string }[]
  selected: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {options.map((o) => {
        const active = o.id === selected
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onSelect(o.id)}
            className={cn(
              'flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-sm text-left transition-colors',
              active
                ? 'bg-primary/10 font-medium text-primary'
                : 'text-foreground hover:bg-muted',
            )}
          >
            {o.label}
            {active && <Check className="size-4 shrink-0" />}
          </button>
        )
      })}
    </div>
  )
}

function ChoiceChip({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1.5 text-sm transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-background hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}

function RangePicker({
  label,
  preset,
  onPreset,
  monthVal,
  onMonth,
  customFrom,
  onCustomFrom,
  customTo,
  onCustomTo,
}: {
  label: string
  preset: PresetId
  onPreset: (p: PresetId) => void
  monthVal: string
  onMonth: (v: string) => void
  customFrom: string
  onCustomFrom: (v: string) => void
  customTo: string
  onCustomTo: (v: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PickerPillForwarded icon={CalendarDays} label={label} open={open} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <PopoverTitle>Date range</PopoverTitle>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <ChoiceChip
              key={p.id}
              active={preset === p.id}
              onClick={() => onPreset(p.id)}
            >
              {p.label}
            </ChoiceChip>
          ))}
          <Input
            type="month"
            aria-label="Pick a month"
            className="h-9 w-36 rounded-full px-3"
            value={monthVal}
            onChange={(e) => onMonth(e.target.value)}
          />
        </div>
        {preset === 'custom' && (
          <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="range-from" className="text-xs">
                From
              </Label>
              <Input
                id="range-from"
                type="date"
                value={customFrom}
                onChange={(e) => onCustomFrom(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="range-to" className="text-xs">
                To
              </Label>
              <Input
                id="range-to"
                type="date"
                value={customTo}
                onChange={(e) => onCustomTo(e.target.value)}
              />
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function GroupingPicker({
  grouping,
  onGrouping,
}: {
  grouping: Grouping
  onGrouping: (g: Grouping) => void
}) {
  const [open, setOpen] = useState(false)
  const label = GROUPINGS.find((g) => g.id === grouping)?.label ?? ''

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PickerPillForwarded icon={FolderTree} label={label} open={open} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56">
        <PopoverTitle>Grouping</PopoverTitle>
        <OptionList
          options={GROUPINGS.map((g) => ({ id: g.id, label: g.label }))}
          selected={grouping}
          onSelect={(v) => {
            onGrouping(v as Grouping)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

function SortingPicker({
  sortId,
  onSort,
}: {
  sortId: SortId
  onSort: (s: SortId) => void
}) {
  const [open, setOpen] = useState(false)
  const label = SORTS.find((s) => s.id === sortId)?.label ?? ''

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PickerPillForwarded icon={ArrowUpDown} label={label} open={open} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <PopoverTitle>Sorting</PopoverTitle>
        <OptionList
          options={SORTS.map((s) => ({ id: s.id, label: s.label }))}
          selected={sortId}
          onSelect={(v) => {
            onSort(v as SortId)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

// ---------- results ----------

function Results({
  ledgerId,
  familyId,
  roots,
  members,
  from,
  to,
  tzOffset,
  grouping,
  sortId,
}: {
  ledgerId: string
  familyId: string
  roots: CategoryNode[]
  members: FamilyMember[]
  from: string
  to: string
  tzOffset: number
  grouping: Grouping
  sortId: SortId
}) {
  const [drill, setDrill] = useState<Drill>({ kind: 'root' })
  const [editing, setEditing] = useState<Expense | null>(null)
  const catRefs = useMemo(() => buildCatRefs(roots), [roots])
  const categoryOptions = useMemo(() => flattenOptions(roots), [roots])
  const totals = useLedgerTotalsQuery(ledgerId, from, to)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3 rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Total spent
          </p>
          {totals.isPending ? (
            <div className="mt-1 h-9 w-40 animate-pulse rounded-md bg-muted" />
          ) : (
            <p className="mt-0.5 text-3xl font-bold tracking-tight tabular-nums">
              {formatMoney(totals.data?.sum ?? 0)}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {totals.data?.count ?? 0} expense
            {totals.data?.count === 1 ? '' : 's'}
          </p>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {GROUPINGS.find((g) => g.id === grouping)?.label}
        </span>
      </div>

      {drill.kind !== 'root' && (
        <Crumbs drill={drill} catRefs={catRefs} onDrill={setDrill} />
      )}

      {grouping === 'category' && (
        <CategoryBody
          ledgerId={ledgerId}
          familyId={familyId}
          catRefs={catRefs}
          members={members}
          from={from}
          to={to}
          sortId={sortId}
          drill={drill}
          onDrill={setDrill}
          onEdit={setEditing}
        />
      )}
      {grouping === 'date' && (
        <DateBody
          ledgerId={ledgerId}
          familyId={familyId}
          catRefs={catRefs}
          members={members}
          from={from}
          to={to}
          tzOffset={tzOffset}
          sortId={sortId}
          drill={drill}
          onDrill={setDrill}
          onEdit={setEditing}
        />
      )}
      {grouping === 'list' && (
        <ExpenseListBody
          ledgerId={ledgerId}
          familyId={familyId}
          catRefs={catRefs}
          members={members}
          filter={{ from, to, sort: sortId }}
          withDate
          onEdit={setEditing}
        />
      )}

      {editing && (
        <ExpenseEditorDialog
          expense={editing}
          ledgerId={ledgerId}
          familyId={familyId}
          categoryOptions={categoryOptions}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

// ---------- category drill (aggregated server-side per level) ----------

function CategoryBody({
  ledgerId,
  familyId,
  catRefs,
  members,
  from,
  to,
  sortId,
  drill,
  onDrill,
  onEdit,
}: {
  ledgerId: string
  familyId: string
  catRefs: Map<string, CatRef>
  members: FamilyMember[]
  from: string
  to: string
  sortId: SortId
  drill: Drill
  onDrill: (d: Drill) => void
  onEdit: (e: Expense) => void
}) {
  const pathBase = drill.kind === 'cat' ? drill.path : []
  const parentId = pathBase.length ? pathBase[pathBase.length - 1] : null
  const level = useLedgerAnalyticsCategoriesQuery(ledgerId, from, to, parentId)

  if (drill.kind === 'cat-expenses') {
    return (
      <ExpenseListBody
        ledgerId={ledgerId}
        familyId={familyId}
        catRefs={catRefs}
        members={members}
        filter={{ from, to, categoryId: drill.catId, sort: sortId }}
        withDate
        onEdit={onEdit}
      />
    )
  }
  if (drill.kind === 'uncategorized') {
    return (
      <ExpenseListBody
        ledgerId={ledgerId}
        familyId={familyId}
        catRefs={catRefs}
        members={members}
        filter={{ from, to, uncategorized: true, sort: sortId }}
        withDate
        onEdit={onEdit}
      />
    )
  }

  if (drill.kind !== 'root' && drill.kind !== 'cat') return null

  if (level.isPending) {
    return <RowsSkeleton />
  }
  if (!level.data) return null

  const rows: GroupRowModel[] = level.data.children.map((c) => {
    const path = parentId ? [...pathBase, c.id] : [c.id]
    return {
      key: `cat-${c.id}`,
      label: c.name,
      count: c.count,
      sum: c.sum,
      onOpen: () =>
        c.hasChildren
          ? onDrill({ kind: 'cat', path })
          : onDrill({ kind: 'cat-expenses', path, catId: c.id }),
    }
  })

  if (parentId && level.data.direct.count > 0) {
    const scopeName = catRefs.get(parentId)?.name ?? '…'
    rows.push({
      key: `cat-${parentId}-direct`,
      label: 'Expenses',
      note: `directly in ${scopeName}`,
      count: level.data.direct.count,
      sum: level.data.direct.sum,
      onOpen: () =>
        onDrill({
          kind: 'cat-expenses',
          path: [...pathBase],
          catId: parentId,
        }),
    })
  }
  if (!parentId && level.data.uncategorized.count > 0) {
    rows.push({
      key: 'cat-uncategorized',
      label: 'Uncategorized',
      count: level.data.uncategorized.count,
      sum: level.data.uncategorized.sum,
      uncategorized: true,
      onOpen: () => onDrill({ kind: 'uncategorized' }),
    })
  }

  return <GroupList rows={sortGroupRows(rows, sortId)} />
}

// ---------- date drill (per-day buckets aggregated in the DB) ----------

function DateBody({
  ledgerId,
  familyId,
  catRefs,
  members,
  from,
  to,
  tzOffset,
  sortId,
  drill,
  onDrill,
  onEdit,
}: {
  ledgerId: string
  familyId: string
  catRefs: Map<string, CatRef>
  members: FamilyMember[]
  from: string
  to: string
  tzOffset: number
  sortId: SortId
  drill: Drill
  onDrill: (d: Drill) => void
  onEdit: (e: Expense) => void
}) {
  const days = useLedgerAnalyticsDaysQuery(ledgerId, from, to, tzOffset)

  if (drill.kind === 'date') {
    const day = parseDay(drill.dateKey)
    return (
      <ExpenseListBody
        ledgerId={ledgerId}
        familyId={familyId}
        catRefs={catRefs}
        members={members}
        filter={{
          from: dayStart(day).toISOString(),
          to: dayEnd(day).toISOString(),
          sort: sortId,
        }}
        withDate={false} // the day is obvious here
        onEdit={onEdit}
      />
    )
  }

  if (days.isPending) {
    return <RowsSkeleton />
  }

  const rows: GroupRowModel[] = (days.data?.days ?? []).map((d) => ({
    key: `day-${d.date}`,
    label: dayLabel(d.date),
    sortDate: d.date,
    count: d.count,
    sum: d.sum,
    onOpen: () => onDrill({ kind: 'date', dateKey: d.date }),
  }))

  return <GroupList rows={sortGroupRows(rows, sortId)} />
}

// ---------- shared list rendering ----------

function GroupList({ rows }: { rows: GroupRowModel[] }) {
  const maxSum = rows.reduce((m, r) => Math.max(m, r.sum), 0)
  return (
    <Card>
      <CardContent className="flex flex-col py-1">
        {rows.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing in this view.
          </p>
        )}
        {rows.map((row) => (
          <GroupRow key={row.key} row={row} maxSum={maxSum} />
        ))}
      </CardContent>
    </Card>
  )
}

function GroupRow({ row, maxSum }: { row: GroupRowModel; maxSum: number }) {
  const share = maxSum > 0 ? Math.round((row.sum / maxSum) * 100) : 0
  return (
    <button
      type="button"
      onClick={row.onOpen}
      className="flex w-full items-center justify-between gap-3 border-b py-3.5 text-left last:border-0"
    >
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-[0.95rem] font-medium',
            row.uncategorized && 'text-amber-600 dark:text-amber-400',
          )}
        >
          {row.label}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {row.count} expense{row.count === 1 ? '' : 's'}
          {row.note ? ` · ${row.note}` : ''}
        </span>
        <span className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-muted">
          <span
            className={cn(
              'block h-full rounded-full',
              row.uncategorized ? 'bg-amber-400/70' : 'bg-primary/70',
            )}
            style={{ width: `${share}%` }}
          />
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 self-start pt-0.5">
        <span className="text-base font-semibold tabular-nums">
          {formatMoney(row.sum)}
        </span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </span>
    </button>
  )
}

/** A leaf expense list for a specific server scope (rows only here). */
function ExpenseListBody({
  ledgerId,
  familyId,
  catRefs,
  members,
  filter,
  withDate,
  onEdit,
}: {
  ledgerId: string
  familyId: string
  catRefs: Map<string, CatRef>
  members: FamilyMember[]
  filter: ExpenseRowsFilter
  withDate: boolean
  onEdit: (e: Expense) => void
}) {
  void familyId
  const rows = useLedgerExpenseRowsQuery(ledgerId, filter)

  if (rows.isPending) {
    return <RowsSkeleton />
  }

  const expenses = rows.data ?? []
  if (expenses.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <Receipt className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium">No expenses here</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="flex flex-col py-1">
        {expenses.map((expense) => (
          <ExpenseListItem
            key={expense.id}
            expense={expense}
            members={members}
            categoryLabelFor={(id) => categoryPathOf(catRefs, id)}
            withDate={withDate}
            onEdit={() => onEdit(expense)}
          />
        ))}
      </CardContent>
    </Card>
  )
}

function RowsSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
        ))}
      </CardContent>
    </Card>
  )
}

function Crumbs({
  drill,
  catRefs,
  onDrill,
}: {
  drill: Drill
  catRefs: Map<string, CatRef>
  onDrill: (d: Drill) => void
}) {
  const crumbs: { label: string; onClick?: () => void }[] = []
  const nameOf = (id: string) => catRefs.get(id)?.name ?? '…'

  if (drill.kind === 'cat' || drill.kind === 'cat-expenses') {
    drill.path.forEach((id, i) => {
      crumbs.push({
        label: nameOf(id),
        onClick:
          i < drill.path.length - 1
            ? () => onDrill({ kind: 'cat', path: drill.path.slice(0, i + 1) })
            : undefined,
      })
    })
    if (drill.kind === 'cat-expenses') crumbs.push({ label: 'Expenses' })
  } else if (drill.kind === 'date') {
    crumbs.push({ label: dayLabel(drill.dateKey) })
  } else if (drill.kind === 'uncategorized') {
    crumbs.push({ label: 'Uncategorized' })
  }

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm">
      <button
        type="button"
        onClick={() => onDrill({ kind: 'root' })}
        className="font-medium text-foreground underline-offset-2 hover:underline"
      >
        All
      </button>
      {crumbs.map((c, i) => (
        <span key={`${c.label}-${i}`} className="flex items-center gap-1">
          <ChevronRight className="size-3.5 text-muted-foreground" />
          {c.onClick ? (
            <button
              type="button"
              onClick={c.onClick}
              className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {c.label}
            </button>
          ) : (
            <span className="text-muted-foreground">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

// ---------- edit / delete expense ----------

function ExpenseEditorDialog({
  expense,
  ledgerId,
  familyId,
  categoryOptions,
  onClose,
}: {
  expense: Expense
  ledgerId: string
  familyId: string
  categoryOptions: { id: string; name: string; depth: number }[]
  onClose: () => void
}) {
  const updateExpense = useUpdateExpenseMutation()
  const deleteExpense = useDeleteExpenseMutation()
  const [amount, setAmount] = useState(String(expense.amount))
  const [description, setDescription] = useState(expense.description ?? '')
  const [categoryId, setCategoryId] = useState(expense.category?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const numericAmount = Number(amount)
  const valid =
    Number.isFinite(numericAmount) && numericAmount >= 0 && amount.trim() !== ''
  const saving = updateExpense.isPending
  const deleting = deleteExpense.isPending

  async function save() {
    setError(null)
    if (!valid) {
      setError('Enter a valid amount')
      return
    }
    try {
      await updateExpense.mutateAsync({
        expenseId: expense.id,
        ledgerId,
        familyId,
        data: {
          amount: numericAmount,
          description: description.trim() || null,
          categoryId: categoryId || null,
        },
      })
      toast.success('Expense updated')
      onClose()
    } catch {
      // Error toast is shown by the mutation's onError.
    }
  }

  async function remove() {
    try {
      await deleteExpense.mutateAsync({
        expenseId: expense.id,
        ledgerId,
        familyId,
      })
      toast.success('Expense deleted')
      onClose()
    } catch {
      // Error toast is shown by the mutation's onError.
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit expense</DialogTitle>
          <DialogDescription>
            Update the amount, description or category.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-amount">Amount</Label>
            <Input
              id="edit-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(sanitizeAmount(e.target.value))}
              aria-invalid={error ? true : undefined}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-description">Description</Label>
            <Input
              id="edit-description"
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-category">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="edit-category" className="w-full">
                <SelectValue placeholder="Uncategorized" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Uncategorized</SelectItem>
                {categoryOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span style={{ paddingLeft: c.depth * 14 }}>{c.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          {confirmingDelete ? (
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium">
                Delete this expense permanently?
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={deleting}
                  onClick={() => setConfirmingDelete(false)}
                >
                  Keep
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleting}
                  onClick={() => void remove()}
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={saving}
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 />
                Delete
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  disabled={saving}
                  onClick={onClose}
                >
                  Cancel
                </Button>
                <Button onClick={() => void save()} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Keep only characters that make sense for an amount. */
function sanitizeAmount(raw: string) {
  const cleaned = raw.replace(/[^\d.]/g, '')
  const [int, ...rest] = cleaned.split('.')
  const intTrimmed = int.slice(0, 12)
  if (rest.length === 0)
    return cleaned.includes('.') ? `${intTrimmed}.` : intTrimmed
  return `${intTrimmed}.${rest.join('').slice(0, 2)}`
}

// ---------- helpers ----------

function buildCatRefs(roots: CategoryNode[]): Map<string, CatRef> {
  const map = new Map<string, CatRef>()
  const walk = (nodes: CategoryNode[], parentId: string | null) => {
    for (const n of nodes) {
      map.set(n.id, { name: n.name, parentId })
      walk(n.children, n.id)
    }
  }
  walk(roots, null)
  return map
}

function flattenOptions(
  roots: CategoryNode[],
): { id: string; name: string; depth: number }[] {
  const out: { id: string; name: string; depth: number }[] = []
  const walk = (nodes: CategoryNode[], depth: number) => {
    for (const n of nodes) {
      out.push({ id: n.id, name: n.name, depth })
      walk(n.children, depth + 1)
    }
  }
  walk(roots, 0)
  return out
}

function categoryPathOf(catRefs: Map<string, CatRef>, id: string) {
  const parts: string[] = []
  let cur: string | null = id
  while (cur) {
    const ref = catRefs.get(cur)
    if (!ref) break
    parts.unshift(ref.name)
    cur = ref.parentId
  }
  return parts.join(' › ') || 'Category'
}

function sortGroupRows(rows: GroupRowModel[], sortId: SortId): GroupRowModel[] {
  const sorted = [...rows]
  if (sortId === 'highest') sorted.sort((a, b) => b.sum - a.sum)
  else if (sortId === 'lowest') sorted.sort((a, b) => a.sum - b.sum)
  else {
    sorted.sort((a, b) =>
      a.sortDate && b.sortDate
        ? a.sortDate.localeCompare(b.sortDate) * (sortId === 'newest' ? -1 : 1)
        : a.label.localeCompare(b.label),
    )
  }
  return sorted
}

// ---------- dates ----------

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function parseDay(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function dayStart(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function dayEnd(d: Date) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

function dayLabel(key: string) {
  const date = parseDay(key)
  const includeYear = date.getFullYear() !== new Date().getFullYear()
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  })
}

function resolveRange(
  preset: PresetId,
  now: Date,
  monthVal: string,
  customFrom: string,
  customTo: string,
): { from: string; to: string; label: string } {
  const addDays = (d: Date, n: number) => {
    const x = new Date(d)
    x.setDate(x.getDate() + n)
    return x
  }
  const mondayOf = (d: Date) => {
    const offset = (d.getDay() + 6) % 7
    return dayStart(addDays(d, -offset))
  }
  const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
  const monthEnd = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)

  let from: Date
  let to: Date
  let label = ''

  switch (preset) {
    case 'this-week': {
      from = mondayOf(now)
      to = dayEnd(now)
      label = 'This week'
      break
    }
    case 'last-week': {
      const monday = mondayOf(now)
      from = addDays(monday, -7)
      to = dayEnd(addDays(monday, -1))
      label = 'Last week'
      break
    }
    case 'two-weeks-ago': {
      const monday = mondayOf(now)
      from = addDays(monday, -14)
      to = dayEnd(addDays(monday, -8))
      label = '2 weeks ago'
      break
    }
    case 'this-month': {
      from = monthStart(now)
      to = dayEnd(now)
      label = 'This month'
      break
    }
    case 'last-month': {
      const last = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      from = monthStart(last)
      to = monthEnd(last)
      label = 'Last month'
      break
    }
    case 'month': {
      const [y, m] = (monthVal || `${now.getFullYear()}-${pad(now.getMonth() + 1)}`)
        .split('-')
        .map(Number)
      from = monthStart(new Date(y, m - 1, 1))
      to = monthEnd(new Date(y, m - 1, 1))
      label = new Date(y, m - 1, 1).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      })
      break
    }
    case 'custom': {
      const fromDate = customFrom ? parseDay(customFrom) : monthStart(now)
      const toDate = customTo ? parseDay(customTo) : now
      from = dayStart(fromDate)
      to = dayEnd(toDate)
      label =
        customFrom && customTo
          ? `${fmtDay(fromDate)} – ${fmtDay(toDate)}`
          : 'Custom range'
      break
    }
  }
  return { from: from.toISOString(), to: to.toISOString(), label }
}

function fmtDay(d: Date) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
