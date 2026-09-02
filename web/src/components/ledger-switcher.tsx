import { Link } from 'react-router-dom'
import { useActiveLedgerRow } from '@/lib/active-ledger'
import { useActiveLedgerStore } from '@/lib/stores'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BookOpen, Plus, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Nav-bar ledger switcher. Lists every ledger across the user's families,
 * grouped by family; picking one retargets the capture + categorize flows.
 */
export function LedgerSwitcher({ className }: { className?: string }) {
  const { ledgers, ledger, isPending } = useActiveLedgerRow()
  const setLedgerId = useActiveLedgerStore((s) => s.setLedgerId)

  if (isPending) {
    return (
      <div
        className={cn(
          'flex h-8 items-center rounded-lg border border-input px-2.5 text-sm text-muted-foreground',
          className,
        )}
      >
        Ledgers…
      </div>
    )
  }

  if (ledgers.length === 0) {
    return (
      <Button asChild variant="outline" size="sm" className={className}>
        <Link to="/admin/dashboard">
          <Plus />
          New ledger
        </Link>
      </Button>
    )
  }

  // Group by family (keyed by family id so same-named families don't collide).
  const groups: {
    familyId: string
    familyName: string
    ledgers: typeof ledgers
  }[] = []
  for (const l of ledgers) {
    const group = groups.find((g) => g.familyId === l.familyId)
    if (group) group.ledgers.push(l)
    else
      groups.push({
        familyId: l.familyId,
        familyName: l.familyName,
        ledgers: [l],
      })
  }

  return (
    <Select
      value={ledger?.id ?? ''}
      onValueChange={(v) => v && setLedgerId(v)}
    >
      <SelectTrigger
        aria-label="Active ledger"
        className={cn(
          'h-8 w-full max-w-44 justify-between sm:max-w-64',
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <BookOpen className="size-3.5 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="Choose a ledger" />
        </span>
      </SelectTrigger>
      <SelectContent className="max-w-80">
        {groups.map((g) => (
          <SelectGroup key={g.familyId}>
            <SelectLabel>{g.familyName}</SelectLabel>
            {g.ledgers.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                <span className="flex items-center gap-2">
                  <span className="truncate">{l.name}</span>
                  {l.uncategorizedCount > 0 && (
                    <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                      <Tag className="size-3" />
                      {l.uncategorizedCount}
                    </span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
