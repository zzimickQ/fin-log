import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import {
  changePassword,
  getSession,
  updateUser,
  useSession,
} from '@/lib/auth-client'
import { toast, useTimeFormatStore } from '@/lib/stores'
import type { TimeMode } from '@/lib/stores'
import {
  changePasswordSchema,
  profileSchema,
  zodFormResolver,
  type ChangePasswordValues,
  type ProfileValues,
} from '@/lib/validations'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { KeyRound, ShieldCheck, UserRound, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Normalize a better-auth client error into a readable message. */
function authMessage(
  error: { message?: string } | undefined,
  fallback: string,
) {
  return error?.message || fallback
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?'
  )
}

export function ProfilePage() {
  const { data: session, isPending } = useSession()
  const user = session?.user

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (!user) {
    return (
      <p className="text-sm text-muted-foreground">
        Not signed in.{' '}
        <Link to="/sign-in" className="text-foreground underline">
          Sign in
        </Link>
      </p>
    )
  }

  // Keying on the user id remounts the forms when a different account signs in.
  return (
    <div
      key={user.id}
      className="mx-auto flex w-full max-w-2xl flex-col gap-6"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground select-none">
          {initials(user.name)}
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{user.name}</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <ProfileCard
        name={user.name}
        email={user.email}
        emailVerified={user.emailVerified}
      />

      <TimeFormatCard />

      <PasswordCard />
    </div>
  )
}

// ---------- profile info ----------

function ProfileCard({
  name,
  email,
  emailVerified,
}: {
  name: string
  email: string
  emailVerified: boolean
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileValues>({
    resolver: zodFormResolver(profileSchema),
    defaultValues: { name },
  })

  async function onSubmit(values: ProfileValues) {
    setServerError(null)
    const { error } = await updateUser({ name: values.name })
    if (error) {
      setServerError(authMessage(error, 'Unable to update your profile'))
      return
    }
    // Refresh the session store so the header/menu show the new name.
    await getSession()
    toast.success('Profile updated')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserRound className="size-4 text-muted-foreground" />
          Profile
        </CardTitle>
        <CardDescription>
          Your display name is shown to family members. Your account is
          identified by email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="profile-form"
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          className="flex flex-col gap-4"
          noValidate
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              autoComplete="name"
              maxLength={100}
              aria-invalid={errors.name ? true : undefined}
              {...register('name')}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-email">Email</Label>
            <div className="flex items-center gap-2">
              <Input
                id="profile-email"
                value={email}
                readOnly
                disabled
                className="opacity-80"
              />
              <Badge variant="outline" className="shrink-0">
                {emailVerified ? 'Verified' : 'Unverified'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Email changes aren’t supported yet — sign in with your current
              address.
            </p>
          </div>
          {serverError && (
            <p className="text-sm text-destructive">{serverError}</p>
          )}
        </form>
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          type="submit"
          form="profile-form"
          disabled={isSubmitting || !isDirty}
        >
          {isSubmitting ? 'Saving…' : 'Save changes'}
        </Button>
      </CardFooter>
    </Card>
  )
}

// ---------- time format preference ----------

const TIME_MODES: { id: TimeMode; label: string; hint: string }[] = [
  { id: '12h', label: '12-hour (AM/PM)', hint: 'Example: 2:05 PM' },
  { id: '24h', label: '24-hour', hint: 'Example: 14:05' },
]

function TimeFormatCard() {
  const mode = useTimeFormatStore((s) => s.mode)
  const setMode = useTimeFormatStore((s) => s.setMode)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="size-4 text-muted-foreground" />
          Time format
        </CardTitle>
        <CardDescription>
          Expense times are shown relative (e.g. “5m ago”) within the last
          hour, then as the local time in your preferred format. Saved on
          this device.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2">
          {TIME_MODES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMode(t.id)}
              className={cn(
                'flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors',
                mode === t.id
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/40'
                  : 'border-border hover:bg-muted/60',
              )}
            >
              <span
                className={cn(
                  'text-sm font-medium',
                  mode === t.id && 'text-primary',
                )}
              >
                {t.label}
              </span>
              <span className="text-xs text-muted-foreground">{t.hint}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------- change password ----------

function PasswordCard() {
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({
    resolver: zodFormResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
      revokeOtherSessions: true,
    },
  })

  async function onSubmit(values: ChangePasswordValues) {
    setServerError(null)
    const { error } = await changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: values.revokeOtherSessions,
    })
    if (error) {
      setServerError(
        authMessage(
          error,
          'Unable to change your password. Is the current one correct?',
        ),
      )
      return
    }
    reset()
    toast.success(
      values.revokeOtherSessions
        ? 'Password changed — other devices were signed out'
        : 'Password changed',
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" />
          Change password
        </CardTitle>
        <CardDescription>
          Use at least 8 characters. Choose something you don’t use elsewhere.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="password-form"
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          className="flex flex-col gap-4"
          noValidate
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              aria-invalid={errors.currentPassword ? true : undefined}
              {...register('currentPassword')}
            />
            {errors.currentPassword && (
              <p className="text-sm text-destructive">
                {errors.currentPassword.message}
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                aria-invalid={errors.newPassword ? true : undefined}
                {...register('newPassword')}
              />
              {errors.newPassword && (
                <p className="text-sm text-destructive">
                  {errors.newPassword.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm-password">Repeat new password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                aria-invalid={errors.confirmPassword ? true : undefined}
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>
          </div>
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="size-4"
              style={{ accentColor: 'var(--primary)' }}
              {...register('revokeOtherSessions')}
            />
            <ShieldCheck className="size-4 shrink-0" />
            Sign out all other devices
          </label>
          {serverError && (
            <p className="text-sm text-destructive">{serverError}</p>
          )}
        </form>
      </CardContent>
      <CardFooter className="justify-end">
        <Button type="submit" form="password-form" disabled={isSubmitting}>
          {isSubmitting ? 'Updating…' : 'Change password'}
        </Button>
      </CardFooter>
    </Card>
  )
}
