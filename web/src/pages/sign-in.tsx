import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { signIn } from '@/lib/auth-client'
import { signInSchema, zodFormResolver, type SignInValues } from '@/lib/validations'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function SignInPage() {
  const location = useLocation()
  const from =
    (location.state as { from?: { pathname?: string } } | null)?.from
      ?.pathname ?? '/'

  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    resolver: zodFormResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(values: SignInValues) {
    setServerError(null)
    const { error } = await signIn.email({
      email: values.email,
      password: values.password,
      callbackURL: from,
    })
    if (error) {
      setServerError(error.message ?? 'Unable to sign in')
      return
    }
    // Full page load (not an SPA navigate): better-auth's client store caches
    // the pre-auth "no session" state, so an in-app navigation right after
    // signing in makes ProtectedRoute bounce back to /sign-in. Note the query
    // param: hash-only URL changes are same-document navigations (no reload),
    // so the URL must differ beyond the hash to force a fresh app boot that
    // reads the session cookie.
    window.location.href = `/?auth=ok#${from}`
  }

  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-sm flex-col justify-center">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>
            Welcome back — sign in to your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e: FormEvent) => void handleSubmit(onSubmit)(e)}
            className="flex flex-col gap-4"
            noValidate
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={errors.email ? true : undefined}
                {...register('email')}
              />
              {errors.email && (
                <p className="text-sm text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={errors.password ? true : undefined}
                {...register('password')}
              />
              {errors.password && (
                <p className="text-sm text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>
            {serverError && (
              <p className="text-sm text-destructive">{serverError}</p>
            )}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            No account yet?{' '}
            <Link
              to="/sign-up"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
