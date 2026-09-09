import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { dateInput, legacyWindowToDates, snapWindow } from './range'

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

// ---------- analytics view options (persisted) ----------

export type AnalyticsGrouping = 'category' | 'date' | 'list'
export type AnalyticsSort = 'newest' | 'oldest' | 'highest' | 'lowest'

/**
 * The Analytics page's date range + grouping + sort selection.
 *
 * Persisted as ONE set shared across ledgers, so the chosen view survives
 * page refreshes and stays applied when the active ledger changes. The
 * window is stored as two plain local dates (inclusive) rather than a
 * preset, which is what lets the ‹ › arrows shift it by its own length.
 */
export interface AnalyticsOptions {
  /** Window start, `YYYY-MM-DD` (local, inclusive). */
  fromDate: string
  /** Window end, `YYYY-MM-DD` (local, inclusive). */
  toDate: string
  grouping: AnalyticsGrouping
  sortId: AnalyticsSort
}

const defaultAnalyticsOptions: AnalyticsOptions = {
  ...snapWindow('this-week', new Date()),
  grouping: 'category',
  sortId: 'highest',
}

interface AnalyticsOptionsStore {
  options: AnalyticsOptions
  /** Apply one or more option changes at once. */
  setOptions: (patch: Partial<AnalyticsOptions>) => void
  reset: () => void
}

/** Persisted in the browser (localStorage) so it survives reloads. */
export const useAnalyticsOptionsStore = create<AnalyticsOptionsStore>()(
  persist(
    (set) => ({
      options: defaultAnalyticsOptions,
      setOptions: (patch) =>
        set((s) => ({ options: { ...s.options, ...patch } })),
      reset: () => set({ options: defaultAnalyticsOptions }),
    }),
    {
      name: 'finlog-analytics-options',
      version: 2,
      // v1 stored preset/monthVal/custom dates; convert to an explicit
      // date window so those preferences survive the redesign.
      migrate: (persisted, version) => {
        if (version >= 2) return persisted as AnalyticsOptionsStore
        const legacy = (persisted as { options?: unknown } | null)?.options as
          | {
              preset?: string
              monthVal?: string
              customFrom?: string
              customTo?: string
              grouping?: AnalyticsGrouping
              sortId?: AnalyticsSort
            }
          | undefined
        const window = legacyWindowToDates(legacy, new Date())
        return {
          options: {
            ...window,
            grouping: legacy?.grouping ?? 'category',
            sortId: legacy?.sortId ?? 'highest',
          },
        } as AnalyticsOptionsStore
      },
      // Re-hydrated preferences must never point past today (future has no
      // data): clamp any window that ends later than today.
      merge: (persisted, current) => {
        const state = {
          ...current,
          ...(persisted as Partial<AnalyticsOptionsStore>),
        }
        const today = dateInput(new Date())
        const o = state.options
        if (o && o.toDate > today) {
          state.options = {
            ...o,
            toDate: today,
            ...(o.fromDate > today ? { fromDate: today } : {}),
          }
        }
        return state
      },
    },
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
