import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { RealtimeSync } from '@/components/RealtimeSync'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { AppLayout } from '@/components/layout/AppLayout'
import { KPISkeletonGrid, TableSkeleton } from '@/components/StateBlock'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getApiErrorMessage, getApiErrorStatus } from '@/lib/errors'
import { notify } from '@/lib/toast'

const LoginPage = lazy(() => import('@/pages/LoginPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const BuildingsPage = lazy(() => import('@/pages/BuildingsPage'))
const BuildingDetailPage = lazy(() => import('@/pages/BuildingDetailPage'))
const DevicesPage = lazy(() => import('@/pages/DevicesPage'))
const TestDevicesPage = lazy(() => import('@/pages/TestDevicesPage'))
const DeviceDetailPage = lazy(() => import('@/pages/DeviceDetailPage'))
const AlertsPage = lazy(() => import('@/pages/AlertsPage'))
const FirmwarePage = lazy(() => import('@/pages/FirmwarePage'))
const UsersPage = lazy(() => import('@/pages/UsersPage'))
const AuditPage = lazy(() => import('@/pages/AuditPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const ChatPage = lazy(() => import('@/pages/ChatPage'))
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'))
const BillingPage = lazy(() => import('@/pages/BillingPage'))
const TerritoryPage = lazy(() => import('@/pages/TerritoryPage'))
const DisplayPage = lazy(() => import('@/pages/DisplayPage'))

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      const status = getApiErrorStatus(error)
      if (status === 401 || status === 403 || (status && status >= 500)) return
      notify({ type: 'error', title: 'Maʼlumotlarni yuklashda xatolik', message: getApiErrorMessage(error) })
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

function PageFallback() {
  return (
    <div className="space-y-5 p-4 md:p-6">
      <KPISkeletonGrid />
      <TableSkeleton rows={6} />
    </div>
  )
}

function RouteBoundary({ children }: { children: ReactNode }) {
  const location = useLocation()
  return <ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary>
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider delayDuration={200}>
          <RealtimeSync />
          <Toaster position="top-right" richColors closeButton />
          <BrowserRouter>
            <RouteBoundary>
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/display" element={<DisplayPage />} />
                  <Route
                    element={
                      <ProtectedRoute>
                        <AppLayout />
                      </ProtectedRoute>
                    }
                  >
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/buildings" element={<BuildingsPage />} />
                    <Route path="/buildings/:id" element={<BuildingDetailPage />} />
                    <Route path="/devices" element={<DevicesPage />} />
                    <Route
                      path="/devices/test"
                      element={
                        <ProtectedRoute requireAdmin>
                          <TestDevicesPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="/devices/:id" element={<DeviceDetailPage />} />
                    <Route path="/alerts" element={<AlertsPage />} />
                    <Route path="/firmware" element={<FirmwarePage />} />
                    <Route
                      path="/users"
                      element={
                        <ProtectedRoute requireAdmin>
                          <UsersPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/audit"
                      element={
                        <ProtectedRoute requireAdmin>
                          <AuditPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/settings"
                      element={
                        <ProtectedRoute requireAdmin>
                          <SettingsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="/chat" element={<ChatPage />} />
                    <Route path="/analytics" element={<AnalyticsPage />} />
                    <Route path="/billing" element={<BillingPage />} />
                    <Route path="/billing/:utility" element={<BillingPage />} />
                    <Route path="/territory" element={<TerritoryPage />} />
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Route>
                </Routes>
              </Suspense>
            </RouteBoundary>
          </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
