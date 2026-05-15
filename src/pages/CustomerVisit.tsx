import React, { useState, useEffect } from 'react'
import { ChevronLeft, RefreshCw, AlertCircle, Download } from 'lucide-react'
import { useAuth } from '@/lib/auth'

interface CustomerVisit {
  大区: string
  战区: string
  店编号: string
  店简称: string
  门店线索id: string
  一级渠道: string
  二级渠道: string
  三级渠道: string
  四级渠道: string
  客户进店时间: string
  顾问姓名: string
  顾问岗位: string
  手机号: string
  创建时间: string
}

interface Stats {
  total_visits: number
  unique_leads: number
  dealer_count: number
  consultant_count: number
}

const CustomerVisit = () => {
  const { hasPermission } = useAuth()
  const canFilter = hasPermission('customer_visit.filter')
  const canExport = hasPermission('customer_visit.export')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [data, setData] = useState<CustomerVisit[]>([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, page_size: 100, total_pages: 0 })
  const [filters, setFilters] = useState({ date_from: '', date_to: '', dealer_code: '', channel_1: '', phone: '' })
  const [showFilters, setShowFilters] = useState(false)

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/customer_visit/stats')
      const json = await res.json()
      if (json.success) {
        setStats(json.data)
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    }
  }

  const fetchData = async (page = 1, searchFilters = filters) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.append('page', page.toString())
      params.append('page_size', '100')
      if (searchFilters.date_from) params.append('date_from', searchFilters.date_from)
      if (searchFilters.date_to) params.append('date_to', searchFilters.date_to)
      if (searchFilters.dealer_code) params.append('dealer_code', searchFilters.dealer_code)
      if (searchFilters.channel_1) params.append('channel_1', searchFilters.channel_1)
      if (searchFilters.phone) params.append('phone', searchFilters.phone)
      
      const res = await fetch(`/api/customer_visit/detail?${params}`)
      const json = await res.json()
      
      if (json.success) {
        setData(json.data)
        setPagination(json.pagination)
      } else {
        setError(json.message || '获取数据失败')
      }
    } catch (err) {
      setError('获取数据失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const dateFrom = urlParams.get('date_from') || ''
    const dateTo = urlParams.get('date_to') || ''
    const dealerCode = urlParams.get('dealer_code') || ''
    const channel1 = urlParams.get('channel_1') || ''
    
    if (dateFrom || dateTo || dealerCode || channel1) {
      const urlFilters = { date_from: dateFrom, date_to: dateTo, dealer_code: dealerCode, channel_1: channel1, phone: '' }
      setFilters(urlFilters)
      fetchStats()
      fetchData(1, urlFilters)
    } else {
      fetchStats()
      fetchData()
    }
  }, [])

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const handleSearch = () => {
    if (!canFilter) return
    fetchData(1, filters)
  }

  const handleReset = () => {
    if (!canFilter) return
    setFilters({ date_from: '', date_to: '', dealer_code: '', channel_1: '', phone: '' })
    fetchData(1)
  }

  const handleExport = async () => {
    if (!canExport) return
    try {
      const params = new URLSearchParams()
      if (filters.date_from) params.append('date_from', filters.date_from)
      if (filters.date_to) params.append('date_to', filters.date_to)
      if (filters.dealer_code) params.append('dealer_code', filters.dealer_code)
      if (filters.channel_1) params.append('channel_1', filters.channel_1)
      if (filters.phone) params.append('phone', filters.phone)
      
      const res = await fetch(`/api/customer_visit/export?${params}`)
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const contentDisposition = res.headers.get('Content-Disposition')
      const filename = contentDisposition
        ? contentDisposition.match(/filename="?(.+)"?/i)?.[1] || '客流明细.xlsx'
        : '客流明细.xlsx'
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

  const columns = [
    '大区', '战区', '店编号', '店简称', '门店线索id',
    '一级渠道', '二级渠道', '三级渠道', '四级渠道',
    '客户进店时间', '顾问姓名', '顾问岗位', '手机号', '创建时间'
  ]

  if (loading && data.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">正在加载数据...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
            <span className="text-red-700">{error}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={() => window.history.back()}
                className="mr-4 p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-slate-600" />
              </button>
              <h1 className="text-xl font-semibold text-slate-900">客流明细</h1>
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
                onClick={() => {
                  fetchData()
                  fetchStats()
                }}
                className="flex items-center px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                刷新数据
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 text-center">
              <div className="text-3xl font-bold text-slate-900">{stats.total_visits}</div>
              <div className="text-sm text-slate-500 mt-1">总进店次数</div>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 text-center">
              <div className="text-3xl font-bold text-slate-900">{stats.unique_leads}</div>
              <div className="text-sm text-slate-500 mt-1">独立线索数</div>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 text-center">
              <div className="text-3xl font-bold text-slate-900">{stats.dealer_count}</div>
              <div className="text-sm text-slate-500 mt-1">涉及门店数</div>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 text-center">
              <div className="text-3xl font-bold text-slate-900">{stats.consultant_count}</div>
              <div className="text-sm text-slate-500 mt-1">顾问数</div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">客流明细表</h3>
            {canFilter && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  筛选条件
                </button>
                <button
                  onClick={handleSearch}
                  className="px-3 py-1.5 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700"
                >
                  查询
                </button>
                <button
                  onClick={handleReset}
                  className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  重置
                </button>
              </div>
            )}
          </div>

          {canFilter && showFilters && (
            <div className="p-4 border-b border-slate-100 bg-slate-50">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">门店编码</label>
                  <input
                    type="text"
                    placeholder="输入门店编码"
                    value={filters.dealer_code}
                    onChange={(e) => handleFilterChange('dealer_code', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">一级渠道</label>
                  <select
                    value={filters.channel_1}
                    onChange={(e) => handleFilterChange('channel_1', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value="">全部</option>
                    <option value="线上">线上</option>
                    <option value="线下">线下</option>
                    <option value="__EMPTY__">空值</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">手机号</label>
                  <input
                    type="text"
                    placeholder="输入手机号"
                    value={filters.phone}
                    onChange={(e) => handleFilterChange('phone', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {columns.map((col) => (
                    <th key={col} className="px-3 py-3 text-left font-medium text-slate-700 whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.大区}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.战区}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.店编号}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.店简称}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.门店线索id}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.一级渠道}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.二级渠道}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.三级渠道}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.四级渠道}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.客户进店时间}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.顾问姓名}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.顾问岗位}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.手机号}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.创建时间}</td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-400">
                      暂无数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-slate-100 flex items-center justify-between">
            <div className="text-sm text-slate-500">
              共 {pagination.total} 条记录，第 {pagination.page}/{pagination.total_pages} 页
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchData(1)}
                disabled={pagination.page === 1}
                className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                首页
              </button>
              <button
                onClick={() => fetchData(pagination.page - 1)}
                disabled={pagination.page === 1}
                className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                上一页
              </button>
              <button
                onClick={() => fetchData(pagination.page + 1)}
                disabled={pagination.page >= pagination.total_pages}
                className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下一页
              </button>
              <button
                onClick={() => fetchData(pagination.total_pages)}
                disabled={pagination.page >= pagination.total_pages}
                className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                末页
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CustomerVisit
