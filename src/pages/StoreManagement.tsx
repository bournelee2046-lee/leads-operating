import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Edit3, Info, Plus, Save, Settings, Trash2, ToggleLeft, ToggleRight, X } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import RegionZoneFilter from '@/components/RegionZoneFilter'
import type { Pagination, StatusOption, StoreFilters, StoreRow } from './storeTypes'

type StoreQuery = {
  region: string
  zone: string
  source_store_status: string
  store_status: string
  governance_status: string
  search: string
}

type StoreForm = {
  store_status: string
  governance_status: string
  status_note: string
  admin_note: string
}

type ConfigForm = {
  name: string
  color: string
  description: string
}

const emptyFilters: StoreFilters = {
  regions: [],
  zones: [],
  source_store_statuses: [],
  store_statuses: [],
  governance_statuses: [],
  ratings: [],
}

const colorOptions = [
  { value: '#16a34a', label: '绿色' },
  { value: '#2563eb', label: '蓝色' },
  { value: '#d97706', label: '黄色' },
  { value: '#dc2626', label: '红色' },
  { value: '#64748b', label: '灰色' },
]

export default function StoreManagement() {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('store_management.edit')
  const canViewConfig = hasPermission('store_management.config.view')
  const canManageConfig = hasPermission('store_management.config.manage')
  const [rows, setRows] = useState<StoreRow[]>([])
  const [filters, setFilters] = useState<StoreFilters>(emptyFilters)
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, page_size: 50, total_pages: 0 })
  const [query, setQuery] = useState<StoreQuery>({ region: '', zone: '', source_store_status: '', store_status: '', governance_status: '', search: '' })
  const [editing, setEditing] = useState<StoreRow | null>(null)
  const [form, setForm] = useState<StoreForm>({ store_status: '', governance_status: '', status_note: '', admin_note: '' })
  const [configOpen, setConfigOpen] = useState(false)
  const [configType, setConfigType] = useState<'门店状态' | '治理状态'>('门店状态')
  const [configForm, setConfigForm] = useState<ConfigForm>({ name: '', color: '#64748b', description: '' })

  const activeStoreStatuses = useMemo(() => filters.store_statuses.filter(option => option.enabled !== 0), [filters.store_statuses])
  const activeGovernanceStatuses = useMemo(() => filters.governance_statuses.filter(option => option.enabled !== 0), [filters.governance_statuses])
  const configOptions = configType === '门店状态' ? filters.store_statuses : filters.governance_statuses

  const loadFilters = useCallback(async () => {
    const res = await apiFetch<{ success: boolean; data: StoreFilters }>('/api/store-management/filters')
    setFilters({ ...emptyFilters, ...res.data })
  }, [])

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: '50' })
    Object.entries(query).forEach(([k, v]) => { if (v) params.append(k, v) })
    const res = await apiFetch<{ success: boolean; data: StoreRow[]; pagination: Pagination }>(`/api/store-management/stores?${params}`)
    setRows(res.data || [])
    setPagination(res.pagination)
  }, [query])

  useEffect(() => { loadFilters() }, [loadFilters])
  useEffect(() => { load(1) }, [load])

  const openEdit = (row: StoreRow) => {
    setEditing(row)
    setForm({
      store_status: row.store_status || '',
      governance_status: row.governance_status || '',
      status_note: row.status_note || '',
      admin_note: row.admin_note || '',
    })
  }

  const save = async () => {
    if (!editing) return
    await apiFetch(`/api/store-management/stores/${encodeURIComponent(editing.store_code)}`, { method: 'PATCH', body: JSON.stringify(form) })
    setEditing(null)
    await loadFilters()
    await load(pagination.page)
  }

  const createStatus = async () => {
    const name = configForm.name.trim()
    if (!name) return
    await apiFetch('/api/store-management/statuses', {
      method: 'POST',
      body: JSON.stringify({ config_type: configType, name, color: configForm.color, description: configForm.description, enabled: true }),
    })
    setConfigForm({ name: '', color: '#64748b', description: '' })
    await loadFilters()
  }

  const updateStatus = async (option: StatusOption, patch: Partial<StatusOption>) => {
    await apiFetch(`/api/store-management/statuses/${option.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: patch.name ?? option.name,
        color: patch.color ?? option.color,
        sort_order: patch.sort_order ?? option.sort_order,
        enabled: patch.enabled ?? option.enabled ?? 1,
        description: patch.description ?? option.description ?? '',
      }),
    })
    await loadFilters()
  }

  const deleteStatus = async (option: StatusOption) => {
    if (!window.confirm(`确认删除“${option.name}”？`)) return
    await apiFetch(`/api/store-management/statuses/${option.id}`, { method: 'DELETE' })
    await loadFilters()
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center">
            <button onClick={() => window.history.back()} className="mr-4 p-2 hover:bg-slate-100 rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">门店管理</h1>
              <p className="text-xs text-slate-500">维护门店状态、治理状态和备注；在网状态来自源表只读展示</p>
            </div>
          </div>
          {canViewConfig && (
            <button onClick={() => setConfigOpen(true)} className="inline-flex items-center px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white hover:bg-slate-50">
              <Settings className="w-4 h-4 mr-1" />状态配置
            </button>
          )}
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-4 py-3 text-sm">
          在网状态为总部源表状态，只读展示；门店状态和治理状态由本系统维护，本阶段不参与运营日报、漏斗和首页看板计算。
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <RegionZoneFilter
              region={query.region}
              zone={query.zone}
              options={filters}
              onRegionChange={v => setQuery(prev => ({ ...prev, region: v, zone: '' }))}
              onZoneChange={v => setQuery(prev => ({ ...prev, zone: v }))}
            />
            <Select label="在网状态" tooltip="该字段状态为总部标准，非治理标准" value={query.source_store_status} options={filters.source_store_statuses} onChange={v => setQuery({ ...query, source_store_status: v })} />
            <Select label="门店状态" value={query.store_status} options={activeStoreStatuses.map(o => o.name)} onChange={v => setQuery({ ...query, store_status: v })} />
            <Select label="治理状态" value={query.governance_status} options={activeGovernanceStatuses.map(o => o.name)} onChange={v => setQuery({ ...query, governance_status: v })} />
            <label className="block"><span className="text-xs text-slate-500">搜索</span><input value={query.search} onChange={e => setQuery({ ...query, search: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="店编号/店简称" /></label>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {['店编号', '店简称', '大区', '战区', '在网状态', '门店状态', '治理状态', '状态备注', '管理员备注', '更新时间', '操作'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h === '在网状态' ? <span className="inline-flex items-center gap-1">{h}<TooltipIcon text="该字段状态为总部标准，非治理标准" /></span> : h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.store_code} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono">{row.store_code}</td>
                    <td className="px-4 py-3 font-medium">{row.store_name}</td>
                    <td className="px-4 py-3">{row.region}</td>
                    <td className="px-4 py-3">{row.zone}</td>
                    <td className="px-4 py-3">{row.source_store_status || '-'}</td>
                    <td className="px-4 py-3"><StatusBadge name={row.store_status} options={filters.store_statuses} /></td>
                    <td className="px-4 py-3"><StatusBadge name={row.governance_status} options={filters.governance_statuses} /></td>
                    <td className="px-4 py-3 max-w-xs truncate">{row.status_note || '-'}</td>
                    <td className="px-4 py-3 max-w-xs truncate">{row.admin_note || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{row.updated_at || '-'}</td>
                    <td className="px-4 py-3">{canEdit ? <button onClick={() => openEdit(row)} className="inline-flex items-center text-primary-600"><Edit3 className="w-4 h-4 mr-1" />编辑</button> : <span className="text-slate-400">只读</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-slate-100 flex justify-between text-sm text-slate-600">
            <span>共 {pagination.total} 家门店，第 {pagination.page}/{pagination.total_pages || 1} 页</span>
            <div className="space-x-2">
              <button disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)} className="px-3 py-1 border rounded disabled:opacity-40">上一页</button>
              <button disabled={pagination.page >= pagination.total_pages} onClick={() => load(pagination.page + 1)} className="px-3 py-1 border rounded disabled:opacity-40">下一页</button>
            </div>
          </div>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="px-5 py-4 border-b border-slate-200 flex justify-between">
              <div><h2 className="font-semibold text-slate-900">编辑门店管理信息</h2><p className="text-xs text-slate-500">{editing.store_code} · {editing.store_name}</p></div>
              <button onClick={() => setEditing(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ReadOnlyField label="在网状态" tooltip="该字段状态为总部标准，非治理标准" value={editing.source_store_status || '-'} />
              <Select label="门店状态" value={form.store_status} options={activeStoreStatuses.map(o => o.name)} onChange={v => setForm({ ...form, store_status: v })} />
              <Select label="治理状态" value={form.governance_status} options={activeGovernanceStatuses.map(o => o.name)} onChange={v => setForm({ ...form, governance_status: v })} />
              <ReadOnlyField label="更新时间" value={editing.updated_at || '-'} />
              <div className="sm:col-span-2"><TextArea label="状态备注" value={form.status_note} onChange={v => setForm({ ...form, status_note: v })} /></div>
              <div className="sm:col-span-2"><TextArea label="管理员备注" value={form.admin_note} onChange={v => setForm({ ...form, admin_note: v })} /></div>
            </div>
            <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm">取消</button>
              <button onClick={save} className="inline-flex items-center px-3 py-2 bg-slate-900 text-white rounded-lg text-sm"><Save className="w-4 h-4 mr-1" />保存</button>
            </div>
          </div>
        </div>
      )}

      {configOpen && (
        <div className="fixed inset-0 bg-slate-900/40 flex justify-end z-50">
          <div className="bg-white shadow-xl w-full max-w-xl h-full flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex justify-between">
              <div><h2 className="font-semibold text-slate-900">状态配置</h2><p className="text-xs text-slate-500">维护门店状态和治理状态候选值</p></div>
              <button onClick={() => setConfigOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
                {(['门店状态', '治理状态'] as const).map(item => (
                  <button key={item} onClick={() => setConfigType(item)} className={`px-4 py-2 text-sm ${configType === item ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`}>{item}</button>
                ))}
              </div>

              {canManageConfig && (
                <div className="border border-slate-200 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block"><span className="text-xs text-slate-500">状态名称</span><input value={configForm.name} onChange={e => setConfigForm({ ...configForm, name: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="输入状态名称" /></label>
                  <Select label="颜色" value={configForm.color} options={colorOptions.map(o => o.value)} display={value => colorOptions.find(o => o.value === value)?.label || value} onChange={v => setConfigForm({ ...configForm, color: v })} />
                  <label className="block sm:col-span-2"><span className="text-xs text-slate-500">说明</span><input value={configForm.description} onChange={e => setConfigForm({ ...configForm, description: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="说明该状态的使用场景" /></label>
                  <div className="sm:col-span-2"><button onClick={createStatus} className="inline-flex items-center px-3 py-2 bg-primary-600 text-white rounded-lg text-sm"><Plus className="w-4 h-4 mr-1" />新增状态</button></div>
                </div>
              )}

              <div className="space-y-2">
                {configOptions.map(option => (
                  <div key={option.id} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3">
                    <div>
                      <StatusBadge name={option.name} options={[option]} />
                      <p className="text-xs text-slate-500 mt-1">{option.description || '未填写说明'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">排序 {option.sort_order}</span>
                      {canManageConfig && (
                        <>
                          <button onClick={() => updateStatus(option, { sort_order: Math.max(1, option.sort_order - 1) })} className="inline-flex items-center px-2 py-1 border border-slate-300 rounded text-sm">上移</button>
                          <button onClick={() => updateStatus(option, { sort_order: option.sort_order + 1 })} className="inline-flex items-center px-2 py-1 border border-slate-300 rounded text-sm">下移</button>
                          <button onClick={() => updateStatus(option, { enabled: option.enabled === 0 ? 1 : 0 })} className="inline-flex items-center px-2 py-1 border border-slate-300 rounded text-sm">
                            {option.enabled === 0 ? <ToggleLeft className="w-4 h-4 mr-1 text-slate-400" /> : <ToggleRight className="w-4 h-4 mr-1 text-primary-600" />}
                            {option.enabled === 0 ? '已禁用' : '已启用'}
                          </button>
                          <button onClick={() => deleteStatus(option)} className="inline-flex items-center px-2 py-1 border border-red-200 text-red-600 rounded text-sm">
                            <Trash2 className="w-4 h-4 mr-1" />删除
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {configOptions.length === 0 && <div className="border border-dashed border-slate-300 rounded-lg p-6 text-center text-slate-500">暂无配置</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Select({ label, tooltip, value, options, display, onChange }: { label: string; tooltip?: string; value: string; options: string[]; display?: (value: string) => string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500 inline-flex items-center gap-1">
        {label}
        {tooltip && <TooltipIcon text={tooltip} />}
      </span>
      <select value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
        <option value="">全部</option>
        {options.map(o => <option key={o} value={o}>{display ? display(o) : o}</option>)}
      </select>
    </label>
  )
}

function ReadOnlyField({ label, tooltip, value }: { label: string; tooltip?: string; value: string }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500 inline-flex items-center gap-1">{label}{tooltip && <TooltipIcon text={tooltip} />}</span>
      <div className="mt-1 w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-700 min-h-[38px]">{value}</div>
    </label>
  )
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="block"><span className="text-xs text-slate-500">{label}</span><textarea value={value} onChange={e => onChange(e.target.value)} rows={3} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
}

function TooltipIcon({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex">
      <Info className="w-3.5 h-3.5 text-slate-400" aria-label={text} />
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-56 -translate-x-1/2 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs leading-5 text-white shadow-lg group-hover:block">
        {text}
      </span>
    </span>
  )
}

function StatusBadge({ name, options }: { name?: string; options: StatusOption[] }) {
  if (!name) return <span className="text-slate-400">-</span>
  const option = options.find(item => item.name === name)
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 whitespace-nowrap">
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: option?.color || '#64748b' }} />
      {name}
    </span>
  )
}
