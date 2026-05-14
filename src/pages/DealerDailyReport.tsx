import React, { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, Download, RefreshCw, Calendar, Search, X } from 'lucide-react'
import ExportModal from '@/components/ExportModal'

interface ReportRow {
  report_date: string
  period_type: string
  dealer_id: string
  dealer_name: string
  region: string
  zone: string
  province: string
  region_manager: string
  zone_manager: string
  inspector: string
  n60_lead_count: number | null
  n60_follow_30min_count: number | null
  lead_count: number | null
  follow_30min_count: number | null
  follow_30min_task_count: number | null
  follow_30min_rate: number | null
  day3_3follow_task_count: number | null
  day3_3follow_count: number | null
  day3_3follow_rate: number | null
  valid_lead_count: number | null
  valid_lead_rate: number | null
  valid_local_lead_count: number | null
  local_lead_count: number | null
  to_shop_count: number | null
  lead_to_shop_rate: number | null
  local_lead_to_shop_rate: number | null
  valid_lead_to_shop_rate: number | null
  valid_local_lead_to_shop_rate: number | null
}

interface Summary {
  [key: string]: number | null
}

interface Pagination {
  total: number
  page: number
  page_size: number
  total_pages: number
}

type Period = 'daily' | 'monthly'

const fmt = (val: number | null | undefined, d = 1) => val == null ? '-' : val.toFixed(d)
const fmtInt = (val: number | null | undefined) => val == null ? '-' : val.toLocaleString()
const fmtRate = (val: number | null | undefined) => val == null ? '-' : val.toFixed(1) + '%'

const DealerDailyReport = () => {
  const [data, setData] = useState<ReportRow[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, page_size: 50, total_pages: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>('daily')
  const [region, setRegion] = useState('')
  const [zone, setZone] = useState('')
  const [dealerId, setDealerId] = useState('')
  const [dealerName, setDealerName] = useState('')
  const [regions, setRegions] = useState<string[]>([])
  const [zones, setZones] = useState<string[]>([])
  const [dealerIdInput, setDealerIdInput] = useState('')
  const [dealerNameInput, setDealerNameInput] = useState('')
  const [sortBy, setSortBy] = useState('lead_count')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [showExportModal, setShowExportModal] = useState(false)
  const [dateMode, setDateMode] = useState<'preset' | 'custom'>('preset')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const firstDayOfMonth = today.slice(0, 8) + '01'

  const isPeriodLt3Days = (() => {
    if (dateMode === 'preset' && period === 'daily') return true
    if (dateMode === 'custom' && startDate && endDate) {
      const s = new Date(startDate), e = new Date(endDate)
      return (e.getTime() - s.getTime()) / 86400000 < 2
    }
    return false
  })()

  const fetchData = useCallback(async (p: Period, r: string, z: string, dId: string, dName: string, sort: string, order: string, page = 1, sDate?: string, eDate?: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (sDate && eDate) {
        params.append('start_date', sDate)
        params.append('end_date', eDate)
      } else {
        params.append('period', p)
      }
      if (r) params.append('region', r)
      if (z) params.append('zone', z)
      if (dId) params.append('dealer_id', dId)
      if (dName) params.append('dealer_name', dName)
      params.append('sort_by', sort)
      params.append('sort_order', order)
      params.append('page', page.toString())
      params.append('page_size', '50')

      const res = await fetch(`/api/dealer-daily-report?${params}`)
      const json = await res.json()

      if (json.success) {
        setData(json.data || [])
        setSummary(json.summary || null)
        setPagination(json.pagination || { total: 0, page: 1, page_size: 50, total_pages: 0 })
        if (json.filters) {
          setRegions(json.filters.regions || [])
          setZones(json.filters.zones || [])
        }
      } else { setError(json.message || '获取数据失败') }
    } catch { setError('无法连接到后端服务') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      setDealerId(dealerIdInput)
      setDealerName(dealerNameInput)
    }, 300)
    return () => clearTimeout(t)
  }, [dealerIdInput, dealerNameInput])

  useEffect(() => {
    if (dateMode === 'custom' && startDate && endDate) {
      fetchData(period, region, zone, dealerId, dealerName, sortBy, sortOrder, 1, startDate, endDate)
    } else if (dateMode === 'preset') {
      fetchData(period, region, zone, dealerId, dealerName, sortBy, sortOrder)
    }
  }, [period, region, zone, dealerId, dealerName, sortBy, sortOrder, dateMode, startDate, endDate, fetchData])

  const handleSort = (field: string) => {
    if (sortBy === field) { setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc') }
    else { setSortBy(field); setSortOrder('desc') }
  }

  const sortIcon = (field: string) => {
    const s = sortBy === field ? (sortOrder === 'asc' ? '↑' : '↓') : ''
    return <span className="ml-0.5 text-xs opacity-60">{s}</span>
  }

  const pLabel = dateMode === 'custom' && startDate && endDate
    ? `${startDate}至${endDate}`
    : (period === 'daily' ? '本日' : '本月')
  const cols: { key: string; label: string; fmt: (v: any) => string; w?: string }[] = [
    { key: 'dealer_id', label: '店编号', fmt: v => v || '-', w: 'w-20' },
    { key: 'dealer_name', label: '店简称', fmt: v => v || '-', w: 'w-28' },
    { key: 'n60_lead_count', label: `${pLabel}_N60线索数`, fmt: v => fmtInt(v), w: 'w-28' },
    { key: 'n60_follow_30min_count', label: `N60及时跟进数`, fmt: v => fmtInt(v), w: 'w-26' },
    { key: 'lead_count', label: `${pLabel}_线索量`, fmt: v => <span className="font-semibold">{fmtInt(v)}</span>, w: 'w-24' },
    { key: 'follow_30min_count', label: '30分跟进数', fmt: v => fmtInt(v), w: 'w-24' },
    { key: 'follow_30min_task_count', label: '30分任务数', fmt: v => fmtInt(v), w: 'w-24' },
    { key: 'follow_30min_rate', label: '30分跟进率', fmt: v => fmtRate(v), w: 'w-24' },
    { key: 'day3_3follow_task_count', label: '三天三次任务', fmt: v => isPeriodLt3Days ? '-' : fmtInt(v), w: 'w-24' },
    { key: 'day3_3follow_count', label: '三天三次完成', fmt: v => isPeriodLt3Days ? '-' : fmtInt(v), w: 'w-24' },
    { key: 'day3_3follow_rate', label: '三天三次率', fmt: v => isPeriodLt3Days ? '-' : fmtRate(v), w: 'w-22' },
    { key: 'valid_lead_count', label: '有效线索量', fmt: v => fmtInt(v), w: 'w-24' },
    { key: 'valid_lead_rate', label: '有效率', fmt: v => fmtRate(v), w: 'w-20' },
    { key: 'valid_local_lead_count', label: '有效本地', fmt: v => fmtInt(v), w: 'w-22' },
    { key: 'local_lead_count', label: '本地线索', fmt: v => fmtInt(v), w: 'w-22' },
    { key: 'new_media_self_valid_lead_count', label: '新媒体自店有效线索量', fmt: v => fmtInt(v), w: 'w-28' },
    { key: 'new_media_self_lead_count', label: '新媒体自店线索量', fmt: v => fmtInt(v), w: 'w-28' },
    { key: 'to_shop_count', label: '到店数', fmt: v => fmtInt(v), w: 'w-20' },
    { key: 'lead_to_shop_rate', label: '线索到店率', fmt: v => fmtRate(v), w: 'w-24' },
    { key: 'local_lead_to_shop_rate', label: '本地到店率', fmt: v => fmtRate(v), w: 'w-24' },
    { key: 'valid_lead_to_shop_rate', label: '有效到店率', fmt: v => fmtRate(v), w: 'w-24' },
    { key: 'valid_local_lead_to_shop_rate', label: '有效本地到店率', fmt: v => fmtRate(v), w: 'w-28' },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <button onClick={() => window.history.back()} className="mr-4 p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <ChevronLeft className="w-5 h-5 text-slate-600" />
              </button>
              <h1 className="text-xl font-semibold text-slate-900">运营日报</h1>
              <span className="ml-3 text-sm text-slate-500">门店线上线索运营指标 · 一级渠道空值过滤版</span>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => {
                if (dateMode === 'custom' && startDate && endDate) {
                  fetchData(period, region, zone, dealerId, dealerName, sortBy, sortOrder, pagination.page, startDate, endDate)
                } else {
                  fetchData(period, region, zone, dealerId, dealerName, sortBy, sortOrder, pagination.page)
                }
              }}
                disabled={loading} className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors" title="刷新">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => setShowExportModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium">
                <Download className="w-4 h-4" />导出Excel
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4 rounded-r-lg">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 p-1">
            <button onClick={() => { setDateMode('preset'); setPeriod('daily') }}
              className={`px-4 py-1.5 rounded-lg font-medium transition-all text-sm ${dateMode === 'preset' && period === 'daily' ? 'bg-primary-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}>
              昨日
            </button>
            <button onClick={() => { setDateMode('preset'); setPeriod('monthly') }}
              className={`px-4 py-1.5 rounded-lg font-medium transition-all text-sm ${dateMode === 'preset' && period === 'monthly' ? 'bg-primary-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}>
              当月累计
            </button>
            <button onClick={() => setDateMode('custom')}
              className={`px-4 py-1.5 rounded-lg font-medium transition-all text-sm inline-flex items-center gap-1 ${dateMode === 'custom' ? 'bg-primary-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}>
              <Calendar className="w-3.5 h-3.5" />自定义
            </button>
          </div>

          {dateMode === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                max={endDate || today}
                onChange={e => setStartDate(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <span className="text-slate-400 text-sm">至</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                max={today}
                onChange={e => setEndDate(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          )}

          <select value={region} onChange={e => { setRegion(e.target.value); setZone(''); setDealerId(''); setDealerName(''); setDealerIdInput(''); setDealerNameInput('') }}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">全部大区</option>{regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={zone} onChange={e => { setZone(e.target.value); setDealerId(''); setDealerName(''); setDealerIdInput(''); setDealerNameInput('') }}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">全部战区</option>{zones.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={dealerIdInput}
              onChange={e => setDealerIdInput(e.target.value)}
              placeholder="搜索店编号"
              className="pl-8 pr-7 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-[140px]"
            />
            {dealerIdInput && (
              <button onClick={() => { setDealerIdInput(''); setDealerId('') }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={dealerNameInput}
              onChange={e => setDealerNameInput(e.target.value)}
              placeholder="搜索店简称"
              className="pl-8 pr-7 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-[140px]"
            />
            {dealerNameInput && (
              <button onClick={() => { setDealerNameInput(''); setDealerName('') }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 flex-wrap ml-auto">
            {[{key:'lead_count',label:'线索量'}, {key:'follow_30min_rate',label:'30分跟进率'},
               {key:'day3_3follow_rate',label:'三天三次率'}, {key:'valid_lead_rate',label:'有效率'},
               {key:'to_shop_count',label:'到店数'}, {key:'lead_to_shop_rate',label:'到店率'}].map(sf => (
              <button key={sf.key} onClick={() => handleSort(sf.key)}
                className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  sortBy === sf.key ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                {sf.label}{sortIcon(sf.key)}
              </button>
            ))}
          </div>
        </div>

        {summary && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-slate-900">汇总</span>
              <span className="text-xs text-slate-500">
                全部门店合计 · {
                  dateMode === 'custom' && startDate && endDate
                    ? `${startDate} 至 ${endDate}`
                    : (period === 'monthly' ? '当月累计' : '昨日')
                }
              </span>
            </div>
            <div className="grid grid-cols-6 lg:grid-cols-9 xl:grid-cols-12 gap-x-6 gap-y-3 text-sm">
              {[
                ['线索量', summary['lead_count'], true], ['有效线索', summary['valid_lead_count'], true],
                ['有效率', summary['valid_lead_rate']], ['30分跟进率', summary['follow_30min_rate']],
                ['三天三次率', isPeriodLt3Days ? null : summary['day3_3follow_rate']],
                ['N60线索', summary['n60_lead_count'], true], ['N60跟进', summary['n60_follow_30min_count'], true],
                ['本地线索', summary['local_lead_count'], true], ['有效本地', summary['valid_local_lead_count'], true],
                ['到店数', summary['to_shop_count'], true], ['线索到店率', summary['lead_to_shop_rate']],
                ['有效到店率', summary['valid_lead_to_shop_rate']],
              ].map(([label, val, isInt]: [string, number | null | undefined, boolean | undefined]) => (
                <div key={label}><p className="text-[11px] text-slate-400 leading-tight">{label}</p><p className={`font-bold text-slate-900 ${isInt ? '' : ''}`}>{isInt ? fmtInt(val as number | null) : fmtRate(val as number | null)}</p></div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-auto max-h-[calc(100vh-320px)]">
            <table className="w-full text-sm whitespace-nowrap min-w-max">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 sticky top-0 z-[2]">
                  <th className="px-2.5 py-2.5 text-left text-xs font-semibold text-slate-500 sticky left-0 bg-slate-50 z-[3] w-[72px] min-w-[72px]">大区</th>
                  <th className="px-2.5 py-2.5 text-left text-xs font-semibold text-slate-500 sticky left-[72px] bg-slate-50 z-[3] w-[72px] min-w-[72px]">战区</th>
                  {cols.map((c, idx) => (
                    <th key={c.key}
                      className={`px-2.5 py-2.5 text-right text-xs font-semibold text-slate-600 cursor-pointer hover:text-primary-600 select-none ${c.w || ''} ${
                        idx === 0 ? 'sticky left-[144px] bg-slate-50 z-[3]' :
                        idx === 1 ? 'sticky left-[224px] bg-slate-50 z-[3]' : ''
                      }`}
                      onClick={() => handleSort(c.key)}>
                      <span className="inline-flex items-center justify-end">{c.label}{sortIcon(c.key)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={cols.length + 2} className="px-6 py-12 text-center">
                    <RefreshCw className="w-5 h-5 text-primary-600 animate-spin mx-auto mb-2" /><p className="text-slate-400 text-sm">加载中...</p>
                  </td></tr>
                ) : data.length === 0 ? (
                  <tr><td colSpan={cols.length + 2} className="px-6 py-12 text-center text-slate-400 text-sm">暂无数据</td></tr>
                ) : data.map((row, i) => (
                  <tr key={`${row.dealer_id}-${i}`} className="hover:bg-slate-50/70 transition-colors group">
                    <td className="px-2.5 py-2 text-slate-600 text-xs sticky left-0 bg-white z-[1] group-hover:bg-slate-50/70 w-[72px] min-w-[72px]">{row.region || '-'}</td>
                    <td className="px-2.5 py-2 text-slate-600 text-xs sticky left-[72px] bg-white z-[1] group-hover:bg-slate-50/70 w-[72px] min-w-[72px]">{row.zone || '-'}</td>
                    {cols.map((c, idx) => (
                      <td key={c.key} className={`px-2.5 py-2 text-right text-slate-700 ${c.w || ''} ${
                        idx === 0 ? 'sticky left-[144px] bg-white z-[1] group-hover:bg-slate-50/70' :
                        idx === 1 ? 'sticky left-[224px] bg-white z-[1] group-hover:bg-slate-50/70' : ''
                      }`}>{c.fmt((row as any)[c.key])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination.total_pages > 1 && (
            <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-between">
              <p className="text-sm text-slate-500">共 {pagination.total} 家门店，第 {pagination.page}/{pagination.total_pages} 页</p>
              <div className="flex items-center gap-2">
                <button onClick={() => {
                  if (dateMode === 'custom' && startDate && endDate) {
                    fetchData(period, region, zone, dealerId, dealerName, sortBy, sortOrder, pagination.page - 1, startDate, endDate)
                  } else {
                    fetchData(period, region, zone, dealerId, dealerName, sortBy, sortOrder, pagination.page - 1)
                  }
                }} disabled={pagination.page <= 1}
                  className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40">上一页</button>
                <button onClick={() => {
                  if (dateMode === 'custom' && startDate && endDate) {
                    fetchData(period, region, zone, dealerId, dealerName, sortBy, sortOrder, pagination.page + 1, startDate, endDate)
                  } else {
                    fetchData(period, region, zone, dealerId, dealerName, sortBy, sortOrder, pagination.page + 1)
                  }
                }} disabled={pagination.page >= pagination.total_pages}
                  className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40">下一页</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        today={today}
      />
    </div>
  )
}

export default DealerDailyReport
