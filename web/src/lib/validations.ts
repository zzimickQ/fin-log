import { z } from 'zod'
import type { FieldErrors, Resolver } from 'react-hook-form'
import type { FamilyRole } from './types'

/**
 * react-hook-form resolver for a zod schema, typed to the schema's OUTPUT
 * values (so `useForm<SignInValues>` etc. accept it). The hand-rolled
 * resolver is needed because zod v4 coerced fields (e.g. z.coerce.number())
 * have `unknown` INPUT types, which the standard resolvers reject.
 *
 * The resolver receives raw form values (strings from inputs), validates
 * them with `schema.safeParse` (which coerces), and returns the parsed
 * OUTPUT values to react-hook-form.
 */
export function zodFormResolver<S extends z.ZodType<Record<string, unknown>>>(
  schema: S,
): Resolver<z.infer<S>, unknown, z.infer<S>> {
  return async (values, _context, options) => {
    const result = schema.safeParse(values)
    if (result.success) {
      return { values: result.data, errors: {} }
    }
    const errors: FieldErrors<z.infer<S>> = {}
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || 'root'
      if (!(key in errors)) {
        ;(errors as Record<string, { type: string; message: string }>)[key] = {
          type: issue.code,
          message: issue.message,
        }
      }
    }
    if (!options.shouldUseNativeValidation) return { values: {}, errors }
    return { values: {}, errors }
  }
}

/**
 * Form validation schemas (zod v4). Coercion for numeric inputs so the
 * raw string from a text/number input is validated as a number.
 */

// ---------- auth ----------

export const signInSchema = z.object({
  email: z.string({ message: 'Enter your email' }).email('Enter a valid email'),
  password: z.string({ message: 'Enter your password' }).min(1, 'Password is required'),
})
export type SignInValues = z.infer<typeof signInSchema>

export const signUpSchema = z.object({
  name: z.string({ message: 'Enter your name' }).trim().min(1, 'Name is required').max(100),
  email: z.string({ message: 'Enter your email' }).email('Enter a valid email'),
  password: z
    .string({ message: 'Choose a password' })
    .min(8, 'Password must be at least 8 characters'),
})
export type SignUpValues = z.infer<typeof signUpSchema>

// ---------- profile / password ----------

export const profileSchema = z.object({
  name: z.string({ message: 'Enter your name' }).trim().min(1, 'Name is required').max(100),
})
export type ProfileValues = z.infer<typeof profileSchema>

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ message: 'Enter your current password' })
      .min(1, 'Enter your current password'),
    newPassword: z
      .string({ message: 'Choose a new password' })
      .min(8, 'New password must be at least 8 characters')
      .max(128),
    confirmPassword: z.string({ message: 'Repeat the new password' }),
    revokeOtherSessions: z.boolean(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: 'New password must be different from the current one',
    path: ['newPassword'],
  })
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>

// ---------- family / ledger ----------

export const familySchema = z.object({
  name: z.string({ message: 'Enter a name' }).trim().min(1, 'Name is required').max(100),
})
export type FamilyValues = z.infer<typeof familySchema>

export const ledgerSchema = z.object({
  name: z.string({ message: 'Enter a name' }).trim().min(1, 'Name is required').max(100),
  description: z.string().trim().max(500).optional().or(z.literal('')),
})
export type LedgerValues = z.infer<typeof ledgerSchema>

// ---------- category ----------

export const categorySchema = z.object({
  name: z.string({ message: 'Enter a name' }).trim().min(1, 'Name is required').max(100),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  parentId: z.string().optional().or(z.literal('')),
})
export type CategoryValues = z.infer<typeof categorySchema>

export const moveCategorySchema = z.object({
  parentId: z.string().optional().or(z.literal('')),
})
export type MoveCategoryValues = z.infer<typeof moveCategorySchema>

// ---------- members ----------

export const memberSchema = z.object({
  email: z.string({ message: 'Enter an email' }).email('Enter a valid email'),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER'] as const),
})
export type MemberValues = z.infer<typeof memberSchema>

// ---------- expenses ----------

/** Amount from a text/number input (raw string) → validated number. */
const amountField = z
  .string({ message: 'Enter a valid amount' })
  .trim()
  .min(1, 'Enter a valid amount')
  .refine((v) => !Number.isNaN(Number(v)) && Number(v) >= 0, {
    message: 'Enter a valid amount',
  })
  .transform((v) => Number(v))

/** Quick capture: just the essentials, category comes later. */
export const expenseCaptureSchema = z.object({
  amount: amountField,
  description: z.string().trim().max(200).optional().or(z.literal('')),
  paidById: z.string().optional().or(z.literal('')),
  occurredAt: z.string().optional().or(z.literal('')),
})
export type ExpenseCaptureValues = z.infer<typeof expenseCaptureSchema>

/** Full edit including note, category and payer. */
export const expenseEditSchema = z.object({
  amount: amountField,
  description: z.string().trim().max(200).optional().or(z.literal('')),
  note: z.string().trim().max(2000).optional().or(z.literal('')),
  categoryId: z.string().optional().or(z.literal('')),
  paidById: z.string().optional().or(z.literal('')),
  occurredAt: z.string({ message: 'Choose a date' }).min(1, 'Choose a date'),
})
export type ExpenseEditValues = z.infer<typeof expenseEditSchema>

// ---------- shared ----------

export const ROLE_OPTIONS: { value: FamilyRole; label: string }[] = [
  { value: 'MEMBER', label: 'Member' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'OWNER', label: 'Owner' },
]
