import { useEffect, useState } from 'react'

/**
 * Returns `value` only after it has stayed unchanged for `delay` ms. Used to
 * keep the category-suggestion request off every keystroke.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])

  return debounced
}
