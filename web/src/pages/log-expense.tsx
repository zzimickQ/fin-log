import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useCategorySuggestionsQuery,
  useCreateExpenseMutation,
  useLedgerCategoriesQuery,
  useLedgerSuggestionsQuery,
  useMyLedgersQuery,
} from '@/lib/queries'
import { toast } from '@/lib/stores'
import { flattenCategories, guessCategories } from '@/lib/category-helpers'
import { formatMoney } from '@/lib/format'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { useIsMobile } from '@/lib/use-media'
import type {
  CategoryNode,
  CategorySuggestion,
  LedgerSuggestion,
  MyLedger,
} from '@/lib/types'
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
  { id: 3, label: 'Ledger' },
  { id: 4, label: 'Category' },
]

/** A category suggestion normalized for display (TypeSafe or heuristic). */
interface DisplaySuggestion {
  id: string
  name: string
  path: string
  depth: number
  /** 0 when the suggestion came from the local heuristic. */
  probability: number
}

/** A ledger suggestion normalized for display (TypeSafe or heuristic). */
interface DisplayLedgerSuggestion {
  ledgerId: string
  name: string
  familyName: string
  /** 0 when the suggestion came from the local heuristic. */
  probability: number
}

export function LogExpensePage() {
  const { data, isPending } = useMyLedgersQuery()
  const ledgers = data?.ledgers ?? []

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  if (ledgers.length === 0) {
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

  // The wizard picks its own ledger, so it is not keyed to the active one.
  return <ExpenseFlow ledgers={ledgers} />
}

// ---------- the 4-step wizard ----------

function ExpenseFlow({ ledgers }: { ledgers: MyLedger[] }) {
  const isMobile = useIsMobile()
  const createExpense = useCreateExpenseMutation()

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [amount, setAmount] = useState('0')
  const [withTax, setWithTax] = useState(false)
  const [description, setDescription] = useState('')
  // null = untouched, so a confident prediction can pre-select the ledger.
  // A string is an explicit choice and always wins.
  const [ledgerSelection, setLedgerSelection] = useState<string | null>(null)
  // null = untouched, so a confident prediction can auto-select the category.
  // A string (including '') is an explicit choice and always wins.
  const [categorySelection, setCategorySelection] = useState<string | null>(null)

  const baseAmount = Number(amount)
  const amountValid = Number.isFinite(baseAmount) && baseAmount > 0
  // What actually gets recorded: the entered amount, or amount + 15% tax.
  const recordedAmount = withTax ? round2(baseAmount * (1 + TAX_RATE)) : baseAmount
  const saving = createExpense.isPending

  // TypeSafe predictions are debounced so the model is not called on every
  // keystroke. The ledger and category steps both key off the same text.
  const debouncedDescription = useDebouncedValue(description.trim(), 350)

  // --- ledger suggestions --------------------------------------------------
  const ledgerSuggestionsQuery = useLedgerSuggestionsQuery({
    description: debouncedDescription,
    amount: recordedAmount,
  })
  const ledgerModelResult = ledgerSuggestionsQuery.data
  // Auto-select: a confident prediction (or the only ledger) supplies the
  // ledger until the user makes an explicit choice.
  const autoLedgerId = ledgerModelResult?.autoAssignLedgerId ?? ''
  const ledgerId = ledgerSelection ?? autoLedgerId
  const ledger = ledgers.find((l) => l.id === ledgerId) ?? null
  const ledgerAutoAssigned = ledgerSelection === null && autoLedgerId !== ''

  const ledgerSuggestions: DisplayLedgerSuggestion[] = useMemo(
    () =>
      ledgerModelResult && !ledgerModelResult.unknown
        ? ledgerModelResult.suggestions.map(toDisplayLedgerSuggestion)
        : [],
    [ledgerModelResult],
  )

  const ledgerHint = useMemo(() => {
    if (ledgerAutoAssigned) {
      return 'Pre-selected from the description. Change it if it looks wrong.'
    }
    if (ledgerModelResult?.degraded && ledgerModelResult.suggestions.length > 0) {
      return 'Basic match from your ledger data.'
    }
    return undefined
  }, [ledgerModelResult, ledgerAutoAssigned])

  // --- category suggestions (scoped to the chosen ledger) ------------------
  const categoriesQuery = useLedgerCategoriesQuery(ledger?.id ?? null)
  const categories = useMemo(
    () => categoriesQuery.data?.categories ?? [],
    [categoriesQuery.data],
  )

  const suggestionsQuery = useCategorySuggestionsQuery(ledger?.id ?? null, {
    description: debouncedDescription,
    amount: recordedAmount,
  })
  const localSuggestions = useMemo(
    () => (ledger ? guessCategories(description, categories) : []),
    [ledger, description, categories],
  )

  const modelResult = suggestionsQuery.data
  const suggestions: DisplaySuggestion[] = useMemo(() => {
    if (modelResult) {
      // The model explicitly said nothing fits — do not fall back to a guess.
      if (modelResult.unknown) return []
      return modelResult.suggestions.map(toDisplaySuggestion)
    }
    return localSuggestions.map((c) => ({ ...c, probability: 0 }))
  }, [modelResult, localSuggestions])

  // Auto-assign: a confident server prediction supplies the category until the
  // user makes an explicit choice (`categorySelection` becomes non-null).
  const autoCategoryId = modelResult?.autoAssignCategoryId ?? ''
  const categoryId = categorySelection ?? autoCategoryId
  const autoAssigned = categorySelection === null && autoCategoryId !== ''

  const suggestionHint = useMemo(() => {
    if (!ledger) return undefined
    if (modelResult?.unknown) {
      return 'No existing category fits this expense — it will be saved as unknown (uncategorized).'
    }
    if (autoAssigned) {
      return "Auto-selected from this ledger's data. Change it if it looks wrong."
    }
    if (modelResult?.degraded && modelResult.suggestions.length > 0) {
      return 'Basic match from your ledger data.'
    }
    return undefined
  }, [ledger, modelResult, autoAssigned])

  function selectLedger(id: string) {
    setLedgerSelection(id)
    // Categories are per-ledger, so a category chosen for another ledger must
    // not carry over.
    setCategorySelection(null)
  }

  function selectCategory(id: string) {
    setCategorySelection(id)
  }

  function nextFromAmount() {
    if (!amountValid) return
    setStep(2)
  }

  function nextFromDetails() {
    if (!description.trim()) return
    setStep(3)
  }

  function nextFromLedger() {
    if (!ledger) return
    setStep(4)
  }

  async function save() {
    if (!amountValid || saving || !description.trim() || !ledger) return
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
      setLedgerSelection(null)
      setCategorySelection(null)
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
          {ledger
            ? `${ledger.name} · ${ledger.familyName}`
            : 'Choose a ledger for this expense'}
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
            {i < STEPS.length - 1 && <span className="h-px w-4 bg-border sm:w-8" />}
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
              onBack={() => setStep(1)}
              onNext={nextFromDetails}
            />
          )}
          {step === 3 && (
            <LedgerStep
              ledgers={ledgers}
              suggestions={ledgerSuggestions}
              ledgerId={ledgerId}
              onChange={selectLedger}
              hint={ledgerHint}
              onBack={() => setStep(2)}
              onNext={nextFromLedger}
            />
          )}
          {step === 4 && (
            <CategoryStep
              categories={categories}
              suggestions={suggestions}
              categoryId={categoryId}
              onChange={selectCategory}
              saving={saving}
              hint={suggestionHint}
              onBack={() => setStep(3)}
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
  onBack,
  onNext,
}: {
  finalAmount: number
  withTax: boolean
  description: string
  onChangeDescription: (v: string) => void
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
        </div>
        <div className="flex items-center justify-between">
          <Button type="button" variant="ghost" onClick={onBack}>
            <ArrowLeft />
            Back
          </Button>
          <Button type="submit">
            Next
            <ArrowRight />
          </Button>
        </div>
      </form>
    </div>
  )
}

// ---------- step 3: ledger (suggested) ----------

function LedgerStep({
  ledgers,
  suggestions,
  ledgerId,
  onChange,
  hint,
  onBack,
  onNext,
}: {
  ledgers: MyLedger[]
  suggestions: DisplayLedgerSuggestion[]
  ledgerId: string
  onChange: (id: string) => void
  hint?: string
  onBack: () => void
  onNext: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Ledger
        </p>
        <p className="text-sm text-muted-foreground">
          Which ledger should this expense go to?
        </p>
      </div>

      {(suggestions.length > 0 || hint) && (
        <div className="flex flex-col gap-1.5">
          {suggestions.length > 0 && (
            <>
              <p className="flex items-center gap-1.5 text-xs font-medium text-foreground/80">
                <Sparkles className="size-3.5" />
                Looks like
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s.ledgerId}
                    type="button"
                    onClick={() => onChange(s.ledgerId)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                      ledgerId === s.ledgerId
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-background hover:bg-muted',
                    )}
                  >
                    {s.name}
                    <span className="text-xs opacity-70">{s.familyName}</span>
                    {s.probability > 0 && (
                      <span className="text-xs tabular-nums opacity-70">
                        {Math.round(s.probability * 100)}%
                      </span>
                    )}
                    {ledgerId === s.ledgerId && <Check className="size-3.5" />}
                  </button>
                ))}
              </div>
            </>
          )}
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      )}

      <div className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
        {ledgers.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => onChange(l.id)}
            className={cn(
              'flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors',
              ledgerId === l.id
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted',
            )}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{l.name}</span>
              <span className="block truncate text-xs opacity-70">
                {l.familyName}
                {l.expenseCount > 0
                  ? ` · ${l.expenseCount} expense${l.expenseCount === 1 ? '' : 's'}`
                  : ''}
              </span>
            </span>
            {ledgerId === l.id && <Check className="size-4 shrink-0" />}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between border-t pt-3">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft />
          Back
        </Button>
        <Button type="button" onClick={onNext} disabled={!ledgerId}>
          Next
          <ArrowRight />
        </Button>
      </div>
    </div>
  )
}

// ---------- step 4: optional category ----------

function CategoryStep({
  categories,
  suggestions,
  categoryId,
  onChange,
  saving,
  hint,
  onBack,
  onSave,
}: {
  categories: CategoryNode[]
  suggestions: DisplaySuggestion[]
  categoryId: string
  onChange: (id: string) => void
  saving: boolean
  hint?: string
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

      {(suggestions.length > 0 || hint) && (
        <div className="flex flex-col gap-1.5">
          {suggestions.length > 0 && (
            <>
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
                    {s.probability > 0 && (
                      <span className="text-xs tabular-nums opacity-70">
                        {Math.round(s.probability * 100)}%
                      </span>
                    )}
                    {categoryId === s.id && <Check className="size-3.5" />}
                  </button>
                ))}
              </div>
            </>
          )}
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
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
          No categories in this ledger yet — save it uncategorized for now.
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

/** Normalize an API category suggestion into the shape the chips render. */
function toDisplaySuggestion(s: CategorySuggestion): DisplaySuggestion {
  return {
    id: s.categoryId,
    name: s.name,
    path: s.path,
    depth: Math.max(0, s.path.split(' › ').length - 1),
    probability: s.probability,
  }
}

/** Normalize an API ledger suggestion into the shape the chips render. */
function toDisplayLedgerSuggestion(
  s: LedgerSuggestion,
): DisplayLedgerSuggestion {
  return {
    ledgerId: s.ledgerId,
    name: s.name,
    familyName: s.familyName,
    probability: s.probability,
  }
}

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
