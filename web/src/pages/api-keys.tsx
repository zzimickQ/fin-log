import { useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  useApiKeysQuery,
  useCreateApiKeyMutation,
  useRevokeApiKeyMutation,
} from '@/lib/queries'
import { toast } from '@/lib/stores'
import {
  apiKeySchema,
  zodFormResolver,
  type ApiKeyValues,
} from '@/lib/validations'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDateTime } from '@/lib/format'
import type { ApiKeySummary, CreatedApiKey } from '@/lib/types'
import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react'

/**
 * Admin → API keys. Keys are scoped to the signed-in user: an external client
 * presenting one submits data as that user (the ingest endpoints are built on
 * top of this). The secret is generated server-side, shown exactly once, and
 * only its hash is stored — so this screen can revoke but never re-display it.
 */
export function ApiKeysPage() {
  const keys = useApiKeysQuery()

  const [creating, setCreating] = useState(false)
  // Holds the plaintext key between "created" and "user dismissed the dialog".
  const [created, setCreated] = useState<CreatedApiKey | null>(null)
  const [revoking, setRevoking] = useState<ApiKeySummary | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">API keys</h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Keys let external clients submit data to your account. A key acts
            as you, so treat it like a password — and revoke anything you no
            longer use.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus />
          New key
        </Button>
      </div>

      {keys.isError && (
        <p className="text-sm text-destructive">{keys.error.message}</p>
      )}

      {keys.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : keys.data && keys.data.keys.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <KeyRound className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No API keys yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create one for each app or device that will submit data to your
              account.
            </p>
            <Button className="mt-4" onClick={() => setCreating(true)}>
              <Plus />
              Create your first key
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {keys.data?.keys.map((key) => (
            <Card key={key.id}>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <CardTitle className="truncate">{key.name}</CardTitle>
                  <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {key.prefix}…
                    </code>
                    <span>Created {formatDateTime(key.createdAt)}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {key.lastUsedAt
                        ? `Last used ${formatDateTime(key.lastUsedAt)}`
                        : 'Never used'}
                    </span>
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Revoke ${key.name}`}
                  onClick={() => setRevoking(key)}
                >
                  <Trash2 />
                </Button>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {creating && (
        <Dialog open onOpenChange={(open) => !open && setCreating(false)}>
          <CreateKeyDialog
            onClose={() => setCreating(false)}
            onCreated={(key) => {
              setCreating(false)
              setCreated(key)
            }}
          />
        </Dialog>
      )}

      {created && (
        <RevealKeyDialog created={created} onClose={() => setCreated(null)} />
      )}

      {revoking && (
        <RevokeKeyDialog
          apiKey={revoking}
          onClose={() => setRevoking(null)}
        />
      )}
    </div>
  )
}

// ---------- create ----------

function CreateKeyDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (key: CreatedApiKey) => void
}) {
  const createKey = useCreateApiKeyMutation()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ApiKeyValues>({
    resolver: zodFormResolver(apiKeySchema),
    defaultValues: { name: '' },
  })

  async function onCreate(values: ApiKeyValues) {
    const key = await createKey.mutateAsync(values.name)
    reset()
    onCreated(key)
  }

  return (
    <DialogContent>
      <form onSubmit={(e) => void handleSubmit(onCreate)(e)} noValidate>
        <DialogHeader>
          <DialogTitle>Create an API key</DialogTitle>
          <DialogDescription>
            Name it after the app or device that will use it, so you know what
            to revoke later.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 py-4">
          <Label htmlFor="api-key-name">Name</Label>
          <Input
            id="api-key-name"
            autoFocus
            placeholder="Phone shortcut"
            aria-invalid={errors.name ? true : undefined}
            {...register('name')}
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create key'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}

// ---------- one-time reveal ----------

function RevealKeyDialog({
  created,
  onClose,
}: {
  created: CreatedApiKey
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(created.key)
      setCopied(true)
    } catch {
      toast.error('Could not copy — select the key and copy it manually')
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>“{created.name}” is ready</DialogTitle>
          <DialogDescription>
            This is the only time the key is shown. Copy it now and store it
            somewhere safe — you can revoke it, but never see it again.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 py-4">
          <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs whitespace-nowrap">
            {created.key}
          </code>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => void copy()}
            aria-label="Copy API key"
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- revoke ----------

function RevokeKeyDialog({
  apiKey,
  onClose,
}: {
  apiKey: ApiKeySummary
  onClose: () => void
}) {
  const revokeKey = useRevokeApiKeyMutation()

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Revoke “{apiKey.name}”?</DialogTitle>
          <DialogDescription>
            Anything using this key stops working immediately. This cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={revokeKey.isPending}
            onClick={() =>
              void revokeKey.mutateAsync(apiKey.id).then(() => {
                toast.success('API key revoked')
                onClose()
              })
            }
          >
            {revokeKey.isPending ? 'Revoking…' : 'Revoke'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
