import { useEffect, useState } from 'react'

/** Subscribe to a CSS media query and reflect its current match state. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/**
 * "Mobile" means a touch-first, phone-sized viewport (coarse pointer, e.g.
 * phones and most tablets) — or a viewport narrower than 768px as a
 * fallback for hybrid devices where the coarse-pointer probe is unreliable.
 *
 * Used to decide when to show the on-screen numeric keypad for expense
 * entry: touch screens get the custom keypad, desktop gets a native input.
 */
export function useIsMobile(): boolean {
  const coarse = useMediaQuery('(pointer: coarse)')
  const narrow = useMediaQuery('(max-width: 767px)')
  return coarse || narrow
}
