import type { CategoryNode } from './types'

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
