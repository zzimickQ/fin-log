import { createFetch } from '@better-fetch/fetch'
import type {
  CategoryNode,
  Expense,
  FamilyDetail,
  FamilyMember,
  FamilyRole,
  FamilySummary,
  LedgerSummary,
  MyLedger,
  RecentExpense,
} from './types'

/**
 * Typed HTTP client built on @better-fetch/fetch (the same client
 * better-auth uses internally).
 *
 * In development the Vite dev server proxies `/api/*` to the Fastify server
 * (port 3000), so all requests are same-origin with credentials included.
 */
export const betterFetch = createFetch({
  baseURL: '/api',
  credentials: 'include',
  // Throw on non-2xx so callers get a real Error (better for React Query).
  throw: true,
})

export class ApiError extends Error {
  status: number
  details?: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

/**
 * Runs a better-fetch request and normalizes the thrown BetterFetchError
 * into our own ApiError (message from the server's `{ message }` body).
 */
async function unwrap<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise
  } catch (err) {
    if (
      err instanceof Error &&
      'status' in err &&
      typeof (err as { status?: unknown }).status === 'number'
    ) {
      const fetchErr = err as Error & {
        status: number
        error?: { message?: unknown }
      }
      const message =
        typeof fetchErr.error?.message === 'string'
          ? fetchErr.error.message
          : `Request failed (${fetchErr.status})`
      throw new ApiError(fetchErr.status, message, fetchErr.error)
    }
    throw err
  }
}

function qs(
  params: Record<string, string | number | boolean | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') out[key] = String(value)
  }
  return out
}

export const api = {
  // ---- families ----
  listFamilies: () =>
    unwrap(betterFetch<{ families: FamilySummary[] }>('/families')),
  createFamily: (name: string) =>
    unwrap(
      betterFetch<{ families: FamilySummary[] }>('/families', {
        method: 'POST',
        body: { name },
      }),
    ),
  getFamily: (familyId: string) =>
    unwrap(betterFetch<FamilyDetail>(`/families/${familyId}`)),
  renameFamily: (familyId: string, name: string) =>
    unwrap(
      betterFetch<{ id: string; name: string }>(`/families/${familyId}`, {
        method: 'PATCH',
        body: { name },
      }),
    ),
  deleteFamily: (familyId: string) =>
    unwrap(betterFetch<void>(`/families/${familyId}`, { method: 'DELETE' })),

  // ---- members ----
  addMember: (familyId: string, email: string, role: FamilyRole) =>
    unwrap(
      betterFetch<FamilyMember>(`/families/${familyId}/members`, {
        method: 'POST',
        body: { email, role },
      }),
    ),
  updateMemberRole: (
    familyId: string,
    memberId: string,
    role: FamilyRole,
  ) =>
    unwrap(
      betterFetch<FamilyMember>(
        `/families/${familyId}/members/${memberId}`,
        { method: 'PATCH', body: { role } },
      ),
    ),
  removeMember: (familyId: string, memberId: string) =>
    unwrap(
      betterFetch<void>(`/families/${familyId}/members/${memberId}`, {
        method: 'DELETE',
      }),
    ),

  // ---- ledgers ----
  createLedger: (
    familyId: string,
    data: { name: string; description?: string },
  ) =>
    unwrap(
      betterFetch<LedgerSummary>(`/families/${familyId}/ledgers`, {
        method: 'POST',
        body: data,
      }),
    ),
  updateLedger: (
    ledgerId: string,
    data: { name?: string; description?: string | null },
  ) =>
    unwrap(
      betterFetch<LedgerSummary>(`/ledgers/${ledgerId}`, {
        method: 'PATCH',
        body: data,
      }),
    ),
  deleteLedger: (ledgerId: string) =>
    unwrap(betterFetch<void>(`/ledgers/${ledgerId}`, { method: 'DELETE' })),

  /** Count + sum of a ledger's expenses (optional occurredAt range). */
  ledgerTotals: (ledgerId: string, from?: string, to?: string) =>
    unwrap(
      betterFetch<{ count: number; sum: number }>(
        `/ledgers/${ledgerId}/totals`,
        { query: qs({ from, to }) },
      ),
    ),

  /**
   * Category totals within a range, rolled up to root categories, plus the
   * uncategorized bucket (home tab “by category” list).
   */
  ledgerBreakdown: (ledgerId: string, from?: string, to?: string) =>
    unwrap(
      betterFetch<{
        categories: { id: string; name: string; sum: number; count: number }[]
        uncategorized: { sum: number; count: number }
      }>(`/ledgers/${ledgerId}/breakdown`, { query: qs({ from, to }) }),
    ),

  // ---- categories ----
  getCategories: (familyId: string) =>
    unwrap(
      betterFetch<{ categories: CategoryNode[] }>(
        `/families/${familyId}/categories`,
      ),
    ),
  createCategory: (
    familyId: string,
    data: { name: string; description?: string; parentId?: string | null },
  ) =>
    unwrap(
      betterFetch<CategoryNode>(`/families/${familyId}/categories`, {
        method: 'POST',
        body: data,
      }),
    ),
  updateCategory: (
    categoryId: string,
    data: {
      name?: string
      description?: string | null
      parentId?: string | null
    },
  ) =>
    unwrap(
      betterFetch<CategoryNode>(`/categories/${categoryId}`, {
        method: 'PATCH',
        body: data,
      }),
    ),
  deleteCategory: (categoryId: string) =>
    unwrap(
      betterFetch<void>(`/categories/${categoryId}`, { method: 'DELETE' }),
    ),

  // ---- expenses ----
  listExpenses: (
    ledgerId: string,
    params: {
      search?: string
      categoryId?: string
      uncategorized?: boolean
      from?: string
      to?: string
      limit?: number
      offset?: number
    } = {},
  ) =>
    unwrap(
      betterFetch<{ expenses: Expense[]; total: number }>(
        `/ledgers/${ledgerId}/expenses`,
        { query: qs(params) },
      ),
    ),
  createExpense: (
    ledgerId: string,
    data: {
      amount: number
      description?: string
      note?: string
      occurredAt?: string
      categoryId?: string | null
      paidById?: string | null
      currency?: string
    },
  ) =>
    unwrap(
      betterFetch<Expense>(`/ledgers/${ledgerId}/expenses`, {
        method: 'POST',
        body: data,
      }),
    ),
  updateExpense: (
    expenseId: string,
    data: {
      amount?: number
      description?: string | null
      note?: string | null
      occurredAt?: string
      categoryId?: string | null
      paidById?: string | null
    },
  ) =>
    unwrap(
      betterFetch<Expense>(`/expenses/${expenseId}`, {
        method: 'PATCH',
        body: data,
      }),
    ),
  categorizeExpense: (expenseId: string, categoryId: string | null) =>
    unwrap(
      betterFetch<Expense>(`/expenses/${expenseId}/category`, {
        method: 'PUT',
        body: { categoryId },
      }),
    ),
  deleteExpense: (expenseId: string) =>
    unwrap(
      betterFetch<void>(`/expenses/${expenseId}`, { method: 'DELETE' }),
    ),
  recentExpenses: (limit = 10) =>
    unwrap(
      betterFetch<{ expenses: RecentExpense[] }>('/expenses/recent', {
        query: qs({ limit }),
      }),
    ),

  // ---- cross-family navigation ----

  /** All ledgers across the user's families (navbar switcher). */
  myLedgers: () =>
    unwrap(betterFetch<{ ledgers: MyLedger[] }>('/ledgers/mine')),

  /** Assign categories to many expenses in one transaction. */
  categorizeBatch: (items: { expenseId: string; categoryId: string }[]) =>
    unwrap(
      betterFetch<{ count: number }>('/expenses/categorize-batch', {
        method: 'POST',
        body: { items },
      }),
    ),
}
