import { useState } from 'react'
import {
  formatExactLocalTime,
  formatExpenseRelative,
  formatExpenseShortDate,
  formatMoney,
} from '@/lib/format'
import { useTimeFormatStore } from '@/lib/stores'
import type { Expense, FamilyMember } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
}

/**
 * A single expense row shared by Today and Analytics:
 *  - recorder avatar on the left (taps open the member's details),
 *  - description + category subtitle (relative hint while fresh),
 *  - amount with the exact local time underneath (date added when the
 *    current screen doesn't already make it obvious).
 *  - `onEdit` makes the row editable (analytics).
 */
export function ExpenseListItem({
  expense,
  members,
  categoryLabelFor,
  withDate = false,
  onEdit,
}: {
  expense: Expense
  members: FamilyMember[]
  /** Resolves a category id to its full breadcrumb path. */
  categoryLabelFor: (categoryId: string) => string
  withDate?: boolean
  onEdit?: () => void
}) {
  const mode = useTimeFormatStore((s) => s.mode)
  const [viewing, setViewing] = useState<FamilyMember | null>(null)
  const member = members.find((m) => m.user.id === expense.createdBy.id)

  const label = expense.category
    ? categoryLabelFor(expense.category.id) || null
    : null
  const relative = formatExpenseRelative(expense.occurredAt)
  const exact = formatExactLocalTime(expense.occurredAt, mode)
  const timeLine = withDate
    ? `${formatExpenseShortDate(expense.occurredAt)} · ${exact}`
    : exact

  return (
    <>
      <div
        onClick={onEdit}
        className={cn(
          'flex w-full items-center justify-between gap-3 border-b py-2.5 last:border-0',
          onEdit &&
            'cursor-pointer transition-colors hover:bg-muted/40',
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <CreatorAvatar
            name={expense.createdBy.name}
            image={expense.createdBy.image}
            onClick={
              member
                ? () => setViewing(member)
                : undefined
            }
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {expense.description || 'Expense'}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {label ?? 'Uncategorized'}
              {relative ? ` · ${relative}` : ''}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="flex flex-col items-end gap-0.5">
            <span className="text-sm font-semibold tabular-nums">
              {formatMoney(expense.amount, expense.currency)}
            </span>
            <span className="text-[0.7rem] text-muted-foreground tabular-nums">
              {timeLine}
            </span>
          </span>
          {onEdit && (
            <Pencil className="size-3.5 text-muted-foreground/60" />
          )}
        </span>
      </div>

      {viewing && (
        <UserDetailDialog member={viewing} onClose={() => setViewing(null)} />
      )}
    </>
  )
}

// ---------- avatar & member popup ----------

function CreatorAvatar({
  name,
  image,
  onClick,
}: {
  name: string
  image: string | null
  onClick?: () => void
}) {
  const content = image ? (
    <img
      src={image}
      alt=""
      referrerPolicy="no-referrer"
      className="size-8 rounded-full object-cover ring-1 ring-border"
    />
  ) : (
    <span className="flex size-8 items-center justify-center rounded-full bg-primary text-[0.7rem] font-semibold text-primary-foreground ring-1 ring-border select-none">
      {initials(name) || '?'}
    </span>
  )

  if (!onClick) {
    return (
      <span className="shrink-0 rounded-full">{content}</span>
    )
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      aria-label={`Show ${name}`}
      className="shrink-0 rounded-full transition-opacity hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {content}
    </button>
  )
}

function UserDetailDialog({
  member,
  onClose,
}: {
  member: FamilyMember
  onClose: () => void
}) {
  const { user } = member

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="sr-only">User details</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          {user.image ? (
            <img
              src={user.image}
              alt=""
              referrerPolicy="no-referrer"
              className="size-16 rounded-full object-cover ring-2 ring-border"
            />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-foreground select-none">
              {initials(user.name) || '?'}
            </span>
          )}
          <div>
            <p className="text-lg font-semibold">{user.name}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
            {ROLE_LABEL[member.role] ?? member.role}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}
