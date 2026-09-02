import { useEffect } from 'react'
import { useMyLedgersQuery } from './queries'
import { useActiveLedgerStore } from './stores'
import type { MyLedger } from './types'

/**
 * Keeps the stored active ledger valid: when the user's ledgers load and the
 * stored id is missing or stale (deleted ledger, changed membership), fall
 * back to the first ledger. Call once near the top of the app shell.
 */
export function useSyncActiveLedger(enabled = true) {
  const { data } = useMyLedgersQuery(enabled)
  const ledgerId = useActiveLedgerStore((s) => s.ledgerId)
  const setLedgerId = useActiveLedgerStore((s) => s.setLedgerId)

  useEffect(() => {
    const ledgers = data?.ledgers
    if (!ledgers || ledgers.length === 0) return
    const stillValid = ledgers.some((l) => l.id === ledgerId)
    if (!stillValid) setLedgerId(ledgers[0].id)
  }, [data, ledgerId, setLedgerId])
}

/** Resolve the active ledger row out of the user's ledgers. */
export function useActiveLedgerRow(): {
  ledgers: MyLedger[]
  ledger: MyLedger | null
  isPending: boolean
  isError: boolean
} {
  const { data, isPending, isError } = useMyLedgersQuery()
  const ledgerId = useActiveLedgerStore((s) => s.ledgerId)
  const ledgers = data?.ledgers ?? []
  const ledger =
    ledgers.find((l) => l.id === ledgerId) ?? (ledgers.length > 0 ? ledgers[0] : null)
  return { ledgers, ledger, isPending, isError }
}
