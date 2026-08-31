import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { api } from './api'
import { toast } from './stores'
import type { FamilyRole } from './types'
import type { LedgerFilters } from './stores'

// ---------- query keys ----------

export const queryKeys = {
  families: ['families'] as const,
  family: (familyId: string) => ['families', familyId] as const,
  expenses: (ledgerId: string, filters: LedgerFilters & { limit: number }) =>
    ['ledgers', ledgerId, 'expenses', filters] as const,
  recentExpenses: (limit: number) => ['expenses', 'recent', limit] as const,
}

// ---------- queries ----------

export function useFamiliesQuery() {
  return useQuery({
    queryKey: queryKeys.families,
    queryFn: () => api.listFamilies(),
  })
}

export function useFamilyQuery(familyId: string | null) {
  return useQuery({
    queryKey: queryKeys.family(familyId ?? ''),
    queryFn: () => api.getFamily(familyId!),
    enabled: familyId !== null,
  })
}

export function useExpensesQuery(
  ledgerId: string | null,
  filters: LedgerFilters,
  limit: number,
) {
  return useQuery({
    queryKey: queryKeys.expenses(ledgerId ?? '', { ...filters, limit }),
    queryFn: () =>
      api.listExpenses(ledgerId!, {
        search: filters.search || undefined,
        uncategorized:
          filters.uncategorized ||
          filters.categoryId === '__uncategorized__' ||
          undefined,
        categoryId:
          filters.categoryId && filters.categoryId !== '__uncategorized__'
            ? filters.categoryId
            : undefined,
        limit,
      }),
    enabled: ledgerId !== null,
  })
}

export function useRecentExpensesQuery(limit = 8) {
  return useQuery({
    queryKey: queryKeys.recentExpenses(limit),
    queryFn: () => api.recentExpenses(limit),
  })
}

// ---------- mutation helpers ----------

function useInvalidate() {
  const qc = useQueryClient()
  return (keys: readonly (readonly unknown[])[]) => {
    for (const key of keys) {
      qc.invalidateQueries({ queryKey: key as readonly unknown[] })
    }
  }
}

/** Shared onError: surface a toast with the API error message. */
function onMutationError(err: unknown) {
  toast.error(err instanceof Error ? err.message : 'Something went wrong')
}

function clearExpenseCaches(
  qc: QueryClient,
  ledgerId: string,
  familyId: string,
) {
  void qc.invalidateQueries({ queryKey: ['ledgers', ledgerId, 'expenses'] })
  void qc.invalidateQueries({ queryKey: queryKeys.family(familyId) })
  void qc.invalidateQueries({ queryKey: ['expenses', 'recent'] })
}

// ---------- family mutations ----------

export function useCreateFamilyMutation() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (name: string) => api.createFamily(name),
    onSuccess: () => invalidate([queryKeys.families]),
    onError: onMutationError,
  })
}

export function useRenameFamilyMutation() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ familyId, name }: { familyId: string; name: string }) =>
      api.renameFamily(familyId, name),
    onSuccess: (_data, { familyId }) =>
      invalidate([queryKeys.family(familyId), queryKeys.families]),
    onError: onMutationError,
  })
}

export function useDeleteFamilyMutation() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (familyId: string) => api.deleteFamily(familyId),
    onSuccess: () => invalidate([queryKeys.families]),
    onError: onMutationError,
  })
}

// ---------- member mutations ----------

export function useAddMemberMutation() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({
      familyId,
      email,
      role,
    }: {
      familyId: string
      email: string
      role: FamilyRole
    }) => api.addMember(familyId, email, role),
    onSuccess: (_data, { familyId }) =>
      invalidate([queryKeys.family(familyId)]),
    onError: onMutationError,
  })
}

export function useUpdateMemberRoleMutation() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({
      familyId,
      memberId,
      role,
    }: {
      familyId: string
      memberId: string
      role: FamilyRole
    }) => api.updateMemberRole(familyId, memberId, role),
    onSuccess: (_data, { familyId }) =>
      invalidate([queryKeys.family(familyId)]),
    onError: onMutationError,
  })
}

export function useRemoveMemberMutation() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ familyId, memberId }: { familyId: string; memberId: string }) =>
      api.removeMember(familyId, memberId),
    onSuccess: (_data, { familyId }) =>
      invalidate([queryKeys.family(familyId)]),
    onError: onMutationError,
  })
}

// ---------- ledger mutations ----------

export function useCreateLedgerMutation() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({
      familyId,
      data,
    }: {
      familyId: string
      data: { name: string; description?: string }
    }) => api.createLedger(familyId, data),
    onSuccess: (_data, { familyId }) =>
      invalidate([queryKeys.family(familyId)]),
    onError: onMutationError,
  })
}

export function useDeleteLedgerMutation() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (args: { ledgerId: string; familyId: string }) =>
      api.deleteLedger(args.ledgerId),
    onSuccess: (_data, { ledgerId, familyId }) => {
      void invalidate([queryKeys.family(familyId)])
      void invalidate([['ledgers', ledgerId, 'expenses']])
    },
    onError: onMutationError,
  })
}

// ---------- category mutations ----------

export function useCreateCategoryMutation() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({
      familyId,
      data,
    }: {
      familyId: string
      data: { name: string; description?: string; parentId?: string | null }
    }) => api.createCategory(familyId, data),
    onSuccess: (_data, { familyId }) =>
      invalidate([queryKeys.family(familyId)]),
    onError: onMutationError,
  })
}

export function useUpdateCategoryMutation() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (args: {
      categoryId: string
      familyId: string
      data: {
        name?: string
        description?: string | null
        parentId?: string | null
      }
    }) => api.updateCategory(args.categoryId, args.data),
    onSuccess: (_data, { familyId }) =>
      invalidate([queryKeys.family(familyId)]),
    onError: onMutationError,
  })
}

export function useDeleteCategoryMutation() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (args: { categoryId: string; familyId: string }) =>
      api.deleteCategory(args.categoryId),
    onSuccess: (_data, { familyId }) =>
      invalidate([queryKeys.family(familyId)]),
    onError: onMutationError,
  })
}

// ---------- expense mutations ----------

export function useCreateExpenseMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: {
      ledgerId: string
      familyId: string
      data: Parameters<typeof api.createExpense>[1]
    }) => api.createExpense(args.ledgerId, args.data),
    onSuccess: (_data, { ledgerId, familyId }) => {
      clearExpenseCaches(qc, ledgerId, familyId)
    },
    onError: onMutationError,
  })
}

export function useUpdateExpenseMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: {
      expenseId: string
      ledgerId: string
      familyId: string
      data: Parameters<typeof api.updateExpense>[1]
    }) => api.updateExpense(args.expenseId, args.data),
    onSuccess: (_data, { ledgerId, familyId }) => {
      clearExpenseCaches(qc, ledgerId, familyId)
    },
    onError: onMutationError,
  })
}

export function useCategorizeExpenseMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: {
      expenseId: string
      ledgerId: string
      familyId: string
      categoryId: string | null
    }) => api.categorizeExpense(args.expenseId, args.categoryId),
    onSuccess: (_data, { ledgerId, familyId }) => {
      clearExpenseCaches(qc, ledgerId, familyId)
    },
    onError: onMutationError,
  })
}

export function useDeleteExpenseMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: {
      expenseId: string
      ledgerId: string
      familyId: string
    }) => api.deleteExpense(args.expenseId),
    onSuccess: (_data, { ledgerId, familyId }) => {
      clearExpenseCaches(qc, ledgerId, familyId)
    },
    onError: onMutationError,
  })
}
