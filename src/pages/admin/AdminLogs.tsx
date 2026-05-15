import { useEffect, useState } from 'react'
import { Eye, RefreshCw, RotateCcw, Search, X } from 'lucide-react'
import AdminLayout from './AdminLayout'
import { apiFetch } from '@/lib/api'

interface AuditLog {
  id: number
  operator_name?: string
  module?: string
  action?: string
  target_type?: string
  target_id?: string
  before_data?: string
  after_data?: string
  result: string
  error_message?: string
  ip_address?: string
  created_at: string
}

interface LoginLog {
  id: number
  username: string
  user_id?: number
  login_at: string
  login_ip?: string
  result: string
  failure_reason?: string
  user_agent?: string
}

type DetailLog = (AuditLog & { type: 'audit' }) | (LoginLog & { type: 'login' })

const emptyAuditFilters = { start_time: '', end_time: '', operator: '', module: '', action: '', result: '' }
const emptyLoginFilters = { start_time: '', end_time: '', username: '', result: '' }

function appendParams(base: string, filters: Record<string, string>) {
  const params = new URLSearchParams({ limit: '200' })
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, value)
  })
  return `${base}?${params}`
}

function prettyJson(value?: string) {
  if (!value) return '-'
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

export default function AdminLogs() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([])
  const [tab, setTab] = useState<'audit' | 'login'>('audit')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [auditFilters, setAuditFilters] = useState(emptyAuditFilters)
  const [loginFilters, setLoginFilters] = useState(emptyLoginFilters)
  const [detail, setDetail] = useState<DetailLog | null>(null)

  const loadAudit = async (filters = auditFilters) => {
    const result = await apiFetch<{ success: boolean; data: AuditLog[] }>(appendParams('/api/admin/audit-logs', filters))
    setAuditLogs(result.data)
  }

  const loadLogin = async (filters = loginFilters) => {
    const result = await apiFetch<{ success: boolean; data: LoginLog[] }>(appendParams('/api/admin/login-logs', filters))
    setLoginLogs(result.data)
  }

  const load = async () => {
    setLoading(true)
    setMessage('')
    try {
      await Promise.all([loadAudit(), loadLogin()])
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const applyAuditFilters = async () => {
    try {
      setLoading(true)
      await loadAudit(auditFilters)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '筛选失败')
    } finally {
      setLoading(false)
    }
  }

  const applyLoginFilters = async () => {
    try {
      setLoading(true)
      await loadLogin(loginFilters)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '筛选失败')
    } finally {
      setLoading(false)
    }
  }

  const resetAuditFilters = () => {
    setAuditFilters(emptyAuditFilters)
    loadAudit(emptyAuditFilters).catch((err) => setMessage(err instanceof Error ? err.message : '重置失败'))
  }

  const resetLoginFilters = () => {
    setLoginFilters(emptyLoginFilters)
    loadLogin(emptyLoginFilters).catch((err) => setMessage(err instanceof Error ? err.message : '重置失败'))
  }

  const openAuditDetail = async (log: AuditLog) => {
    const result = await apiFetch<{ success: boolean; data: AuditLog }>(`/api/admin/audit-logs/${log.id}`)
    setDetail({ ...result.data, type: 'audit' })
  }

  const openLoginDetail = async (log: LoginLog) => {
    const result = await apiFetch<{ success: boolean; data: LoginLog }>(`/api/admin/login-logs/${log.id}`)
    setDetail({ ...result.data, type: 'login' })
  }

  return (
    <AdminLayout title="操作日志">
      {message && <div className="mb-4 bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-lg">{message}</div>}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <button onClick={() => setTab('audit')} className={`px-4 py-2 rounded-lg ${tab === 'audit' ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>操作日志</button>
            <button onClick={() => setTab('login')} className={`px-4 py-2 rounded-lg ${tab === 'login' ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>登录日志</button>
          </div>
          <button onClick={load} className="p-2 hover:bg-slate-100 rounded-lg"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>

        {tab === 'audit' ? (
          <>
            <div className="p-4 border-b border-slate-100 bg-slate-50 grid grid-cols-1 md:grid-cols-7 gap-3">
              <input type="datetime-local" value={auditFilters.start_time} onChange={(e) => setAuditFilters({ ...auditFilters, start_time: e.target.value.replace('T', ' ') })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <input type="datetime-local" value={auditFilters.end_time} onChange={(e) => setAuditFilters({ ...auditFilters, end_time: e.target.value.replace('T', ' ') })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <input placeholder="操作人" value={auditFilters.operator} onChange={(e) => setAuditFilters({ ...auditFilters, operator: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <input placeholder="模块" value={auditFilters.module} onChange={(e) => setAuditFilters({ ...auditFilters, module: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <input placeholder="动作" value={auditFilters.action} onChange={(e) => setAuditFilters({ ...auditFilters, action: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <select value={auditFilters.result} onChange={(e) => setAuditFilters({ ...auditFilters, result: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
                <option value="">全部结果</option>
                <option value="success">成功</option>
                <option value="fail">失败</option>
              </select>
              <div className="flex gap-2">
                <button onClick={applyAuditFilters} className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 bg-primary-600 text-white rounded-lg text-sm"><Search className="w-4 h-4" />筛选</button>
                <button onClick={resetAuditFilters} className="px-3 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm"><RotateCcw className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left px-4 py-3">时间</th>
                    <th className="text-left px-4 py-3">操作人</th>
                    <th className="text-left px-4 py-3">模块</th>
                    <th className="text-left px-4 py-3">动作</th>
                    <th className="text-left px-4 py-3">对象</th>
                    <th className="text-left px-4 py-3">结果</th>
                    <th className="text-left px-4 py-3">IP</th>
                    <th className="text-left px-4 py-3">详情</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">{log.created_at}</td>
                      <td className="px-4 py-3">{log.operator_name || '-'}</td>
                      <td className="px-4 py-3">{log.module || '-'}</td>
                      <td className="px-4 py-3">{log.action || '-'}</td>
                      <td className="px-4 py-3">{log.target_type || '-'} {log.target_id || ''}</td>
                      <td className="px-4 py-3">{log.result === 'success' ? '成功' : `失败 ${log.error_message || ''}`}</td>
                      <td className="px-4 py-3">{log.ip_address || '-'}</td>
                      <td className="px-4 py-3"><button onClick={() => openAuditDetail(log)} className="text-primary-600 hover:text-primary-800 inline-flex items-center gap-1"><Eye className="w-4 h-4" />查看</button></td>
                    </tr>
                  ))}
                  {auditLogs.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">暂无操作日志</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <div className="p-4 border-b border-slate-100 bg-slate-50 grid grid-cols-1 md:grid-cols-5 gap-3">
              <input type="datetime-local" value={loginFilters.start_time} onChange={(e) => setLoginFilters({ ...loginFilters, start_time: e.target.value.replace('T', ' ') })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <input type="datetime-local" value={loginFilters.end_time} onChange={(e) => setLoginFilters({ ...loginFilters, end_time: e.target.value.replace('T', ' ') })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <input placeholder="登录账号" value={loginFilters.username} onChange={(e) => setLoginFilters({ ...loginFilters, username: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <select value={loginFilters.result} onChange={(e) => setLoginFilters({ ...loginFilters, result: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
                <option value="">全部结果</option>
                <option value="success">成功</option>
                <option value="fail">失败</option>
              </select>
              <div className="flex gap-2">
                <button onClick={applyLoginFilters} className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 bg-primary-600 text-white rounded-lg text-sm"><Search className="w-4 h-4" />筛选</button>
                <button onClick={resetLoginFilters} className="px-3 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm"><RotateCcw className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left px-4 py-3">时间</th>
                    <th className="text-left px-4 py-3">账号</th>
                    <th className="text-left px-4 py-3">结果</th>
                    <th className="text-left px-4 py-3">失败原因</th>
                    <th className="text-left px-4 py-3">IP</th>
                    <th className="text-left px-4 py-3">详情</th>
                  </tr>
                </thead>
                <tbody>
                  {loginLogs.map((log) => (
                    <tr key={log.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">{log.login_at}</td>
                      <td className="px-4 py-3">{log.username}</td>
                      <td className="px-4 py-3">{log.result === 'success' ? '成功' : '失败'}</td>
                      <td className="px-4 py-3">{log.failure_reason || '-'}</td>
                      <td className="px-4 py-3">{log.login_ip || '-'}</td>
                      <td className="px-4 py-3"><button onClick={() => openLoginDetail(log)} className="text-primary-600 hover:text-primary-800 inline-flex items-center gap-1"><Eye className="w-4 h-4" />查看</button></td>
                    </tr>
                  ))}
                  {loginLogs.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">暂无登录日志</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDetail(null)} />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[82vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">日志详情</h2>
              <button onClick={() => setDetail(null)} className="p-1 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            {detail.type === 'audit' ? (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <p><span className="text-slate-500">时间：</span>{detail.created_at}</p>
                  <p><span className="text-slate-500">操作人：</span>{detail.operator_name || '-'}</p>
                  <p><span className="text-slate-500">模块：</span>{detail.module || '-'}</p>
                  <p><span className="text-slate-500">动作：</span>{detail.action || '-'}</p>
                  <p><span className="text-slate-500">对象：</span>{detail.target_type || '-'} {detail.target_id || ''}</p>
                  <p><span className="text-slate-500">结果：</span>{detail.result}</p>
                  <p><span className="text-slate-500">IP：</span>{detail.ip_address || '-'}</p>
                  <p><span className="text-slate-500">错误：</span>{detail.error_message || '-'}</p>
                </div>
                <div>
                  <p className="text-slate-500 mb-1">操作前内容</p>
                  <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto text-xs">{prettyJson(detail.before_data)}</pre>
                </div>
                <div>
                  <p className="text-slate-500 mb-1">操作后内容</p>
                  <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto text-xs">{prettyJson(detail.after_data)}</pre>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <p><span className="text-slate-500">时间：</span>{detail.login_at}</p>
                <p><span className="text-slate-500">账号：</span>{detail.username}</p>
                <p><span className="text-slate-500">结果：</span>{detail.result}</p>
                <p><span className="text-slate-500">失败原因：</span>{detail.failure_reason || '-'}</p>
                <p><span className="text-slate-500">IP：</span>{detail.login_ip || '-'}</p>
                <div>
                  <p className="text-slate-500 mb-1">User-Agent</p>
                  <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto text-xs whitespace-pre-wrap">{detail.user_agent || '-'}</pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
