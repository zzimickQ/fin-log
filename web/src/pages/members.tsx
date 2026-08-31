import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import {
  useAddMemberMutation,
  useFamilyQuery,
  useRemoveMemberMutation,
  useUpdateMemberRoleMutation,
} from '@/lib/queries'
import { toast } from '@/lib/stores'
import { memberSchema, zodFormResolver, type MemberValues } from '@/lib/validations'
import type { FamilyRole } from '@/lib/types'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Mail, Plus, Trash2, UserRound } from 'lucide-react'

export function MembersPage() {
  const { familyId = '' } = useParams<{ familyId: string }>()
  const { data: family } = useFamilyQuery(familyId)
  const addMember = useAddMemberMutation()
  const updateRole = useUpdateMemberRoleMutation()
  const removeMember = useRemoveMemberMutation()

  const [open, setOpen] = useState(false)
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(
    null,
  )
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MemberValues>({
    resolver: zodFormResolver(memberSchema),
    defaultValues: { email: '', role: 'MEMBER' },
  })

  const myRole = family?.myRole
  const canManage = myRole === 'OWNER' || myRole === 'ADMIN'

  async function onSubmit(values: MemberValues) {
    await addMember.mutateAsync({
      familyId,
      email: values.email,
      role: values.role,
    })
    reset()
    setOpen(false)
    toast.success('Member added')
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Members</h2>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus />
                Add member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
                <DialogHeader>
                  <DialogTitle>Add a member</DialogTitle>
                  <DialogDescription>
                    The person must already have a Fin Log account — they will
                    be added by email.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="member-email">Email</Label>
                    <Input
                      id="member-email"
                      type="email"
                      autoFocus
                      aria-invalid={errors.email ? true : undefined}
                      {...register('email')}
                      placeholder="partner@example.com"
                    />
                    {errors.email && (
                      <p className="text-sm text-destructive">
                        {errors.email.message}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="member-role">Role</Label>
                    <Controller
                      control={control}
                      name="role"
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={(v) =>
                            field.onChange(v as FamilyRole)
                          }
                        >
                          <SelectTrigger id="member-role" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="MEMBER">Member</SelectItem>
                            <SelectItem value="ADMIN">Admin</SelectItem>
                            {myRole === 'OWNER' && (
                              <SelectItem value="OWNER">Owner</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Adding…' : 'Add member'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{family?.members.length ?? 0} people</CardTitle>
          <CardDescription>
            Members can record expenses and manage categories and ledgers.
            Admins manage members; owners can do everything.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {family?.members.map((member) => {
            const canModify =
              canManage &&
              (myRole === 'OWNER' ||
                (myRole === 'ADMIN' && member.role !== 'OWNER'))
            return (
              <div
                key={member.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    {member.user.image ? (
                      <img
                        src={member.user.image}
                        alt=""
                        className="size-9 rounded-full"
                      />
                    ) : (
                      <UserRound className="size-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {member.user.name}
                    </p>
                    <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <Mail className="size-3" />
                      {member.user.email}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Select
                    value={member.role}
                    disabled={!canModify}
                    onValueChange={(v) =>
                      void updateRole
                        .mutateAsync({
                          familyId,
                          memberId: member.id,
                          role: v as FamilyRole,
                        })
                        .then(() =>
                          toast.success(
                            `${member.user.name} is now ${
                              v === 'OWNER'
                                ? 'an owner'
                                : v === 'ADMIN'
                                  ? 'an admin'
                                  : 'a member'
                            }`,
                          ),
                        )
                    }
                  >
                    <SelectTrigger size="sm" className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MEMBER">Member</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                      <SelectItem value="OWNER">Owner</SelectItem>
                    </SelectContent>
                  </Select>
                  {canModify && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${member.user.name}`}
                      onClick={() =>
                        setRemoving({ id: member.id, name: member.user.name })
                      }
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Dialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove {removing?.name}?</DialogTitle>
            <DialogDescription>
              They will no longer be able to view or edit this family's
              ledgers and categories.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={removeMember.isPending}
              onClick={() =>
                removing &&
                void removeMember
                  .mutateAsync({ familyId, memberId: removing.id })
                  .then(() => {
                    toast.success(`${removing.name} removed`)
                    setRemoving(null)
                  })
              }
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
