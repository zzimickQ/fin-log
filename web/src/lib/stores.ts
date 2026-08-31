import { create } from 'zustand'

/**
 * Global client state (zustand).
 *
 * Server data lives in the React Query cache; these stores hold ephemeral
 * UI state that doesn't belong in the query cache.
 */

// ---------- active family ----------

interface FamilyStore {
  /** The family currently being viewed (set by FamilyLayout). */
  familyId: string | null
  setFamilyId: (familyId: string | null) => void
}

export const useFamilyStore = create<FamilyStore>((set) => ({
  familyId: null,
  setFamilyId: (familyId) => set({ familyId }),
}))

// ---------- ledger expense filters ----------

export interface LedgerFilters {
  search: string
  uncategorized: boolean
  /** '' = all categories, '__uncategorized__' = only uncategorized. */
  categoryId: string
}

const defaultFilters: LedgerFilters = {
  search: '',
  uncategorized: false,
  categoryId: '',
}

interface LedgerFiltersStore {
  filters: LedgerFilters
  limit: number
  setFilters: (patch: Partial<LedgerFilters>) => void
  setLimit: (limit: number) => void
  reset: () => void
}

export const useLedgerFiltersStore = create<LedgerFiltersStore>((set) => ({
  filters: defaultFilters,
  limit: 50,
  setFilters: (patch) =>
    set((s) => ({ filters: { ...s.filters, ...patch } })),
  setLimit: (limit) => set({ limit }),
  reset: () => set({ filters: defaultFilters, limit: 50 }),
}))

// ---------- toasts ----------

export type ToastKind = 'success' | 'error'

export interface Toast {
  id: number
  message: string
  kind: ToastKind
}

interface ToastStore {
  toasts: Toast[]
  push: (message: string, kind?: ToastKind) => void
  dismiss: (id: number) => void
}

let toastId = 0

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (message, kind = 'success') => {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }))
    // Auto-dismiss after 4s.
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 4000)
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

/** Convenience helpers for mutation callbacks. */
export const toast = {
  success: (message: string) => useToastStore.getState().push(message, 'success'),
  error: (message: string) => useToastStore.getState().push(message, 'error'),
}
