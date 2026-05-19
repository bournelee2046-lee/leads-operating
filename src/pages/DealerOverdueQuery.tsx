import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, ChevronLeft, Download, RefreshCw, Search, X } from 'lucide-react'
import { useAuth } from '@/lib/auth'

interface OverdueItem {
  region: string
  zone: string
  dealer_id: string
  dealer_name: string
  lead_id: string
  assign_time: string
  follow_cutoff_time: string
  timely_follow_text: string
  first_follow_time: string
  follow2_time: string
  follow3_time: string
  lead_status: string
  channel_1: string
  channel_2: string
  channel_3: string
  follower: string
}

interface OverdueSummary {
  overdue_count: number
  dealer_count: number
  first_followed_count: number
  not_first_followed_count: number
}

interface Pagination {
  page: number
  page_size: number
  total: number
  total_pages: number
}

const toLocalDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getDefaultRange = () => {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - 6)
  return { start: toLocalDate(start), end: toLocalDate(end) }
}

const buildQuery = (params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value))
  })
  return query.toString()
}

const fmt = (value: string | number | undefined) => value === undefined || value === '' ? '-' : String(value)

const filenameFromDisposition = (disposition: string | null) => {
  if (!disposition) return ''
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (encoded?.[1]) return decodeURIComponent(encoded[1])
  const plain = disposition.match(/filename="?([^";]+)"?/i)
  return plain?.[1] || ''
}

const DealerOverdueQuery = () => {
  const { hasPermission } = useAuth()
  const canExport = hasPermission('dealer_overdue_query.export')
  const defaultRange = useMemo(() => getDefaultRange(), [])

  const [items, setItems] = useState<OverdueItem[]>([])
  const [summary, setSummary] = useState<OverdueSummary>({
    overdue_count: 0,
    dealer_count: 0,
    first_followed_count: 0,
    not_first_followed_count: 0,
  })
  const [pagination, setPagination] = useState<Pagination>({ page: 1, page_size: 50, total: 0, total_pages: 0 })
  const [regions, setRegions] = useState<string[]>([])
  const [zones, setZones] = useState<string[]>([])
  const [startDate, setStartDate] = useState(defaultRange.start)
  const [endDate, setEndDate] = useState(defaultRange.end)
  const [region, setRegion] = useState('')
  const [zone, setZone] = useState('')
  const [dealerId, setDealerId] = useState('')
  const [dealerName, setDealerName] = useState('')
  const [dealerIdInput, setDealerIdInput] = useState('')
  const [dealerNameInput, setDealerNameInput] = useState('')
  const [sortBy, setSortBy] = useState('assign_time')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDealerId(dealerIdInput.trim())
      setDealerName(dealerNameInput.trim())
    }, 300)
    return () => clearTimeout(timer)
  }, [dealerIdInput, dealerNameInput])

  const fetchData = useCallback(async (page = 1) => {
    if (!startDate || !endDate) {
      setError('请选择开始日期和结束日期')
      return
    }
    if (startDate > endDate) {
      setError('开始日期不能晚于结束日期')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const query = buildQuery({
        start_date: startDate,
        end_date: endDate,
        region,
        zone,
        dealer_id: dealerId,
        dealer_name: dealerName,
        sort_by: sortBy,
        sort_order: sortOrder,
        page,
        page_size: 50,
      })
      const res = await fetch(`/api/dealer-management/overdue-query?${query}`, { credentials: 'same-origin' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || '获取逾期数据失败')
      const data = json.data || {}
      setItems(data.items || [])
      setSummary(data.summary || { overdue_count: 0, dealer_count: 0, first_followed_count: 0, not_first_followed_count: 0 })
      setPagination(data.pagination || { page, page_size: 50, total: 0, total_pages: 0 })
      setRegions(data.filters?.regions || [])
      setZones(data.filters?.zones || [])
    } catch (err: any) {
      setError(err.message || '无法连接到后端服务')
    } finally {
      setLoading(false)
    }
  }, [dealerId, dealerName, endDate, region, sortBy, sortOrder, startDate, zone])

  useEffect(() => {
    fetchData(1)
  }, [fetchData])

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
  }

  const sortIcon = (field: string) => {
    if (sortBy !== field) return null
    return <span className="ml-1 text-xs text-slate-400">{sortOrder === 'asc' ? '↑' : '↓'}</span>
  }

  const handleReset = () => {
    setStartDate(defaultRange.start)
    setEndDate(defaultRange.end)
    setRegion('')
    setZone('')
    setDealerIdInput('')
    setDealerNameInput('')
    setDealerId('')
    setDealerName('')
    setSortBy('assign_time')
    setSortOrder('desc')
  }

  const handleExport = async () => {
    if (!canExport || exporting) return
    if (!startDate || !endDate) {
      setError('请选择开始日期和结束日期')
      return
    }
    setExporting(true)
    setError(null)
    try {
      const query = buildQuery({
        start_date: startDate,
        end_date: endDate,
        region,
        zone,
        dealer_id: dealerId,
        dealer_name: dealerName,
        sort_by: sortBy,
        sort_order: sortOrder,
      })
      const res = await fetch(`/api/dealer-management/overdue-query/export?${query}`, { credentials: 'same-origin' })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.message || '导出失败')
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filenameFromDisposition(res.headers.get('Content-Disposition')) || `逾期查询_${dealerName || dealerId || '全部门店'}_${startDate}_${endDate}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err: any) {
      setError(err.message || '导出失败')
    } finally {
      setExporting(false)
    }
  }

  const columns: { key: keyof OverdueItem; label: string; sortable?: boolean; align?: 'left' | 'right'; w?: string }[] = [
    { key: 'region', label: '大区', sortable: true, align: 'left', w: 'w-24' },
    { key: 'zone', label: '战区', sortable: true, align: 'left', w: 'w-24' },
    { key: 'dealer_id', label: '店编号', sortable: true, align: 'left', w: 'w-28' },
    { key: 'dealer_name', label: '店简称', sortable: true, align: 'left', w: 'w-36' },
    { key: 'assign_time', label: '线索最终下发时间', sortable: true, w: 'w-40' },
    { key: 'follow_cutoff_time', label: '首跟截止时间', sortable: true, w: 'w-40' },
    { key: 'timely_follow_text', label: '是否及时跟进', w: 'w-28' },
    { key: 'first_follow_time', label: '首跟时间', sortable: true, w: 'w-40' },
    { key: 'follow2_time', label: '二跟时间', w: 'w-40' },
    { key: 'follow3_time', label: '三跟时间', w: 'w-40' },
    { key: 'lead_status', label: '线索状态', w: 'w-24' },
    { key: 'channel_1', label: '一级渠道', w: 'w-24' },
    { key: 'channel_2', label: '二级渠道', w: 'w-32' },
    { key: 'channel_3', label: '三级渠道', w: 'w-32' },
    { key: 'follower', label: '跟进人', w: 'w-28' },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center min-w-0">
              <button onClick={() => window.history.back()} className="mr-4 p-2 hover:bg-slate-100 rounded-lg transition-colors" title="返回">
                <ChevronLeft className="w-5 h-5 text-slate-600" />
              </button>
              <h1 className="text-xl font-semibold text-slate-900">逾期查询</h1>
              <span className="ml-3 text-sm text-slate-500 hidden sm:inline">首跟逾期线索明细</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchData(pagination.page)}
                disabled={loading}
                className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                title="刷新"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              {canExport && (
                <button
                  onClick={handleExport}
                  disabled={exporting || summary.overdue_count === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" />
                  {exporting ? '导出中...' : '导出Excel'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4 rounded-r-lg flex items-center">
            <AlertCircle className="w-5 h-5 text-red-500 mr-2 flex-shrink-0" />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-lg p-4 mb-5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">开始日期</label>
              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">结束日期</label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">大区</label>
              <select
                value={region}
                onChange={(event) => { setRegion(event.target.value); setZone('') }}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">全部大区</option>
                {regions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">战区</label>
              <select
                value={zone}
                onChange={(event) => setZone(event.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">全部战区</option>
                {zones.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">店编号</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={dealerIdInput}
                  onChange={(event) => setDealerIdInput(event.target.value)}
                  placeholder="精确输入"
                  className="w-full pl-8 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                {dealerIdInput && (
                  <button onClick={() => setDealerIdInput('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" title="清空店编号">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">店简称</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={dealerNameInput}
                  onChange={(event) => setDealerNameInput(event.target.value)}
                  placeholder="模糊搜索"
                  className="w-full pl-8 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                {dealerNameInput && (
                  <button onClick={() => setDealerNameInput('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" title="清空店简称">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 mt-4">
            <button onClick={handleReset} className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">
              重置
            </button>
            <button onClick={() => fetchData(1)} disabled={loading} className="px-4 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
              查询
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            ['逾期线索数', summary.overdue_count],
            ['涉及门店数', summary.dealer_count],
            ['已首跟数', summary.first_followed_count],
            ['未首跟数', summary.not_first_followed_count],
          ].map(([label, value]) => (
            <div key={label} className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">{Number(value).toLocaleString()}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-auto max-h-[calc(100vh-360px)]">
            <table className="w-full text-sm whitespace-nowrap min-w-max">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 sticky top-0 z-[2]">
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      onClick={() => column.sortable && handleSort(column.key)}
                      className={`px-3 py-2.5 text-xs font-semibold text-slate-600 ${column.align === 'left' ? 'text-left' : 'text-right'} ${column.sortable ? 'cursor-pointer hover:text-primary-600' : ''} ${column.w || ''}`}
                    >
                      <span className={`inline-flex items-center ${column.align === 'left' ? 'justify-start' : 'justify-end'}`}>
                        {column.label}{column.sortable && sortIcon(column.key)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={columns.length} className="px-6 py-12 text-center">
                      <RefreshCw className="w-5 h-5 text-primary-600 animate-spin mx-auto mb-2" />
                      <p className="text-slate-400 text-sm">加载中...</p>
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-6 py-12 text-center text-slate-400 text-sm">暂无逾期线索明细</td>
                  </tr>
                ) : items.map((item) => (
                  <tr key={item.lead_id} className="hover:bg-slate-50/70 transition-colors">
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        title={fmt(item[column.key])}
                        className={`px-3 py-2 text-slate-700 max-w-[220px] truncate ${column.align === 'left' ? 'text-left' : 'text-right'} ${column.w || ''}`}
                      >
                        {column.key === 'timely_follow_text' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-red-50 text-red-700 text-xs font-medium">
                            {fmt(item[column.key])}
                          </span>
                        ) : fmt(item[column.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              共 {pagination.total.toLocaleString()} 条明细，第 {pagination.total_pages ? pagination.page : 0}/{pagination.total_pages} 页
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchData(pagination.page - 1)}
                disabled={pagination.page <= 1 || loading}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                上一页
              </button>
              <button
                onClick={() => fetchData(pagination.page + 1)}
                disabled={pagination.page >= pagination.total_pages || loading}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DealerOverdueQuery
