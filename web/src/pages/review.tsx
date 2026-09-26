import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useActiveLedgerRow } from '@/lib/active-ledger'
import {
  useDeleteIncomingMutation,
  useIncomingQuery,
  useLabelIncomingMutation,
  useLedgerCategoriesQuery,
  useMoveIncomingMutation,
} from '@/lib/queries'
import { toast } from '@/lib/stores'
import { flattenCategories } from '@/lib/category-helpers'
import { formatDateTime, formatMoney } from '@/lib/format'
import type { StagedTransaction } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import {
  ArrowRight,
  Check,
  Inbox,
  PencilLine,
  Tag,
  Trash2,
  Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const PAGE = 100

/**
 * Review queue for transactions a phone automation captured from bank
 * messages.
 *
 * The message never says what the spending was for, so nothing here is a
 * finished expense: the reviewer names it, decides which ledger it belongs to,
 * optionally files it under a category, or discards it as not-their-spending.
 * Moving is what turns a staged row into an expense — and assigning a category
 * as part of that move is the completion signal that clears it from this list.
 */
export function ReviewPage() {
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
          Create a ledger before sorting captured transactions into it.
        </p>
        <Button asChild size="sm">
          <Link to="/admin/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    )
  }

  return <ReviewFlow />
}

function ReviewFlow() {
  const { ledgers, ledger: activeLedger } = useActiveLedgerRow()
  const [limit, setLimit] = useState(PAGE)
  const { data, isPending, isError, error } = useIncomingQuery(limit)

  const transactions = useMemo(() => data?.transactions ?? [], [data])
  const total = data?.total ?? 0

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  // Which ledger the batch moves into. Defaults to the active ledger, which is
  // shown in the picker, so the common case needs no choice.
  const [ledgerChoice, setLedgerChoice] = useState('')
  const [categoryChoice, setCategoryChoice] = useState('')
  const [labelling, setLabelling] = useState<StagedTransaction | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const ledgerId = ledgerChoice || activeLedger?.id || ''
  const categoriesQuery = useLedgerCategoriesQuery(ledgerId || null)
  const flatCategories = useMemo(
    () => flattenCategories(categoriesQuery.data?.categories ?? []),
    [categoriesQuery.data],
  )

  const moveIncoming = useMoveIncomingMutation()
  const deleteIncoming = useDeleteIncomingMutation()

  const selectedSum = useMemo(
    () =>
      transactions
        .filter((t) => selected.has(t.id))
        .reduce((acc, t) => acc + t.amount, 0),
    [transactions, selected],
  )

  const allSelected =
    transactions.length > 0 && selected.size === transactions.length
  const canMove = selected.size > 0 && ledgerId !== ''

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(transactions.map((t) => t.id)))
  }

  function clearSelection() {
    setSelected(new Set())
    setCategoryChoice('')
  }

  async function move() {
    if (!canMove || moveIncoming.isPending) return
    try {
      const { moved } = await moveIncoming.mutateAsync({
        ids: [...selected],
        ledgerId,
        categoryId: categoryChoice || null,
      })
      const categoryName = flatCategories.find((c) => c.id === categoryChoice)?.name
      const target = ledgers.find((l) => l.id === ledgerId)
      clearSelection()
      toast.success(
        categoryName
          ? `Moved ${moved} to ${target?.name ?? 'ledger'} · ${categoryName}`
          : `Moved ${moved} to ${target?.name ?? 'ledger'} — still uncategorized`,
      )
    } catch {
      // The mutation's onError already surfaced the message.
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Review</h1>
          <p className="text-sm text-muted-foreground">
            Transactions captured from bank messages
          </p>
        </div>
        {total > 0 && (
          <Badge
            variant="outline"
            className="shrink-0 text-amber-600 dark:text-amber-400"
          >
            {total} to review
          </Badge>
        )}
      </div>

      {isError && <p className="text-sm text-destructive">{error.message}</p>}

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading transactions…</p>
      ) : transactions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Inbox className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">Nothing to review</p>
            <p className="text-sm text-muted-foreground">
              Bank messages forwarded by your phone automation land here, once
              you set one up with an API key.
            </p>
            <div className="mt-2 flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/admin/api-keys">API keys</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/log">
                  <PencilLine />
                  Log an expense
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              {allSelected ? 'Clear selection' : 'Select all'}
            </button>
            {selected.size > 0 && (
              <span className="text-xs text-muted-foreground">
                {selected.size} selected
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {transactions.map((transaction) => (
              <ReviewRow
                key={transaction.id}
                transaction={transaction}
                checked={selected.has(transaction.id)}
                onToggle={() => toggle(transaction.id)}
                onLabel={() => setLabelling(transaction)}
              />
            ))}
          </div>

          {total > transactions.length && (
            <div className="flex flex-col items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLimit((l) => l + PAGE)}
              >
                Load more ({total - transactions.length} remaining)
              </Button>
              <p className="text-xs text-muted-foreground">
                Only loaded transactions can be moved or deleted in one batch.
              </p>
            </div>
          )}

          {selected.size > 0 && (
            <div className="sticky bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-10 md:bottom-4">
              <Card className="shadow-lg">
                <CardContent className="flex flex-col gap-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <Tag className="size-4" />
                      {selected.size} selected
                      <span className="font-semibold tabular-nums">
                        · {formatMoney(selectedSum)}
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    >
                      Clear
                    </button>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Select
                      value={ledgerId}
                      onValueChange={(v) => {
                        setLedgerChoice(v)
                        // Categories belong to one ledger; the old choice is
                        // meaningless in the new one.
                        setCategoryChoice('')
                      }}
                      disabled={moveIncoming.isPending}
                    >
                      <SelectTrigger className="w-full" aria-label="Ledger for the batch">
                        <SelectValue placeholder="Ledger…" />
                      </SelectTrigger>
                      <SelectContent>
                        {ledgers.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={categoryChoice}
                      onValueChange={setCategoryChoice}
                      disabled={moveIncoming.isPending || flatCategories.length === 0}
                    >
                      <SelectTrigger className="w-full" aria-label="Category for the batch">
                        <SelectValue
                          placeholder={
                            flatCategories.length === 0
                              ? 'No categories in this ledger'
                              : 'Category (optional)…'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {flatCategories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            <span style={{ paddingLeft: c.depth * 14 }}>
                              {c.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="lg"
                      className="flex-1"
                      disabled={!canMove || moveIncoming.isPending}
                      onClick={() => void move()}
                    >
                      <ArrowRight />
                      {moveIncoming.isPending
                        ? 'Moving…'
                        : `Move ${selected.size} to ledger`}
                    </Button>
                    <Button
                      size="lg"
                      variant="destructive"
                      disabled={deleteIncoming.isPending}
                      onClick={() => setConfirmingDelete(true)}
                    >
                      <Trash2 />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      {labelling && (
        <LabelDialog
          transaction={labelling}
          onClose={() => setLabelling(null)}
        />
      )}

      {confirmingDelete && (
        <Dialog open onOpenChange={(open) => !open && setConfirmingDelete(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>
                Delete {selected.size} transaction
                {selected.size === 1 ? '' : 's'}?
              </DialogTitle>
              <DialogDescription>
                This discards the captured messages and writes nothing to any
                ledger. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={deleteIncoming.isPending}
                onClick={() =>
                  void deleteIncoming
                    .mutateAsync([...selected])
                    .then(({ deleted }) => {
                      clearSelection()
                      setConfirmingDelete(false)
                      toast.success(
                        `Deleted ${deleted} transaction${deleted === 1 ? '' : 's'}`,
                      )
                    })
                }
              >
                {deleteIncoming.isPending ? 'Deleting…' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// ---------- one staged transaction ----------

function ReviewRow({
  transaction,
  checked,
  onToggle,
  onLabel,
}: {
  transaction: StagedTransaction
  checked: boolean
  onToggle: () => void
  onLabel: () => void
}) {
  // The label if one has been given, else the bank that sent the message —
  // the temporary label until someone names the spending.
  const title = transaction.description ?? transaction.source ?? 'Bank message'

  return (
    <div
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border bg-card px-3 py-3 transition-colors',
        checked
          ? 'border-primary bg-primary/[0.04] ring-1 ring-primary/30'
          : 'border-border hover:bg-muted/40',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={checked}
        aria-label={
          checked ? `Deselect ${title}` : `Select ${title}`
        }
        className={cn(
          'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors',
          checked
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-input bg-background',
        )}
      >
        {checked && <Check className="size-4" />}
      </button>

      {/*
        The rest of the row toggles selection too, matching the categorize
        screen; the pencil is the only control that opens the label editor.
      */}
      <button
        type="button"
        onClick={onToggle}
        className="min-w-0 flex-1 text-left"
      >
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {transaction.description && transaction.source
            ? `${transaction.source} · `
            : ''}
          {formatDateTime(transaction.occurredAt)}
        </span>
        {/* The raw message is the only evidence of what this was. */}
        <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground/80">
          {transaction.text}
        </span>
      </button>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-semibold tabular-nums">
          {formatMoney(transaction.amount, transaction.currency)}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Label ${title}`}
          onClick={onLabel}
        >
          <PencilLine />
        </Button>
      </div>
    </div>
  )
}

// ---------- label editor ----------

/**
 * A single optional text field, so this is a controlled input rather than a
 * react-hook-form + zod form like the multi-field dialogs. The length cap
 * matches the API schema.
 */
const LABEL_MAX = 200

function LabelDialog({
  transaction,
  onClose,
}: {
  transaction: StagedTransaction
  onClose: () => void
}) {
  const labelIncoming = useLabelIncomingMutation()
  const [value, setValue] = useState(transaction.description ?? '')

  async function save() {
    const trimmed = value.trim()
    try {
      await labelIncoming.mutateAsync({
        id: transaction.id,
        description: trimmed === '' ? null : trimmed,
      })
      toast.success(trimmed === '' ? 'Label cleared' : 'Label saved')
      onClose()
    } catch {
      // Handled by the mutation's onError.
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Label this transaction</DialogTitle>
          <DialogDescription>
            The message says nothing about why the money left. Name it so it
            means something later — or leave it empty to use{' '}
            {transaction.source ? `“${transaction.source}”` : 'the bank message'}
            .
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-4">
          <div className="rounded-lg bg-muted px-3 py-2">
            <p className="text-xs text-muted-foreground">{transaction.text}</p>
            <p className="mt-1.5 text-sm font-semibold tabular-nums">
              {formatMoney(transaction.amount, transaction.currency)}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="transaction-label">Label</Label>
            <Input
              id="transaction-label"
              autoFocus
              maxLength={LABEL_MAX}
              value={value}
              placeholder={transaction.source ?? 'Lunch with Sam'}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save()
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={labelIncoming.isPending}
            onClick={() => void save()}
          >
            {labelIncoming.isPending ? 'Saving…' : 'Save label'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
