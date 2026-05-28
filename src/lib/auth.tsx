import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { apiFetch, resolveApiUrl } from './api'

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
    const res = await fetch(resolveApiUrl('/api/auth/login') || '/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const text = await res.text()
    let result: { success: boolean; data: CurrentUser; message?: string } | null = null
    try {
      result = text ? JSON.parse(text) : null
    } catch {
      throw new Error('后端服务返回异常，请确认服务已启动并稍后重试')
    }
    if (!res.ok || !result || result.success === false) {
      throw new Error(result?.message || '后端服务未返回有效登录结果，请确认服务已启动')
    }
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
