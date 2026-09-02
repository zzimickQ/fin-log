// API types — mirror the Fastify server's zod response schemas.

export type FamilyRole = 'OWNER' | 'ADMIN' | 'MEMBER'

export interface UserBrief {
  id: string
  name: string
  email: string
  image: string | null
}

export interface FamilyMember {
  id: string
  role: FamilyRole
  user: UserBrief
}

export interface FamilySummary {
  id: string
  name: string
  role: FamilyRole
  memberCount: number
  ledgerCount: number
  createdAt: string
}

export interface LedgerSummary {
  id: string
  name: string
  description: string | null
  expenseCount: number
  uncategorizedCount: number
  sum: number
  createdAt: string
}

/** Flattened ledger row for the navbar switcher (GET /ledgers/mine). */
export interface MyLedger {
  id: string
  name: string
  description: string | null
  familyId: string
  familyName: string
  expenseCount: number
  uncategorizedCount: number
}

export interface CategoryNode {
  id: string
  name: string
  description: string | null
  parentId: string | null
  expenseCount: number
  children: CategoryNode[]
}

export interface CategoryBrief {
  id: string
  name: string
  parentId: string | null
}

export interface FamilyDetail {
  id: string
  name: string
  myRole: FamilyRole
  members: FamilyMember[]
  ledgers: LedgerSummary[]
  categories: CategoryNode[]
  createdAt: string
}

export interface Expense {
  id: string
  ledgerId: string
  amount: number
  currency: string
  description: string | null
  note: string | null
  occurredAt: string
  createdAt: string
  category: CategoryBrief | null
  createdBy: UserBrief
  paidBy: UserBrief | null
}

export interface RecentExpense extends Expense {
  ledger: { id: string; name: string; family: { id: string; name: string } }
}
