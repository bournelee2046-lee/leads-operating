import { Navigate, useLocation } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { useAuth } from '@/lib/auth'

export default function ProtectedRoute({
  children,
  permission,
}: {
  children: JSX.Element
  permission?: string
}) {
  const { user, loading, hasPermission } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-primary-600 animate-spin mx-auto mb-3" />
          <p className="text-slate-600">正在确认登录状态...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (!hasPermission(permission)) {
    return <Navigate to="/unauthorized" replace />
  }

  return children
}

