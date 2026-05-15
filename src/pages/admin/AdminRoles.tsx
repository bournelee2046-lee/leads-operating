import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Edit2, Save, Shield, X } from 'lucide-react'
import AdminLayout from './AdminLayout'
import { apiFetch } from '@/lib/api'

interface Role {
  id: number
  role_code: string
  role_name: string
  description?: string
  is_builtin: number
  user_count: number
  data_scope_type?: string
}

interface PermissionNode {
  id: number
  permission_code: string
  permission_name: string
  resource_type: string
  children: PermissionNode[]
}

interface RoleForm {
  role_code: string
  role_name: string
  description: string
  data_scope_type: string
}

const emptyForm: RoleForm = {
  role_code: '',
  role_name: '',
  description: '',
  data_scope_type: 'all',
}

const dataScopeLabels: Record<string, string> = {
  all: '全系统',
  region: '所属大区',
  zone: '所属战区',
  dealer: '所属门店',
  custom: '自定义门店范围',
  self: '仅本人数据',
}

function collectCodes(node: PermissionNode): string[] {
  return [node.permission_code, ...(node.children || []).flatMap(collectCodes)]
}

function collectChildCodes(node: PermissionNode): string[] {
  return (node.children || []).flatMap(collectCodes)
}

export default function AdminRoles() {
  const [roles, setRoles] = useState<Role[]>([])
  const [tree, setTree] = useState<PermissionNode[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null)
  const [selectedCodes, setSelectedCodes] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [form, setForm] = useState<RoleForm>(emptyForm)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [editForm, setEditForm] = useState<RoleForm>(emptyForm)
  const checkboxRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const selectedSet = useMemo(() => new Set(selectedCodes), [selectedCodes])

  const load = async () => {
    const [rolesResult, permissionsResult] = await Promise.all([
      apiFetch<{ success: boolean; data: Role[] }>('/api/admin/roles'),
      apiFetch<{ success: boolean; data: PermissionNode[] }>('/api/admin/permissions'),
    ])
    setRoles(rolesResult.data)
    setTree(permissionsResult.data)
    if (!selectedRoleId && rolesResult.data.length) {
      selectRole(rolesResult.data[0].id)
    }
  }

  useEffect(() => {
    load().catch((err) => setMessage(err instanceof Error ? err.message : '加载失败'))
  }, [])

  useEffect(() => {
    const updateIndeterminate = (nodes: PermissionNode[]) => {
      nodes.forEach((node) => {
        const ref = checkboxRefs.current[node.permission_code]
        if (ref) {
          const childCodes = collectChildCodes(node)
          const checkedChildren = childCodes.filter((code) => selectedSet.has(code)).length
          ref.indeterminate = checkedChildren > 0 && checkedChildren < childCodes.length && !selectedSet.has(node.permission_code)
        }
        updateIndeterminate(node.children || [])
      })
    }
    updateIndeterminate(tree)
  }, [selectedSet, tree])

  const selectRole = async (roleId: number) => {
    setSelectedRoleId(roleId)
    const result = await apiFetch<{ success: boolean; data: { permissions: string[] } }>(`/api/admin/roles/${roleId}`)
    setSelectedCodes(result.data.permissions)
  }

  const createRole = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      await apiFetch('/api/admin/roles', { method: 'POST', body: JSON.stringify({ ...form, permission_codes: [] }) })
      setForm(emptyForm)
      await load()
      setMessage('角色已创建')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '创建失败')
    }
  }

  const openEdit = (role: Role) => {
    setEditingRole(role)
    setEditForm({
      role_code: role.role_code,
      role_name: role.role_name,
      description: role.description || '',
      data_scope_type: role.data_scope_type || 'all',
    })
  }

  const saveRoleInfo = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!editingRole) return
    try {
      await apiFetch(`/api/admin/roles/${editingRole.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          role_name: editForm.role_name,
          description: editForm.description,
          data_scope_type: editForm.data_scope_type,
        }),
      })
      setEditingRole(null)
      await load()
      setMessage('角色已更新')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败')
    }
  }

  const savePermissions = async () => {
    if (!selectedRoleId) return
    try {
      await apiFetch(`/api/admin/roles/${selectedRoleId}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permission_codes: selectedCodes }),
      })
      setMessage('权限已保存')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败')
    }
  }

  const deleteRole = async (role: Role) => {
    if (role.is_builtin) {
      setMessage('内置角色不可删除')
      return
    }
    if (role.user_count > 0) {
      setMessage('角色已被账号引用，不能删除')
      return
    }
    if (!window.confirm(`确认删除角色 ${role.role_name}？`)) return
    try {
      await apiFetch(`/api/admin/roles/${role.id}`, { method: 'DELETE' })
      setSelectedRoleId(null)
      setSelectedCodes([])
      await load()
      setMessage('角色已删除')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '删除失败')
    }
  }

  const toggleNode = (node: PermissionNode) => {
    const nodeCodes = collectCodes(node)
    const allChecked = nodeCodes.every((code) => selectedSet.has(code))
    setSelectedCodes((codes) => {
      const next = new Set(codes)
      if (allChecked) {
        nodeCodes.forEach((code) => next.delete(code))
      } else {
        nodeCodes.forEach((code) => next.add(code))
      }
      return Array.from(next)
    })
  }

  const renderNode = (node: PermissionNode) => {
    const childCodes = collectChildCodes(node)
    const checkedChildren = childCodes.filter((code) => selectedSet.has(code)).length
    const checked = selectedSet.has(node.permission_code)
    const partial = checkedChildren > 0 && checkedChildren < childCodes.length

    return (
      <div key={node.id} className="pl-4 py-1">
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            ref={(el) => { checkboxRefs.current[node.permission_code] = el }}
            type="checkbox"
            checked={checked}
            onChange={() => toggleNode(node)}
          />
          <span className={partial ? 'font-medium text-primary-700' : ''}>{node.permission_name}</span>
          <span className="text-xs text-slate-400">{node.permission_code}</span>
        </label>
        {node.children?.map(renderNode)}
      </div>
    )
  }

  return (
    <AdminLayout title="角色管理">
      <form onSubmit={createRole} className="bg-white border border-slate-200 rounded-lg p-5 mb-6 grid grid-cols-1 md:grid-cols-5 gap-3">
        <input placeholder="角色编码" value={form.role_code} onChange={(e) => setForm({ ...form, role_code: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2" required />
        <input placeholder="角色名称" value={form.role_name} onChange={(e) => setForm({ ...form, role_name: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2" required />
        <input placeholder="角色说明" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2" />
        <select value={form.data_scope_type} onChange={(e) => setForm({ ...form, data_scope_type: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2">
          {Object.entries(dataScopeLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select>
        <button className="bg-primary-600 text-white rounded-lg px-4 py-2 flex items-center justify-center gap-2">
          <Shield className="w-4 h-4" />
          新建角色
        </button>
      </form>

      {message && <div className="mb-4 bg-blue-50 border border-blue-100 text-blue-700 px-4 py-3 rounded-lg">{message}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-slate-200 font-semibold text-slate-900">角色列表</div>
          {roles.map((role) => (
            <div key={role.id} className={`p-4 border-b border-slate-100 ${selectedRoleId === role.id ? 'bg-primary-50' : ''}`}>
              <button onClick={() => selectRole(role.id)} className="text-left w-full">
                <div className="font-medium text-slate-900">{role.role_name}</div>
                <div className="text-xs text-slate-500">{role.role_code} · {role.user_count} 个账号 · {dataScopeLabels[role.data_scope_type || 'all']}</div>
                {role.description && <div className="text-xs text-slate-400 mt-1">{role.description}</div>}
              </button>
              <div className="flex items-center gap-3 mt-2">
                <button onClick={() => openEdit(role)} className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-800">
                  <Edit2 className="w-3.5 h-3.5" />
                  编辑
                </button>
                {role.is_builtin ? (
                  <span className="text-xs text-slate-400">内置角色不可删除</span>
                ) : (
                  <button
                    onClick={() => deleteRole(role)}
                    className={`text-sm ${role.user_count > 0 ? 'text-slate-400 cursor-not-allowed' : 'text-red-600 hover:text-red-700'}`}
                  >
                    删除
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">权限树</h2>
            <button onClick={savePermissions} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg">
              <Save className="w-4 h-4" />
              保存权限
            </button>
          </div>
          <div className="p-4 max-h-[620px] overflow-y-auto">{tree.map(renderNode)}</div>
        </div>
      </div>

      {editingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditingRole(null)} />
          <form onSubmit={saveRoleInfo} className="relative bg-white rounded-lg shadow-xl w-full max-w-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">编辑角色：{editingRole.role_code}</h2>
              <button type="button" onClick={() => setEditingRole(null)} className="p-1 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <input placeholder="角色名称" value={editForm.role_name} onChange={(e) => setEditForm({ ...editForm, role_name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2" required />
            <textarea placeholder="角色说明" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 min-h-24" />
            <select value={editForm.data_scope_type} onChange={(e) => setEditForm({ ...editForm, data_scope_type: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2">
              {Object.entries(dataScopeLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setEditingRole(null)} className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">取消</button>
              <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">保存</button>
            </div>
          </form>
        </div>
      )}
    </AdminLayout>
  )
}
