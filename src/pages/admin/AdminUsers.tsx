import React, { useEffect, useMemo, useState } from 'react'
import { Edit2, Plus, RefreshCw, RotateCcw, Search, X } from 'lucide-react'
import AdminLayout from './AdminLayout'
import { apiFetch } from '@/lib/api'

interface Role {
  id: number
  role_name: string
  role_code?: string
}

interface UserRow {
  id: number
  username: string
  display_name: string
  phone?: string
  email?: string
  status: string
  last_login_at?: string
  last_login_ip?: string
  roles: Role[]
  role_ids?: number[]
}

interface UserForm {
  username: string
  display_name: string
  phone: string
  email: string
  password: string
  status: string
  role_ids: number[]
}

const emptyForm: UserForm = {
  username: '',
  display_name: '',
  phone: '',
  email: '',
  password: 'Init@123456',
  status: 'active',
  role_ids: [],
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [filters, setFilters] = useState({ keyword: '', role_id: '', status: '' })
  const [form, setForm] = useState<UserForm>(emptyForm)
  const [editingUser, setEditingUser] = useState<UserRow | null>(null)
  const [editForm, setEditForm] = useState<UserForm>(emptyForm)

  const roleOptions = useMemo(() => roles.map((role) => ({ value: role.id, label: role.role_name })), [roles])

  const load = async (nextFilters = filters) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (nextFilters.keyword) params.append('keyword', nextFilters.keyword)
      if (nextFilters.role_id) params.append('role_id', nextFilters.role_id)
      if (nextFilters.status) params.append('status', nextFilters.status)
      const [usersResult, rolesResult] = await Promise.all([
        apiFetch<{ success: boolean; data: UserRow[] }>(`/api/admin/users${params.toString() ? `?${params}` : ''}`),
        apiFetch<{ success: boolean; data: Role[] }>('/api/admin/roles'),
      ])
      setUsers(usersResult.data)
      setRoles(rolesResult.data)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const toggleRole = (roleId: number, target: 'create' | 'edit') => {
    const setTarget = target === 'create' ? setForm : setEditForm
    setTarget((current) => ({
      ...current,
      role_ids: current.role_ids.includes(roleId)
        ? current.role_ids.filter((id) => id !== roleId)
        : [...current.role_ids, roleId],
    }))
  }

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage('')
    try {
      await apiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(form) })
      setForm(emptyForm)
      await load()
      setMessage(`账号已创建，初始密码：${form.password}`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '创建失败')
    }
  }

  const openEdit = async (user: UserRow) => {
    setMessage('')
    try {
      const result = await apiFetch<{ success: boolean; data: UserRow }>(`/api/admin/users/${user.id}`)
      setEditingUser(result.data)
      setEditForm({
        username: result.data.username,
        display_name: result.data.display_name,
        phone: result.data.phone || '',
        email: result.data.email || '',
        password: '',
        status: result.data.status,
        role_ids: result.data.role_ids || result.data.roles.map((role) => role.id),
      })
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '加载账号详情失败')
    }
  }

  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!editingUser) return
    try {
      await apiFetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          display_name: editForm.display_name,
          phone: editForm.phone,
          email: editForm.email,
          role_ids: editForm.role_ids,
        }),
      })
      setEditingUser(null)
      await load()
      setMessage('账号已更新')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败')
    }
  }

  const changeStatus = async (user: UserRow) => {
    const status = user.status === 'active' ? 'disabled' : 'active'
    const label = status === 'active' ? '启用' : '停用'
    if (!window.confirm(`确认${label}账号 ${user.username}？`)) return
    try {
      await apiFetch(`/api/admin/users/${user.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
      await load()
      setMessage(`账号已${label}`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '操作失败')
    }
  }

  const resetPassword = async (user: UserRow) => {
    if (!window.confirm(`确认重置账号 ${user.username} 的密码？`)) return
    try {
      const result = await apiFetch<{ success: boolean; data: { temporary_password: string } }>(`/api/admin/users/${user.id}/reset-password`, { method: 'POST' })
      setMessage(`${user.username} 临时密码：${result.data.temporary_password}`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '重置失败')
    }
  }

  const applyFilters = () => load(filters)

  const resetFilters = () => {
    const next = { keyword: '', role_id: '', status: '' }
    setFilters(next)
    load(next)
  }

  const renderRoleChecks = (selectedIds: number[], target: 'create' | 'edit') => (
    <div className="flex flex-wrap gap-2">
      {roleOptions.map((role) => (
        <label key={role.value} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm cursor-pointer ${
          selectedIds.includes(role.value) ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
        }`}>
          <input type="checkbox" checked={selectedIds.includes(role.value)} onChange={() => toggleRole(role.value, target)} />
          {role.label}
        </label>
      ))}
    </div>
  )

  return (
    <AdminLayout title="账号管理">
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input placeholder="账号 / 姓名" value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2" />
          <select value={filters.role_id} onChange={(e) => setFilters({ ...filters, role_id: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2">
            <option value="">全部角色</option>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.role_name}</option>)}
          </select>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2">
            <option value="">全部状态</option>
            <option value="active">启用</option>
            <option value="disabled">停用</option>
          </select>
          <button onClick={applyFilters} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg">
            <Search className="w-4 h-4" />
            查询
          </button>
          <button onClick={resetFilters} className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">
            <RotateCcw className="w-4 h-4" />
            重置
          </button>
        </div>
      </div>

      <form onSubmit={createUser} className="bg-white border border-slate-200 rounded-lg p-5 mb-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <input placeholder="登录账号" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2" required />
          <input placeholder="用户姓名" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2" required />
          <input placeholder="手机号" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2" />
          <input placeholder="邮箱" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2" />
          <input placeholder="初始密码" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2" required />
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2">
            <option value="active">启用</option>
            <option value="disabled">停用</option>
          </select>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">绑定角色</div>
            {renderRoleChecks(form.role_ids, 'create')}
          </div>
          <button className="shrink-0 bg-primary-600 text-white rounded-lg px-4 py-2 flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" />
            新建账号
          </button>
        </div>
      </form>

      {message && <div className="mb-4 bg-blue-50 border border-blue-100 text-blue-700 px-4 py-3 rounded-lg">{message}</div>}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="font-semibold text-slate-900">账号列表</h2>
          <button onClick={() => load()} className="p-2 hover:bg-slate-100 rounded-lg"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3">账号</th>
                <th className="text-left px-4 py-3">姓名</th>
                <th className="text-left px-4 py-3">联系方式</th>
                <th className="text-left px-4 py-3">角色</th>
                <th className="text-left px-4 py-3">状态</th>
                <th className="text-left px-4 py-3">最近登录</th>
                <th className="text-left px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{user.username}</td>
                  <td className="px-4 py-3">{user.display_name}</td>
                  <td className="px-4 py-3 text-slate-500">{user.phone || '-'}<br />{user.email || '-'}</td>
                  <td className="px-4 py-3">{user.roles.map((role) => role.role_name).join('、') || '-'}</td>
                  <td className="px-4 py-3">{user.status === 'active' ? '启用' : '停用'}</td>
                  <td className="px-4 py-3">{user.last_login_at || '-'}<br />{user.last_login_ip || ''}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-3">
                      <button onClick={() => openEdit(user)} className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-800"><Edit2 className="w-3.5 h-3.5" />编辑</button>
                      <button onClick={() => changeStatus(user)} className="text-primary-600 hover:text-primary-800">{user.status === 'active' ? '停用' : '启用'}</button>
                      <button onClick={() => resetPassword(user)} className="text-primary-600 hover:text-primary-800">重置密码</button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">暂无账号</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditingUser(null)} />
          <form onSubmit={saveEdit} className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">编辑账号：{editingUser.username}</h2>
              <button type="button" onClick={() => setEditingUser(null)} className="p-1 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input placeholder="用户姓名" value={editForm.display_name} onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2" required />
              <input placeholder="手机号" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2" />
              <input placeholder="邮箱" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2" />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-700 mb-2">绑定角色</div>
              {renderRoleChecks(editForm.role_ids, 'edit')}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setEditingUser(null)} className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">取消</button>
              <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">保存</button>
            </div>
          </form>
        </div>
      )}
    </AdminLayout>
  )
}
