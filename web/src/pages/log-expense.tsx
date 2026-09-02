import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useActiveLedgerRow } from '@/lib/active-ledger'
import { useCreateExpenseMutation, useFamilyQuery } from '@/lib/queries'
import { toast } from '@/lib/stores'
import { flattenCategories, guessCategories } from '@/lib/category-helpers'
import { formatMoney } from '@/lib/format'
import { useIsMobile } from '@/lib/use-media'
import type { CategoryNode, MyLedger } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Numpad } from '@/components/numpad'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Sparkles,
  Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const CURRENCY = 'ETB'
const TAX_RATE = 0.15

const STEPS = [
  { id: 1, label: 'Amount' },
  { id: 2, label: 'Details' },
  { id: 3, label: 'Category' },
]

export function LogExpensePage() {
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

  // `key` resets the draft whenever the active ledger changes.
  return <ExpenseFlow key={ledger.id} ledger={ledger} />
}

// ---------- the 3-step wizard ----------

function ExpenseFlow({ ledger }: { ledger: MyLedger }) {
  const isMobile = useIsMobile()
  const { data: family, isPending: familyPending } = useFamilyQuery(
    ledger.familyId,
  )
  const createExpense = useCreateExpenseMutation()

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [amount, setAmount] = useState('0')
  const [withTax, setWithTax] = useState(false)
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')

  const categories = useMemo(() => family?.categories ?? [], [family])
  const suggestions = useMemo(
    () => guessCategories(description, categories),
    [description, categories],
  )

  const baseAmount = Number(amount)
  const amountValid = Number.isFinite(baseAmount) && baseAmount > 0
  // What actually gets recorded: the entered amount, or amount + 15% tax.
  const recordedAmount = withTax ? round2(baseAmount * (1 + TAX_RATE)) : baseAmount
  const saving = createExpense.isPending

  function nextFromAmount() {
    if (!amountValid) return
    setStep(2)
  }

  function nextFromDetails() {
    // Categories still loading: wait so we know whether to show step 3.
    if (familyPending) return
    // No categories in this family? Skip the optional step and save.
    if (categories.length === 0) {
      void save()
      return
    }
    setStep(3)
  }

  async function save() {
    if (!amountValid || saving || !description.trim()) return
    try {
      await createExpense.mutateAsync({
        ledgerId: ledger.id,
        familyId: ledger.familyId,
        data: {
          amount: recordedAmount,
          description: description.trim(),
          categoryId: categoryId || null,
          occurredAt: new Date().toISOString(),
        },
      })
      // Ready for the next expense.
      setAmount('0')
      setWithTax(false)
      setDescription('')
      setCategoryId('')
      setStep(1)
      toast.success('Expense recorded')
    } catch {
      // Error toast is shown by the mutation's onError.
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Log expense</h1>
        <p className="truncate text-sm text-muted-foreground">
          {ledger.familyName}
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div
              className={cn(
                'flex size-6 items-center justify-center rounded-full text-xs font-semibold',
                step >= s.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {step > s.id ? <Check className="size-3.5" /> : s.id}
            </div>
            <span
              className={cn(
                'text-xs',
                step === s.id
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && <span className="h-px w-6 bg-border sm:w-10" />}
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-5 py-5">
          {step === 1 && (
            <AmountStep
              amount={amount}
              onChange={setAmount}
              withTax={withTax}
              onTaxChange={setWithTax}
              recordedAmount={recordedAmount}
              isMobile={isMobile}
              amountValid={amountValid}
              onNext={nextFromAmount}
            />
          )}
          {step === 2 && (
            <DetailsStep
              finalAmount={recordedAmount}
              withTax={withTax}
              description={description}
              onChangeDescription={setDescription}
              categoriesPending={familyPending}
              onBack={() => setStep(1)}
              onNext={nextFromDetails}
            />
          )}
          {step === 3 && (
            <CategoryStep
              categories={categories}
              suggestions={suggestions}
              categoryId={categoryId}
              onChange={setCategoryId}
              saving={saving}
              onBack={() => setStep(2)}
              onSave={() => void save()}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------- step 1: amount ----------

function AmountStep({
  amount,
  onChange,
  withTax,
  onTaxChange,
  recordedAmount,
  isMobile,
  amountValid,
  onNext,
}: {
  amount: string
  onChange: (v: string) => void
  withTax: boolean
  onTaxChange: (v: boolean) => void
  recordedAmount: number
  isMobile: boolean
  amountValid: boolean
  onNext: () => void
}) {
  return (
    <>
      <div className="flex flex-col items-center gap-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          How much?
        </p>
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-bold tracking-tight tabular-nums">
            {formatAmountInput(amount)}
          </span>
          <span className="text-sm text-muted-foreground">{CURRENCY}</span>
        </div>
      </div>

      <TaxToggle
        withTax={withTax}
        onChange={onTaxChange}
        baseAmount={Number(amount)}
        recordedAmount={recordedAmount}
      />

      {isMobile ? (
        <>
          <Numpad value={amount} onChange={onChange} />
          <div className="flex items-center justify-between">
            {amount !== '0' ? (
              <button
                type="button"
                onClick={() => onChange('0')}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Clear
              </button>
            ) : (
              <span />
            )}
            <Button disabled={!amountValid} onClick={onNext}>
              Next
              <ArrowRight />
            </Button>
          </div>
        </>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (amountValid) onNext()
          }}
        >
          <Input
            autoFocus
            inputMode="decimal"
            placeholder="0.00"
            className="h-12 text-center text-2xl font-semibold tabular-nums"
            value={amount}
            onChange={(e) => onChange(sanitizeAmount(e.target.value))}
            onFocus={(e) => {
              if (amount === '0') e.target.select()
            }}
          />
          <Button type="submit" size="lg" disabled={!amountValid}>
            Continue
            <ArrowRight />
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Press Enter to continue
          </p>
        </form>
      )}
    </>
  )
}

// ---------- step 1 helper: tax toggle ----------

function TaxToggle({
  withTax,
  onChange,
  baseAmount,
  recordedAmount,
}: {
  withTax: boolean
  onChange: (v: boolean) => void
  baseAmount: number
  recordedAmount: number
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium select-none">
        <input
          type="checkbox"
          className="size-4"
          style={{ accentColor: 'var(--primary)' }}
          checked={withTax}
          onChange={(e) => onChange(e.target.checked)}
        />
        Add 15% tax
      </label>
      {withTax && (
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">
            {formatMoney(recordedAmount)}
          </span>{' '}
          will be recorded ({formatMoney(baseAmount)} + 15% tax)
        </p>
      )}
    </div>
  )
}

// ---------- step 2: item details ----------

function DetailsStep({
  finalAmount,
  withTax,
  description,
  onChangeDescription,
  categoriesPending,
  onBack,
  onNext,
}: {
  finalAmount: number
  withTax: boolean
  description: string
  onChangeDescription: (v: string) => void
  categoriesPending: boolean
  onBack: () => void
  onNext: () => void
}) {
  const [tried, setTried] = useState(false)
  const hasDescription = description.trim().length > 0

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          What was it?
        </p>
        <span className="font-semibold tabular-nums">
          {formatMoney(finalAmount)}
        </span>
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!hasDescription) {
            setTried(true)
            return
          }
          setTried(false)
          onNext()
        }}
      >
        <div className="flex flex-col gap-2">
          <Input
            autoFocus
            placeholder="What did you buy? e.g. groceries, taxi, coffee"
            maxLength={200}
            className="h-12 text-base"
            value={description}
            onChange={(e) => onChangeDescription(e.target.value)}
            aria-invalid={tried && !hasDescription ? true : undefined}
          />
          {tried && !hasDescription && (
            <p className="text-sm text-destructive">
              Add what the expense was for — you’ll need it to categorize
              later.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-2 py-0.5">
            Today · paid by you
          </span>
          {withTax && (
            <span className="rounded-full bg-muted px-2 py-0.5">
              Amount includes 15% tax
            </span>
          )}
          <span className="rounded-full bg-muted px-2 py-0.5">
            Category optional
          </span>
        </div>
        <div className="flex items-center justify-between">
          <Button type="button" variant="ghost" onClick={onBack}>
            <ArrowLeft />
            Back
          </Button>
          <Button
            type="submit"
            disabled={categoriesPending}
          >
            {categoriesPending ? 'Loading…' : 'Next'}
            {!categoriesPending && <ArrowRight />}
          </Button>
        </div>
      </form>
    </div>
  )
}

// ---------- step 3: optional category ----------

function CategoryStep({
  categories,
  suggestions,
  categoryId,
  onChange,
  saving,
  onBack,
  onSave,
}: {
  categories: CategoryNode[]
  suggestions: { id: string; name: string; path: string; depth: number }[]
  categoryId: string
  onChange: (id: string) => void
  saving: boolean
  onBack: () => void
  onSave: () => void
}) {
  const flat = flattenCategories(categories)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Category
        </p>
        <p className="text-sm text-muted-foreground">
          Only if it’s obvious — you can always categorize later.
        </p>
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-foreground/80">
            <Sparkles className="size-3.5" />
            Looks like
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onChange(categoryId === s.id ? '' : s.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                  categoryId === s.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-background hover:bg-muted',
                )}
              >
                {s.name}
                {categoryId === s.id && <Check className="size-3.5" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {flat.length > 0 && (
        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
          {flat.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(categoryId === c.id ? '' : c.id)}
              style={{ paddingLeft: 8 + c.depth * 16 }}
              className={cn(
                'flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors',
                categoryId === c.id
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted',
              )}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{c.name}</span>
                {c.depth > 0 && (
                  <span className="block truncate text-xs opacity-70">
                    {c.path.split(' › ').slice(0, -1).join(' › ')}
                  </span>
                )}
              </span>
              {categoryId === c.id && <Check className="size-4 shrink-0" />}
            </button>
          ))}
        </div>
      )}

      {flat.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No categories in this family yet — save it uncategorized for now.
        </p>
      )}

      <div className="flex items-center justify-between border-t pt-3">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft />
          Back
        </Button>
        <Button type="button" onClick={onSave} disabled={saving}>
          {saving
            ? 'Saving…'
            : categoryId
              ? 'Save expense'
              : 'Save without category'}
        </Button>
      </div>
    </div>
  )
}

// ---------- helpers ----------

/** Round money to two decimals. */
function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** "1234.5" → "1,234.5" (grouping only, keeps the typed decimals). */
function formatAmountInput(value: string) {
  if (!value || value === '0') return value || '0'
  const [intPart, decPart] = value.split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return decPart !== undefined ? `${grouped}.${decPart}` : grouped
}

/** Keep only characters that make sense for an amount. */
function sanitizeAmount(raw: string) {
  const cleaned = raw.replace(/[^\d.]/g, '')
  const [int, ...rest] = cleaned.split('.')
  const intTrimmed = int.slice(0, 12)
  if (rest.length === 0) return cleaned.includes('.') ? `${intTrimmed}.` : intTrimmed
  return `${intTrimmed}.${rest.join('').slice(0, 2)}`
}
