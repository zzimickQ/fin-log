import type { CategoryNode } from './types'

/** Flattened category (DFS) with breadcrumb path + depth for indent. */
export interface FlatCategory {
  id: string
  name: string
  path: string
  depth: number
}

export function flattenCategories(
  nodes: CategoryNode[],
): FlatCategory[] {
  const out: FlatCategory[] = []
  const walk = (list: CategoryNode[], prefix: string, depth: number) => {
    for (const node of list) {
      const path = prefix ? `${prefix} › ${node.name}` : node.name
      out.push({ id: node.id, name: node.name, path, depth })
      walk(node.children, path, depth + 1)
    }
  }
  walk(nodes, '', 0)
  return out
}

const STOP_WORDS = new Set(['a', 'an', 'the', 'for', 'and', 'at', 'in'])

/**
 * Very light "is this category obvious?" guessing: token overlap between the
 * expense description and each category's name. Returns the best matches
 * (≤ max), best first. No matches → empty array (caller shows no hint).
 */
export function guessCategories(
  description: string,
  categories: CategoryNode[],
  max = 3,
): FlatCategory[] {
  const text = description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  const scored: { cat: FlatCategory; score: number }[] = []
  for (const flat of flattenCategories(categories)) {
    const name = flat.name.toLowerCase()
    // Skip single generic words like "Other".
    if (name.length < 3) continue
    let score = 0
    const nameTokens = name.split(/\s+/).filter((w) => !STOP_WORDS.has(w))
    for (const token of nameTokens) {
      if (token.length < 3) continue
      if (text.includes(token)) score += 1
    }
    if (score > 0 && text.some((w) => name.includes(w) && w.length >= 3)) {
      score += 1
    }
    if (score > 0) scored.push({ cat: flat, score })
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((s) => s.cat)
}
