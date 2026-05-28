import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { apiFetch } from '@/lib/api'
import type { StoreRow } from './storeTypes'
import { daysAgo, today } from './storeTypes'

export default function StoreDetail() {
  const { store_code = '' } = useParams()
  const [store, setStore] = useState<StoreRow | null>(null)
  const [daily, setDaily] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [reasons, setReasons] = useState<any[]>([])
  const [dateForm, setDateForm] = useState({ start_date: daysAgo(30), end_date: today() })

  const code = decodeURIComponent(store_code)
  const load = async () => {
    const [basic, dailyRes, historyRes, reasonRes] = await Promise.all([
      apiFetch<{ success: boolean; data: StoreRow }>(`/api/store-profile/${encodeURIComponent(code)}/basic-info`),
      apiFetch<{ success: boolean; data: any[] }>(`/api/store-profile/${encodeURIComponent(code)}/daily-stats?start_date=${dateForm.start_date}&end_date=${dateForm.end_date}`),
      apiFetch<{ success: boolean; data: any[] }>(`/api/store-profile/${encodeURIComponent(code)}/follow-history`),
      apiFetch<{ success: boolean; data: any[] }>(`/api/store-profile/${encodeURIComponent(code)}/reason-analysis`),
    ])
    setStore(basic.data)
    setDaily(dailyRes.data || [])
    setHistory(historyRes.data || [])
    setReasons(reasonRes.data || [])
  }

  useEffect(() => { load() }, [code])

  const summary = daily.reduce((acc, row) => {
    acc.leads += Number(row.local_lead_count || 0)
    acc.visits += Number(row.visit_count || 0)
    return acc
  }, { leads: 0, visits: 0 })
  const visitRate = summary.leads > 0 ? (summary.visits * 100 / summary.leads).toFixed(1) : '0.0'

  if (!store) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">加载中...</div>

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center">
          <div className="flex items-center">
            <button onClick={() => window.history.back()} className="mr-4 p-2 hover:bg-slate-100 rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{store.store_name}</h1>
              <p className="text-xs text-slate-500">{store.store_code} · {store.region} / {store.zone}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Panel title="基础信息">
            <Info label="门店状态" value={store.store_status || '-'} />
            <Info label="大区经理" value={store.region_manager || '-'} />
            <Info label="战区经理" value={store.zone_manager || '-'} />
            <Info label="巡回员" value={store.inspector || '-'} />
          </Panel>
          <Panel title="周期摘要">
            <Info label="周期线索量" value={summary.leads.toFixed(0)} />
            <Info label="周期到店数" value={summary.visits.toFixed(0)} />
            <Info label="周期到店率" value={`${visitRate}%`} />
            <Info label="历史跟进次数" value={String(store.follow_count || 0)} />
          </Panel>
        </div>

        <Panel title="日报趋势">
          <div className="flex gap-3 mb-4">
            <input type="date" value={dateForm.start_date} onChange={e => setDateForm({ ...dateForm, start_date: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            <input type="date" value={dateForm.end_date} onChange={e => setDateForm({ ...dateForm, end_date: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            <button onClick={load} className="px-3 py-2 border border-slate-300 rounded-lg text-sm">查询</button>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="report_date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="local_lead_count" name="线索量-本地" stroke="#2563eb" />
                <Line type="monotone" dataKey="visit_count" name="到店数" stroke="#16a34a" />
                <Line type="monotone" dataKey="visit_rate" name="到店率" stroke="#dc2626" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Panel title="跟进历史">
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {history.length === 0 && <p className="text-sm text-slate-500">暂无跟进记录</p>}
              {history.map(row => <div key={row.record_id} className="border border-slate-200 rounded-lg p-3"><div className="flex justify-between text-sm"><span className="font-medium">{row.task_name || row.week_start_date || '跟进任务'}</span><span className="text-slate-500">{row.follow_time || row.created_at}</span></div><p className="text-sm text-slate-700 mt-2">{row.reason || '未填写原因'}</p>{row.remark && <p className="text-sm text-slate-500 mt-1">{row.remark}</p>}<p className="text-xs text-slate-400 mt-2">操作人：{row.operator || '-'}</p></div>)}
            </div>
          </Panel>
          <Panel title="原因分析">
            <table className="w-full text-sm"><thead className="text-slate-500 bg-slate-50"><tr><th className="text-left px-3 py-2">原因</th><th className="text-left px-3 py-2">次数</th><th className="text-left px-3 py-2">最近时间</th></tr></thead><tbody>{reasons.map(row => <tr key={row.reason} className="border-t border-slate-100"><td className="px-3 py-2">{row.reason}</td><td className="px-3 py-2">{row.count}</td><td className="px-3 py-2">{row.latest_time}</td></tr>)}</tbody></table>
          </Panel>
        </div>
      </div>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="bg-white border border-slate-200 rounded-lg p-4"><h2 className="font-semibold text-slate-900 mb-3">{title}</h2>{children}</div>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between py-2 border-b border-slate-100 last:border-0"><span className="text-sm text-slate-500">{label}</span><span className="text-sm text-slate-900">{value}</span></div>
}
