import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { orgUtility, roleHomePath } from '@/lib/roles'

interface ProtectedRouteProps {
  children: ReactNode
  requireAdmin?: boolean
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (requireAdmin && user.role !== 'admin') return <Navigate to={roleHomePath(user.role)} replace />

  // Kommunal idora operatori faqat O'Z sahifasida ishlaydi
  const utility = orgUtility(user.role)
  if (utility && !location.pathname.startsWith(`/billing/${utility}`)) {
    return <Navigate to={`/billing/${utility}`} replace />
  }

  return <>{children}</>
}
