import type { CategoryNode } from './types'
import type { TimeMode } from './stores'

export function formatMoney(amount: number, currency = 'ETB') {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Flatten a category tree into a map of id → full breadcrumb path. */
export function categoryPaths(
  nodes: CategoryNode[],
): Map<string, string> {
  const map = new Map<string, string>()
  const walk = (list: CategoryNode[], prefix: string) => {
    for (const node of list) {
      const path = prefix ? `${prefix} › ${node.name}` : node.name
      map.set(node.id, path)
      walk(node.children, path)
    }
  }
  walk(nodes, '')
  return map
}

// ---------- expense timestamps ----------

function localTimeOf(iso: string, mode: TimeMode) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: mode === '12h',
  })
}

function shortDateOf(iso: string) {
  const d = new Date(iso)
  const includeYear = d.getFullYear() !== new Date().getFullYear()
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  })
}

/**
 * Display text for an expense's timestamp:
 *  - within the last hour → relative ("12m ago") + the actual local time
 *  - anything older → the actual local time (plus a date when the current
 *    screen doesn't already make the date obvious)
 * Follows the user's persisted 12h/24h preference.
 */
export function formatExpenseTime(
  iso: string,
  mode: TimeMode,
  options: { withDate?: boolean; now?: number } = {},
): string {
  const now = options.now ?? Date.now()
  const diffMs = now - new Date(iso).getTime()
  const local = localTimeOf(iso, mode)

  if (diffMs >= 0 && diffMs < 60 * 60 * 1000) {
    if (diffMs < 60 * 1000) return `just now · ${local}`
    const minutes = Math.max(1, Math.floor(diffMs / 60000))
    return `${minutes}m ago · ${local}`
  }

  return options.withDate
    ? `${local} · ${shortDateOf(iso)}`
    : local
}

/** Exact local time only (no date) — e.g. under an expense amount. */
export function formatExactLocalTime(iso: string, mode: TimeMode) {
  return localTimeOf(iso, mode)
}

/**
 * Relative time for timestamps within the last hour ("just now", "12m ago"),
 * otherwise null — the exact time is shown separately.
 */
export function formatExpenseRelative(iso: string, now = Date.now()) {
  const diffMs = now - new Date(iso).getTime()
  if (diffMs < 0 || diffMs >= 60 * 60 * 1000) return null
  if (diffMs < 60 * 1000) return 'just now'
  return `${Math.max(1, Math.floor(diffMs / 60000))}m ago`
}

/** Full absolute datetime for tooltips (uses the time preference). */
export function formatExpenseTimeFull(iso: string, mode: TimeMode) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: mode === '12h',
  })
}

/** Short date without the time ("Sep 2", adds the year when not current). */
export function formatExpenseShortDate(iso: string) {
  return shortDateOf(iso)
}
