import { useToastStore } from '@/lib/stores'
import { CheckCircle2, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Renders toast notifications from the zustand toast store. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            'pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-popover px-3 py-2.5 text-sm shadow-lg animate-in slide-in-from-bottom-2 fade-in',
            t.kind === 'error'
              ? 'border-destructive/40'
              : 'border-border',
          )}
        >
          {t.kind === 'error' ? (
            <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          ) : (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
          )}
          <p className="min-w-0 flex-1 text-pretty">{t.message}</p>
          <button
            onClick={() => dismiss(t.id)}
            className="shrink-0 rounded-sm opacity-60 transition-opacity hover:opacity-100"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
