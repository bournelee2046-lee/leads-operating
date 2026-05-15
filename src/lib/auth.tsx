import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { apiFetch } from './api'

export interface Role {
  id: number
  role_code: string
  role_name: string
  description?: string
  is_builtin?: number
  data_scope_type?: string
}

export interface CurrentUser {
  id: number
  username: string
  display_name: string
  phone?: string
  email?: string
  status: string
  roles: Role[]
  permissions: string[]
}

interface AuthContextValue {
  user: CurrentUser | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  hasPermission: (code?: string | null) => boolean
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      const result = await apiFetch<{ success: boolean; data: CurrentUser }>('/api/auth/me')
      setUser(result.data)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const login = async (username: string, password: string) => {
    const result = await apiFetch<{ success: boolean; data: CurrentUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    setUser(result.data)
  }

  const logout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
  }

  const value = useMemo<AuthContextValue>(() => {
    const permissions = new Set(user?.permissions || [])
    return {
      user,
      loading,
      login,
      logout,
      refresh,
      hasPermission: (code) => !code || permissions.has(code),
    }
  }, [user, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}

