import { AppShell } from '@/components/app-shell'
import { ProtectedRoute } from '@/components/protected-route'
import { CategoriesPage } from '@/pages/categories'
import { DashboardPage } from '@/pages/dashboard'
import { FamilyLayout } from '@/pages/family-layout'
import { HomePage } from '@/pages/home'
import { LedgerDetailPage } from '@/pages/ledger-detail'
import { LedgersPage } from '@/pages/ledgers'
import { MembersPage } from '@/pages/members'
import { NotFoundPage } from '@/pages/not-found'
import { SignInPage } from '@/pages/sign-in'
import { SignUpPage } from '@/pages/sign-up'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

/**
 * SPA with hash-based routing: every route lives after `#/`, so the app
 * works from any static host or file server with zero rewrite rules.
 * (PWA service worker additionally serves /index.html as navigation fallback.)
 */
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="sign-in" element={<SignInPage />} />
          <Route path="sign-up" element={<SignUpPage />} />
          <Route element={<ProtectedRoute />}>
            {/* Administration area (families, ledgers, categories, members).
                User-facing flows will live under the /* routes. */}
            <Route path="admin">
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="families/:familyId" element={<FamilyLayout />}>
                <Route index element={<Navigate to="ledgers" replace />} />
                <Route path="ledgers" element={<LedgersPage />} />
                <Route path="ledgers/:ledgerId" element={<LedgerDetailPage />} />
                <Route path="categories" element={<CategoriesPage />} />
                <Route path="members" element={<MembersPage />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
