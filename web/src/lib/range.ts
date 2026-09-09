/**
 * Date-window helpers for the Analytics range selector.
 *
 * A window is two LOCAL calendar dates (`YYYY-MM-DD`), both inclusive: the
 * day starts at local midnight and ends at 23:59:59.999. Storing plain
 * dates (instead of presets or timestamps) is what lets the arrows shift a
 * window by its own length and keeps the choice stable across refreshes.
 */

export type RangeSnap = 'this-week' | 'last-week' | 'this-month' | 'last-month'

export interface DateWindow {
  fromDate: string
  toDate: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Local `YYYY-MM-DD` (input/display format). */
export function dateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Local midnight of a `YYYY-MM-DD` string. */
export function parseDateInput(v: string): Date {
  const [y, m, d] = v.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function endOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Monday of the week containing `d` (local). */
export function mondayOf(d: Date): Date {
  const offset = (d.getDay() + 6) % 7
  return startOfDay(addDays(d, -offset))
}

/** First day of the month containing `d` (local midnight). */
export function monthStartOf(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

/** Number of calendar days the inclusive window covers. */
export function windowDays(fromDate: string, toDate: string): number {
  const a = parseDateInput(fromDate)
  const b = parseDateInput(toDate)
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1
}

/**
 * The window one of the quick ranges covers *relative to `today`*.
 * "This week"/"This month" end today — the future has no data yet, and
 * arrows then page backward into contiguous, complete windows.
 */
export function snapWindow(snap: RangeSnap, today = new Date()): DateWindow {
  const monday = mondayOf(today)
  switch (snap) {
    case 'this-week':
      return { fromDate: dateInput(monday), toDate: dateInput(today) }
    case 'last-week':
      return {
        fromDate: dateInput(addDays(monday, -7)),
        toDate: dateInput(addDays(monday, -1)),
      }
    case 'this-month':
      return {
        fromDate: dateInput(monthStartOf(today)),
        toDate: dateInput(today),
      }
    case 'last-month': {
      const first = monthStartOf(today)
      return {
        fromDate: dateInput(new Date(first.getFullYear(), first.getMonth() - 1, 1)),
        toDate: dateInput(new Date(first.getFullYear(), first.getMonth(), 0)),
      }
    }
  }
}

/** Move a window one full window-length earlier (-1) or later (+1). */
export function shiftWindow(
  fromDate: string,
  toDate: string,
  dir: -1 | 1,
): DateWindow {
  const days = windowDays(fromDate, toDate) * dir
  return {
    fromDate: dateInput(addDays(parseDateInput(fromDate), days)),
    toDate: dateInput(addDays(parseDateInput(toDate), days)),
  }
}

/** Query timestamps (ISO) for an inclusive local-date window. */
export function windowToIso(
  fromDate: string,
  toDate: string,
): { from: string; to: string } {
  return {
    from: startOfDay(parseDateInput(fromDate)).toISOString(),
    to: endOfDay(parseDateInput(toDate)).toISOString(),
  }
}

/** Compact label for the visible range text, e.g. "Sep 7 – Sep 9". */
export function windowLabel(fromDate: string, toDate: string): string {
  const a = parseDateInput(fromDate)
  const b = parseDateInput(toDate)
  const short = { month: 'short' as const, day: 'numeric' as const }
  if (a.getFullYear() === b.getFullYear()) {
    const base = `${a.toLocaleDateString(undefined, short)} – ${b.toLocaleDateString(
      undefined,
      short,
    )}`
    return a.getFullYear() === new Date().getFullYear()
      ? base
      : `${base}, ${a.getFullYear()}`
  }
  const withYear = { ...short, year: 'numeric' as const }
  return `${a.toLocaleDateString(undefined, withYear)} – ${b.toLocaleDateString(
    undefined,
    withYear,
  )}`
}

/**
 * Map the pre-2 persisted options (preset/monthVal/custom dates) onto an
 * explicit window so old localStorage survives the redesign.
 */
export function legacyWindowToDates(
  legacy:
    | {
        preset?: string
        monthVal?: string
        customFrom?: string
        customTo?: string
      }
    | undefined,
  today = new Date(),
): DateWindow {
  if (
    legacy?.preset === 'custom' &&
    legacy.customFrom &&
    legacy.customTo &&
    parseDateInput(legacy.customFrom).getTime() <=
      parseDateInput(legacy.customTo).getTime()
  ) {
    return { fromDate: legacy.customFrom, toDate: legacy.customTo }
  }
  if (legacy?.preset === 'month') {
    const val =
      legacy.monthVal || `${today.getFullYear()}-${pad(today.getMonth() + 1)}`
    const [y, m] = val.split('-').map(Number)
    if (y && m >= 1 && m <= 12) {
      return {
        fromDate: dateInput(new Date(y, m - 1, 1)),
        toDate: dateInput(new Date(y, m, 0)),
      }
    }
  }
  if (
    legacy?.preset === 'last-week' ||
    legacy?.preset === 'this-week' ||
    legacy?.preset === 'this-month' ||
    legacy?.preset === 'last-month'
  ) {
    return snapWindow(legacy.preset, today)
  }
  if (legacy?.preset === 'two-weeks-ago') {
    const monday = mondayOf(today)
    return {
      fromDate: dateInput(addDays(monday, -14)),
      toDate: dateInput(addDays(monday, -8)),
    }
  }
  return snapWindow('this-week', today)
}
