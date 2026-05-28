import React, { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, RefreshCw, AlertCircle, Download, Info } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import RegionZoneFilter, { type RegionZoneOptions } from '@/components/RegionZoneFilter'

interface DealerStat {
  region: string
  zone: string
  dealer_id: string
  dealer_name: string
  store_status?: string
  total_visits: number
  unique_lead_visits: number
  online_visits: number
  online_lead_visits: number
  offline_visits: number
  offline_lead_visits: number
}

interface Pagination {
  total: number
  page: number
  page_size: number
  total_pages: number
}

interface VisitFilterOptions extends RegionZoneOptions {
  store_statuses?: string[]
}

const emptyVisitFilters = { date_from: '', date_to: '', region: '', zone: '', dealer_code: '', store_status: '' }

const VisitStats = () => {
  const { hasPermission } = useAuth()
  const canFilter = hasPermission('visit_stats.filter')
  const canDrilldown = hasPermission('visit_stats.drilldown')
  const canExport = hasPermission('visit_stats.export')
  const [stats, setStats] = useState<DealerStat[]>([])
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, page_size: 100, total_pages: 0 })
  const [grandTotal, setGrandTotal] = useState<DealerStat | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState(emptyVisitFilters)
  const [regionZoneOptions, setRegionZoneOptions] = useState<VisitFilterOptions>({ regions: [], zones: [], region_zones: {}, store_statuses: [] })
  const [showFilters, setShowFilters] = useState(false)

  const fetchData = useCallback(async (page = 1, searchFilters = emptyVisitFilters) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (searchFilters.date_from) params.append('date_from', searchFilters.date_from)
      if (searchFilters.date_to) params.append('date_to', searchFilters.date_to)
      if (searchFilters.region) params.append('region', searchFilters.region)
      if (searchFilters.zone) params.append('zone', searchFilters.zone)
      if (searchFilters.dealer_code) params.append('dealer_code', searchFilters.dealer_code)
      if (searchFilters.store_status) params.append('store_status', searchFilters.store_status)
      params.append('page', page.toString())
      params.append('page_size', '100')

      const res = await fetch(`/api/visit_stats?${params}`)
      const json = await res.json()

      if (json.success) {
        setStats(json.data)
        setPagination(json.pagination)
        if (json.grand_total) {
          setGrandTotal({
            region: '',
            zone: '',
            dealer_id: '',
            dealer_name: '',
            store_status: '',
            total_visits: json.grand_total.total_visits,
            unique_lead_visits: json.grand_total.unique_lead_visits,
            online_visits: json.grand_total.online_visits,
            online_lead_visits: json.grand_total.online_lead_visits,
            offline_visits: json.grand_total.offline_visits,
            offline_lead_visits: json.grand_total.offline_lead_visits
          })
        }
        setRegionZoneOptions(json.filters || { regions: [], zones: [], region_zones: {}, store_statuses: [] })
      } else {
        setError(json.message || '获取数据失败')
      }
    } catch {
      setError('获取数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(1, emptyVisitFilters)
  }, [fetchData])

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value, ...(key === 'region' ? { zone: '' } : {}) }))
  }

  const handleSearch = () => {
    if (!canFilter) return
    fetchData(1, filters)
  }

  const handleReset = () => {
    if (!canFilter) return
    setFilters(emptyVisitFilters)
    fetchData(1, emptyVisitFilters)
  }

  const handleExport = async () => {
    if (!canExport) return
    try {
      const params = new URLSearchParams()
      if (filters.date_from) params.append('date_from', filters.date_from)
      if (filters.date_to) params.append('date_to', filters.date_to)
      if (filters.region) params.append('region', filters.region)
      if (filters.zone) params.append('zone', filters.zone)
      if (filters.dealer_code) params.append('dealer_code', filters.dealer_code)
      if (filters.store_status) params.append('store_status', filters.store_status)

      const res = await fetch(`/api/visit_stats/export?${params}`)
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const contentDisposition = res.headers.get('Content-Disposition')
      const filename = contentDisposition
        ? contentDisposition.match(/filename="?(.+)"?/i)?.[1] || '客流统计.xlsx'
        : '客流统计.xlsx'
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error('导出失败:', err)
      alert('导出失败，请重试')
    }
  }

  const navigateToDetail = (stat: DealerStat, channel?: string) => {
    if (!canDrilldown) return
    const params = new URLSearchParams()
    if (filters.date_from) params.append('date_from', filters.date_from)
    if (filters.date_to) params.append('date_to', filters.date_to)
    params.append('dealer_code', stat.dealer_id)
    if (channel) params.append('channel_1', channel)
    window.location.href = `/customer-visit?${params.toString()}`
  }

  const columns = [
    '大区', '战区', '门店编号', '门店名称', '门店状态',
    '进店次数', '进店客流', '线上进店数', '线上进店客流', '线下进店数', '线下进店客流'
  ]

  const getField = (stat: DealerStat, col: string) => {
    switch (col) {
      case '大区': return stat.region
      case '战区': return stat.zone
      case '门店编号': return stat.dealer_id
      case '门店名称': return stat.dealer_name
      case '门店状态': return stat.store_status || '-'
      case '进店次数': return stat.total_visits
      case '进店客流': return stat.unique_lead_visits
      case '线上进店数': return stat.online_visits
      case '线上进店客流': return stat.online_lead_visits
      case '线下进店数': return stat.offline_visits
      case '线下进店客流': return stat.offline_lead_visits
      default: return ''
    }
  }

  const isClickableColumn = (col: string) => {
    return ['进店次数', '进店客流', '线上进店数', '线上进店客流', '线下进店数', '线下进店客流'].includes(col)
  }

  const getChannelForColumn = (col: string) => {
    if (col === '线上进店数' || col === '线上进店客流') return '线上'
    if (col === '线下进店数' || col === '线下进店客流') return '线下'
    return undefined
  }

  const hasTooltip = (col: string) => ['进店客流', '线上进店客流', '线下进店客流'].includes(col)

  const totalSummary = stats.reduce((acc, s) => ({
    total: acc.total + s.total_visits,
    unique_leads: acc.unique_leads + s.unique_lead_visits,
    online: acc.online + s.online_visits,
    online_leads: acc.online_leads + s.online_lead_visits,
    offline: acc.offline + s.offline_visits,
    offline_leads: acc.offline_leads + s.offline_lead_visits
  }), { total: 0, unique_leads: 0, online: 0, online_leads: 0, offline: 0, offline_leads: 0 })

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-[100rem] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={() => window.history.back()}
                className="mr-4 p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-slate-600" />
              </button>
              <h1 className="text-xl font-semibold text-slate-900">客流统计</h1>
            </div>
            <div className="flex items-center gap-3">
              {canExport && (
                <button
                  onClick={handleExport}
                  className="flex items-center px-4 py-2 text-sm font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
                >
                  <Download className="w-4 h-4 mr-2" />
                  导出数据
                </button>
              )}
              <button
                onClick={() => fetchData(1, filters)}
                className="flex items-center px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                刷新数据
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[100rem] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">筛选条件</h2>
              {canFilter && (
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="text-xs text-primary-600 hover:text-primary-700"
                >
                  {showFilters ? '收起' : '展开'}
                </button>
              )}
            </div>
          </div>
          {canFilter && showFilters && (
            <div className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">开始日期（进店）</label>
                  <input
                    type="date"
                    value={filters.date_from}
                    onChange={(e) => handleFilterChange('date_from', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">结束日期（进店）</label>
                  <input
                    type="date"
                    value={filters.date_to}
                    onChange={(e) => handleFilterChange('date_to', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">门店编号</label>
                  <input
                    type="text"
                    placeholder="输入门店编号"
                    value={filters.dealer_code}
                    onChange={(e) => handleFilterChange('dealer_code', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <RegionZoneFilter
                  region={filters.region}
                  zone={filters.zone}
                  options={regionZoneOptions}
                  labelClassName="block"
                  selectClassName="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                  onRegionChange={(value) => handleFilterChange('region', value)}
                  onZoneChange={(value) => handleFilterChange('zone', value)}
                />
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">门店状态</label>
                  <select
                    value={filters.store_status}
                    onChange={(e) => handleFilterChange('store_status', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                  >
                    <option value="">全部门店状态</option>
                    {(regionZoneOptions.store_statuses || []).map(item => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleSearch}
                  className="px-6 py-2 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 transition-colors"
                >
                  查询
                </button>
                <button
                  onClick={handleReset}
                  className="px-6 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  重置
                </button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center">
            <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {columns.map((col) => (
                    <th key={col} className="px-3 py-3 text-left font-semibold text-slate-700 whitespace-nowrap overflow-visible">
                      <div className="flex items-center gap-1 relative">
                        {col}
                        {hasTooltip(col) && (
                          <div className="relative inline-flex items-center group cursor-pointer" style={{overflow: 'visible'}}>
                            <Info className="w-3.5 h-3.5 text-slate-400" />
                            <div className="absolute left-1/2 top-full mt-1.5 w-52 px-3 py-2 text-xs text-white bg-slate-800 rounded-lg shadow-lg z-[999] whitespace-normal opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto" style={{overflow: 'visible'}}>
                              一条线索单日多次到店，客流数去重
                            </div>
                          </div>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-400">
                      加载中...
                    </td>
                  </tr>
                ) : stats.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-400">
                      暂无数据
                    </td>
                  </tr>
                ) : (
                  <>
                    {stats.map((stat, idx) => (
                      <tr
                        key={`${stat.dealer_id}-${idx}`}
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                      >
                        {columns.map((col) => {
                          const value = getField(stat, col)
                          const clickable = canDrilldown && isClickableColumn(col)
                          const channel = getChannelForColumn(col)
                          return (
                            <td key={col} className="px-3 py-2 text-slate-600 whitespace-nowrap">
                              {clickable ? (
                                <button
                                  onClick={() => navigateToDetail(stat, channel)}
                                  className="text-primary-600 hover:text-primary-800 hover:underline cursor-pointer font-medium"
                                >
                                  {value}
                                </button>
                              ) : (
                                value
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-semibold border-t-2 border-slate-300">
                      <td className="px-3 py-2 text-slate-700" colSpan={5}>合计</td>
                      <td className="px-3 py-2 text-slate-700">{totalSummary.total}</td>
                      <td className="px-3 py-2 text-slate-700">{totalSummary.unique_leads}</td>
                      <td className="px-3 py-2 text-slate-700">{totalSummary.online}</td>
                      <td className="px-3 py-2 text-slate-700">{totalSummary.online_leads}</td>
                      <td className="px-3 py-2 text-slate-700">{totalSummary.offline}</td>
                      <td className="px-3 py-2 text-slate-700">{totalSummary.offline_leads}</td>
                    </tr>
                    {grandTotal && (
                      <tr className="bg-blue-50 font-bold border-t border-slate-300">
                        <td className="px-3 py-2 text-blue-800" colSpan={5}>总计</td>
                        <td className="px-3 py-2 text-blue-800">{grandTotal.total_visits}</td>
                        <td className="px-3 py-2 text-blue-800">{grandTotal.unique_lead_visits}</td>
                        <td className="px-3 py-2 text-blue-800">{grandTotal.online_visits}</td>
                        <td className="px-3 py-2 text-blue-800">{grandTotal.online_lead_visits}</td>
                        <td className="px-3 py-2 text-blue-800">{grandTotal.offline_visits}</td>
                        <td className="px-3 py-2 text-blue-800">{grandTotal.offline_lead_visits}</td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>

          {pagination.total_pages > 1 && (
            <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between bg-slate-50">
              <p className="text-sm text-slate-600">
                共 {pagination.total} 家门店
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchData(pagination.page - 1, filters)}
                  disabled={pagination.page <= 1}
                  className="px-3 py-1 text-sm bg-white border border-slate-200 rounded disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
                >
                  上一页
                </button>
                <span className="px-3 py-1 text-sm">
                  {pagination.page} / {pagination.total_pages}
                </span>
                <button
                  onClick={() => fetchData(pagination.page + 1, filters)}
                  disabled={pagination.page >= pagination.total_pages}
                  className="px-3 py-1 text-sm bg-white border border-slate-200 rounded disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default VisitStats
