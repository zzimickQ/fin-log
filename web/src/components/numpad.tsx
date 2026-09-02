import { Delete } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * On-screen numeric keypad for expense entry (mobile / touch only — desktop
 * flows use a native input instead). Controlled: `value` is the amount as a
 * decimal string ("0", "12", "12.5", "1200.75", …), `onChange` receives the
 * edited string. Max 2 decimal places.
 */
export function Numpad({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  const hasDot = value.includes('.')
  const decimals = hasDot ? value.split('.')[1].length : 0

  function press(key: string) {
    if (key === '.') {
      if (!hasDot) onChange(`${value}.`)
      return
    }
    if (key === 'backspace') {
      onChange(value.length > 1 ? value.slice(0, -1) : '0')
      return
    }
    // digit
    const integerDigits = hasDot ? value.split('.')[0].length : value.length
    if (hasDot && decimals >= 2) return
    if (integerDigits >= 12) return
    if (value === '0') {
      onChange(key)
      return
    }
    onChange(value + key)
  }

  const keyClass =
    'flex h-14 select-none items-center justify-center rounded-xl bg-muted text-xl font-semibold text-foreground transition-colors active:bg-accent active:translate-y-px focus-visible:ring-3 focus-visible:ring-ring/50 outline-none touch-manipulation'
  const keys: { label: string; key: string; className?: string }[] = [
    { label: '1', key: '1' },
    { label: '2', key: '2' },
    { label: '3', key: '3' },
    { label: '4', key: '4' },
    { label: '5', key: '5' },
    { label: '6', key: '6' },
    { label: '7', key: '7' },
    { label: '8', key: '8' },
    { label: '9', key: '9' },
    { label: '.', key: '.', className: 'text-2xl' },
    { label: '0', key: '0' },
    {
      label: '',
      key: 'backspace',
      className: 'text-muted-foreground',
    },
  ]

  return (
    <div
      className={cn(
        'grid grid-cols-3 gap-2',
        className,
      )}
      role="group"
      aria-label="Numeric keypad"
    >
      {keys.map((k) =>
        k.key === 'backspace' ? (
          <button
            key={k.key}
            type="button"
            onClick={() => press(k.key)}
            aria-label="Delete last digit"
            className={cn(keyClass, k.className)}
          >
            <Delete className="size-6" />
          </button>
        ) : (
          <button
            key={k.key}
            type="button"
            onClick={() => press(k.key)}
            aria-label={k.key === '.' ? 'Decimal point' : `Digit ${k.key}`}
            className={cn(keyClass, k.className)}
          >
            {k.label}
          </button>
        ),
      )}
    </div>
  )
}
