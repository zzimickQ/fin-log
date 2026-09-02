import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  useForm,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form'
import {
  useCreateLedgerMutation,
  useDeleteLedgerMutation,
  useFamilyQuery,
  useUpdateLedgerMutation,
} from '@/lib/queries'
import { toast } from '@/lib/stores'
import { ledgerSchema, zodFormResolver, type LedgerValues } from '@/lib/validations'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { LedgerSummary } from '@/lib/types'
import { Pencil, Plus, Trash2 } from 'lucide-react'

export function LedgersPage() {
  const { familyId = '' } = useParams<{ familyId: string }>()
  const { data: family } = useFamilyQuery(familyId)
  const deleteLedger = useDeleteLedgerMutation()

  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState<LedgerSummary | null>(null)
  const [deleting, setDeleting] = useState<LedgerSummary | null>(null)

  const ledgers = family?.ledgers ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Ledgers</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus />
              New ledger
            </Button>
          </DialogTrigger>
          <CreateLedgerDialog
            familyId={familyId}
            onClose={() => setOpen(false)}
          />
        </Dialog>
      </div>

      {ledgers.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No ledgers yet — create one to start recording expenses.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {ledgers.map((ledger) => (
            <Card key={ledger.id}>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <CardTitle className="truncate">{ledger.name}</CardTitle>
                  {ledger.description && (
                    <CardDescription className="line-clamp-2">
                      {ledger.description}
                    </CardDescription>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Rename ${ledger.name}`}
                    onClick={() => setRenaming(ledger)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${ledger.name}`}
                    onClick={() => setDeleting(ledger)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {renaming && (
        <RenameLedgerDialog
          ledger={renaming}
          familyId={familyId}
          onClose={() => setRenaming(null)}
        />
      )}

      {deleting && (
        <Dialog open onOpenChange={(o) => !o && setDeleting(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete “{deleting.name}”?</DialogTitle>
              <DialogDescription>
                This permanently deletes the ledger. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={deleteLedger.isPending}
                onClick={() =>
                  void deleteLedger
                    .mutateAsync({
                      ledgerId: deleting.id,
                      familyId,
                    })
                    .then(() => {
                      toast.success('Ledger deleted')
                      setDeleting(null)
                    })
                }
              >
                {deleteLedger.isPending ? 'Deleting…' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// ---------- create ----------

function CreateLedgerDialog({
  familyId,
  onClose,
}: {
  familyId: string
  onClose: () => void
}) {
  const createLedger = useCreateLedgerMutation()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LedgerValues>({
    resolver: zodFormResolver(ledgerSchema),
    defaultValues: { name: '', description: '' },
  })

  async function onCreate(values: LedgerValues) {
    await createLedger.mutateAsync({
      familyId,
      data: {
        name: values.name,
        description: values.description || undefined,
      },
    })
    reset()
    toast.success(`Ledger “${values.name}” created`)
    onClose()
  }

  return (
    <DialogContent>
      <form onSubmit={(e) => void handleSubmit(onCreate)(e)} noValidate>
        <DialogHeader>
          <DialogTitle>New ledger</DialogTitle>
          <DialogDescription>
            A place to record expenses, e.g. “Household”, “Vacation”,
            “Renovation”.
          </DialogDescription>
        </DialogHeader>
        <LedgerFields register={register} errors={errors} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create ledger'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}

// ---------- rename ----------

function RenameLedgerDialog({
  ledger,
  familyId,
  onClose,
}: {
  ledger: LedgerSummary
  familyId: string
  onClose: () => void
}) {
  const updateLedger = useUpdateLedgerMutation()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LedgerValues>({
    resolver: zodFormResolver(ledgerSchema),
    defaultValues: {
      name: ledger.name,
      description: ledger.description ?? '',
    },
  })

  async function onRename(values: LedgerValues) {
    await updateLedger.mutateAsync({
      ledgerId: ledger.id,
      familyId,
      data: {
        name: values.name,
        description: values.description || null,
      },
    })
    toast.success('Ledger updated')
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={(e) => void handleSubmit(onRename)(e)} noValidate>
          <DialogHeader>
            <DialogTitle>Rename ledger</DialogTitle>
            <DialogDescription>
              Update the ledger’s name or description.
            </DialogDescription>
          </DialogHeader>
          <LedgerFields register={register} errors={errors} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------- shared fields ----------

function LedgerFields({
  register,
  errors,
}: {
  register: UseFormRegister<LedgerValues>
  errors: FieldErrors<LedgerValues>
}) {
  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="ledger-name">Name</Label>
        <Input
          id="ledger-name"
          aria-invalid={errors.name ? true : undefined}
          {...register('name')}
          placeholder="Household"
        />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ledger-desc">Description (optional)</Label>
        <Textarea
          id="ledger-desc"
          {...register('description')}
          placeholder="Day to day spending"
        />
        {errors.description && (
          <p className="text-sm text-destructive">
            {errors.description.message}
          </p>
        )}
      </div>
    </div>
  )
}
