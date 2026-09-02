import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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

// ---------- active ledger (mobile capture / categorize flows) ----------

interface ActiveLedgerStore {
  /** The ledger the capture + categorize flows target. */
  ledgerId: string | null
  setLedgerId: (ledgerId: string | null) => void
}

/**
 * Persisted so the last-used ledger is restored on reload. If the stored id
 * no longer exists (ledger deleted / membership changed), a sync effect in
 * the app shell falls back to the user's first ledger.
 */
export const useActiveLedgerStore = create<ActiveLedgerStore>()(
  persist(
    (set) => ({
      ledgerId: null,
      setLedgerId: (ledgerId) => set({ ledgerId }),
    }),
    { name: 'finlog-active-ledger' },
  ),
)

// ---------- time format preference (12h am/pm vs 24h) ----------

export type TimeMode = '12h' | '24h'

/** Browser default: am/pm if the system locale uses hour12. */
function detectTimeMode(): TimeMode {
  if (typeof Intl === 'undefined') return '12h'
  try {
    const hour12 = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
    }).resolvedOptions().hour12
    return hour12 ? '12h' : '24h'
  } catch {
    return '12h'
  }
}

interface TimeFormatStore {
  mode: TimeMode
  setMode: (mode: TimeMode) => void
}

/** Persisted in the browser (localStorage) so it survives reloads. */
export const useTimeFormatStore = create<TimeFormatStore>()(
  persist(
    (set) => ({
      mode: detectTimeMode(),
      setMode: (mode) => set({ mode }),
    }),
    { name: 'finlog-time-format' },
  ),
)


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
