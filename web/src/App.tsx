import { AppShell } from '@/components/app-shell'
import { ProtectedRoute } from '@/components/protected-route'
import { DashboardPage } from '@/pages/dashboard'
import { HomePage } from '@/pages/home'
import { NotFoundPage } from '@/pages/not-found'
import { SignInPage } from '@/pages/sign-in'
import { SignUpPage } from '@/pages/sign-up'
import { HashRouter, Route, Routes } from 'react-router-dom'

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
            <Route path="dashboard" element={<DashboardPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
