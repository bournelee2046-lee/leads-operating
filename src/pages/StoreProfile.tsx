import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Search, RotateCcw, Store, AlertTriangle, ClipboardList, AlertCircle } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import RegionZoneFilter from '@/components/RegionZoneFilter'
import type { Pagination, StoreFilters, StoreRow } from './storeTypes'
import { fmt } from './storeTypes'

const emptyFilters: StoreFilters = { regions: [], zones: [], source_store_statuses: [], store_statuses: [], governance_statuses: [], ratings: [] }

export default function StoreProfile() {
  const [rows, setRows] = useState<StoreRow[]>([])
  const [filters, setFilters] = useState<StoreFilters>(emptyFilters)
  const [summary, setSummary] = useState<any>(null)
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, page_size: 50, total_pages: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'all' | 'frequent' | 'reason'>('all')
  const [form, setForm] = useState({
    region: '', zone: '', store_status: '', follow_status: '', search: '',
  })
  const [frequentRows, setFrequentRows] = useState<StoreRow[]>([])
  const [reasonRows, setReasonRows] = useState<any[]>([])

  useEffect(() => {
    apiFetch<{ success: boolean; data: StoreFilters }>('/api/store-profile/filters').then(res => setFilters(res.data))
    apiFetch<{ success: boolean; data: any }>('/api/store-profile/summary').then(res => setSummary(res.data))
  }, [])

  const loadRows = useCallback(async (page = 1) => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ page: String(page), page_size: '50' })
    Object.entries(form).forEach(([key, value]) => { if (value) params.append(key, value) })
    try {
      const res = await apiFetch<{ success: boolean; data: StoreRow[]; pagination: Pagination }>(`/api/store-profile/stores?${params}`)
      setRows(res.data || [])
      setPagination(res.pagination)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载门店档案失败')
    } finally {
      setLoading(false)
    }
  }, [form])

  const loadFrequent = async () => {
    const res = await apiFetch<{ success: boolean; data: StoreRow[] }>('/api/store-profile/frequent-stores?min_times=3')
    setFrequentRows(res.data || [])
  }

  const loadReasons = async () => {
    const res = await apiFetch<{ success: boolean; data: { reason_distribution: any[] } }>('/api/store-profile/reason-analysis')
    setReasonRows(res.data.reason_distribution || [])
  }

  useEffect(() => { loadRows(1) }, [loadRows])
  useEffect(() => {
    if (tab === 'frequent') loadFrequent()
    if (tab === 'reason') loadReasons()
  }, [tab])

  const reset = () => setForm({ region: '', zone: '', store_status: '', follow_status: '', search: '' })

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center">
          <button onClick={() => window.history.back()} className="mr-4 p-2 hover:bg-slate-100 rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">门店档案</h1>
            <p className="text-xs text-slate-500">从门店视角查看基础信息、日报趋势、跟进历史与原因分析</p>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <SummaryCard icon={Store} label="已跟进门店" value={summary?.followed_store_count ?? '-'} />
          <SummaryCard icon={ClipboardList} label="跟进记录" value={summary?.follow_record_count ?? '-'} />
          <SummaryCard icon={AlertTriangle} label="高频问题店" value={summary?.high_freq_store_count ?? '-'} />
          <SummaryCard icon={Store} label="平均跟进次数" value={summary?.avg_follow_count ?? '-'} />
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-6 gap-3">
            <RegionZoneFilter
              region={form.region}
              zone={form.zone}
              options={filters}
              onRegionChange={v => setForm(prev => ({ ...prev, region: v, zone: '' }))}
              onZoneChange={v => setForm(prev => ({ ...prev, zone: v }))}
            />
            <Select label="门店状态" value={form.store_status} options={filters.store_statuses.filter(option => option.enabled !== 0).map(option => option.name)} onChange={v => setForm({ ...form, store_status: v })} />
            <Select label="跟进状态" value={form.follow_status} options={['followed', 'unfollowed']} optionLabels={{ followed: '已跟进', unfollowed: '未跟进' }} onChange={v => setForm({ ...form, follow_status: v })} />
            <Field label="搜索" value={form.search} onChange={v => setForm({ ...form, search: v })} placeholder="店编号/店简称" />
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => loadRows(1)} className="inline-flex items-center px-3 py-2 bg-slate-900 text-white rounded-lg text-sm"><Search className="w-4 h-4 mr-1" />查询</button>
            <button onClick={reset} className="inline-flex items-center px-3 py-2 border border-slate-300 rounded-lg text-sm"><RotateCcw className="w-4 h-4 mr-1" />重置</button>
          </div>
          {error && <div className="mt-3 flex items-center gap-2 text-sm text-red-600"><AlertCircle className="w-4 h-4" />{error}</div>}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="border-b border-slate-200 px-4 pt-3">
            <div className="flex gap-1">
              {[['all', '全部门店'], ['frequent', '高频问题店'], ['reason', '原因分析']].map(([key, label]) => (
                <button key={key} onClick={() => setTab(key as any)} className={`px-4 py-2 text-sm border-b-2 ${tab === key ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500'}`}>{label}</button>
              ))}
            </div>
          </div>
          {tab === 'reason' ? <ReasonTable rows={reasonRows} /> : <StoreTable rows={tab === 'all' ? rows : frequentRows} loading={loading} />}
          {tab === 'all' && (
            <div className="px-4 py-3 border-t border-slate-100 flex justify-between text-sm text-slate-600">
              <span>共 {pagination.total} 家门店，第 {pagination.page}/{pagination.total_pages || 1} 页</span>
              <div className="space-x-2">
                <button disabled={pagination.page <= 1} onClick={() => loadRows(pagination.page - 1)} className="px-3 py-1 border rounded disabled:opacity-40">上一页</button>
                <button disabled={pagination.page >= pagination.total_pages} onClick={() => loadRows(pagination.page + 1)} className="px-3 py-1 border rounded disabled:opacity-40">下一页</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value }: any) {
  return <div className="bg-white border border-slate-200 rounded-lg p-4"><Icon className="w-5 h-5 text-slate-500 mb-3" /><p className="text-sm text-slate-500">{label}</p><p className="text-2xl font-semibold text-slate-900">{value}</p></div>
}

function Field({ label, value, onChange, type = 'text', placeholder = '' }: any) {
  return <label className="block"><span className="text-xs text-slate-500">{label}</span><input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
}

function Select({ label, value, options, onChange, optionLabels = {} }: any) {
  return <label className="block"><span className="text-xs text-slate-500">{label}</span><select value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"><option value="">全部</option>{options.map((o: string) => <option key={o} value={o}>{optionLabels[o] || o}</option>)}</select></label>
}

function StoreTable({ rows, loading }: { rows: StoreRow[]; loading: boolean }) {
  return <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{['店编号', '店简称', '大区', '战区', '门店状态', '平均线索', '平均到店', '到店率', '跟进次数', '最近跟进', '操作'].map(h => <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={11} className="px-4 py-10 text-center text-slate-500">加载中...</td></tr> : rows.map(row => <tr key={row.store_code} className="border-t border-slate-100 hover:bg-slate-50"><td className="px-4 py-3 font-mono">{row.store_code}</td><td className="px-4 py-3 font-medium">{row.store_name}</td><td className="px-4 py-3">{row.region}</td><td className="px-4 py-3">{row.zone}</td><td className="px-4 py-3">{row.store_status || '-'}</td><td className="px-4 py-3">{fmt(row.avg_local_lead_count)}</td><td className="px-4 py-3">{fmt(row.avg_visit_count)}</td><td className="px-4 py-3">{fmt(row.avg_visit_rate)}%</td><td className="px-4 py-3">{row.follow_count}</td><td className="px-4 py-3 whitespace-nowrap">{row.latest_follow_time || '-'}</td><td className="px-4 py-3"><Link className="text-primary-600 hover:text-primary-800" to={`/store_detail/${encodeURIComponent(row.store_code)}`}>查看</Link></td></tr>)}</tbody></table></div>
}

function ReasonTable({ rows }: { rows: any[] }) {
  return <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-3 text-left">跟进原因</th><th className="px-4 py-3 text-left">出现次数</th><th className="px-4 py-3 text-left">涉及门店数</th><th className="px-4 py-3 text-left">占比</th></tr></thead><tbody>{rows.map(row => <tr key={row.reason} className="border-t border-slate-100"><td className="px-4 py-3">{row.reason}</td><td className="px-4 py-3">{row.count}</td><td className="px-4 py-3">{row.store_count}</td><td className="px-4 py-3">{row.rate}%</td></tr>)}</tbody></table></div>
}
