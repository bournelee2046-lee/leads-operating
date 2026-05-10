import React, { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, RefreshCw, AlertCircle, Search, Download, Calendar } from 'lucide-react'
import * as XLSX from 'xlsx'

interface DistributionItem {
  dealer_id: string
  dealer_name: string
  region: string
  zone: string
  follow_0: number
  follow_1: number
  follow_2: number
  follow_3: number
  follow_4_plus: number
  total: number
  follow_0_rate: number
  follow_1_rate: number
  follow_2_rate: number
  follow_3_rate: number
  follow_4_plus_rate: number
}

interface TimeRange {
  start_date: string
  end_date: string
  description: string
}

interface FollowUpData {
  dealers: any[]
  distribution: DistributionItem[]
  time_range: TimeRange
}

const getDefaultDateRange = () => {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const start = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const yesterday = new Date(year, month, today.getDate() - 1)
  const end = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
  return { start, end }
}

const FollowUpDistribution = () => {
  const [data, setData] = useState<FollowUpData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [exporting, setExporting] = useState(false)

  const defaultRange = getDefaultDateRange()
  const [startDate, setStartDate] = useState(defaultRange.start)
  const [endDate, setEndDate] = useState(defaultRange.end)

  const fetchData = async (sDate?: string, eDate?: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (sDate) params.append('start_date', sDate)
      if (eDate) params.append('end_date', eDate)
      const url = `/api/follow-up/distribution${params.toString() ? '?' + params.toString() : ''}`
      const response = await fetch(url)
      const result = await response.json()
      if (result.success) {
        setData(result.data)
      } else {
        setError(result.message)
      }
    } catch (err) {
      setError('获取数据失败')
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchData(startDate, endDate)
  }, [])

  const handleDateSearch = () => {
    if (startDate && endDate) {
      fetchData(startDate, endDate)
    }
  }

  const handleReset = () => {
    const range = getDefaultDateRange()
    setStartDate(range.start)
    setEndDate(range.end)
    fetchData(range.start, range.end)
  }

  const filteredDistribution = useMemo(() => {
    if (!data?.distribution) return []
    if (!searchText.trim()) return data.distribution
    const keyword = searchText.trim().toLowerCase()
    return data.distribution.filter(
      (item) =>
        item.dealer_id.toLowerCase().includes(keyword) ||
        item.dealer_name.toLowerCase().includes(keyword)
    )
  }, [data?.distribution, searchText])

  const totalRow = filteredDistribution.reduce(
    (acc, item) => ({
      follow_0: acc.follow_0 + item.follow_0,
      follow_1: acc.follow_1 + item.follow_1,
      follow_2: acc.follow_2 + item.follow_2,
      follow_3: acc.follow_3 + item.follow_3,
      follow_4_plus: acc.follow_4_plus + item.follow_4_plus,
      total: acc.total + item.total,
    }),
    { follow_0: 0, follow_1: 0, follow_2: 0, follow_3: 0, follow_4_plus: 0, total: 0 }
  )

  const handleExport = () => {
    if (!data?.distribution) return
    setExporting(true)

    try {
      const exportData = data.distribution.map((item) => ({
        '大区': item.region,
        '战区': item.zone,
        '店编号': item.dealer_id,
        '门店': item.dealer_name,
        '未跟进': item.follow_0,
        '跟进1次': item.follow_1,
        '跟进2次': item.follow_2,
        '跟进3次': item.follow_3,
        '跟进4次及以上': item.follow_4_plus,
        '总计': item.total,
        '未跟进占比': item.follow_0_rate + '%',
        '跟进1次占比': item.follow_1_rate + '%',
        '跟进2次占比': item.follow_2_rate + '%',
        '跟进3次占比': item.follow_3_rate + '%',
        '跟进4次及以上占比': item.follow_4_plus_rate + '%',
      }))

      const totalExport = {
        '大区': '',
        '战区': '',
        '店编号': '',
        '门店': '合计',
        '未跟进': totalRow.follow_0,
        '跟进1次': totalRow.follow_1,
        '跟进2次': totalRow.follow_2,
        '跟进3次': totalRow.follow_3,
        '跟进4次及以上': totalRow.follow_4_plus,
        '总计': totalRow.total,
        '未跟进占比': (totalRow.total > 0 ? (totalRow.follow_0 * 100.0 / totalRow.total).toFixed(1) : '0') + '%',
        '跟进1次占比': (totalRow.total > 0 ? (totalRow.follow_1 * 100.0 / totalRow.total).toFixed(1) : '0') + '%',
        '跟进2次占比': (totalRow.total > 0 ? (totalRow.follow_2 * 100.0 / totalRow.total).toFixed(1) : '0') + '%',
        '跟进3次占比': (totalRow.total > 0 ? (totalRow.follow_3 * 100.0 / totalRow.total).toFixed(1) : '0') + '%',
        '跟进4次及以上占比': (totalRow.total > 0 ? (totalRow.follow_4_plus * 100.0 / totalRow.total).toFixed(1) : '0') + '%',
      }

      exportData.push(totalExport)

      const ws = XLSX.utils.json_to_sheet(exportData)
      const colWidths = [
        { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 16 },
        { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 8 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 },
      ]
      ws['!cols'] = colWidths

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '跟进次数分布')

      const dateStr = startDate && endDate ? `${startDate}_${endDate}` : new Date().toISOString().slice(0, 10).replace(/-/g, '')
      XLSX.writeFile(wb, `跟进次数分布_${dateStr}.xlsx`)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
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
              <h1 className="text-xl font-semibold text-slate-900">跟进次数分布</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExport}
                disabled={exporting || !data?.distribution?.length}
                className="flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4 mr-2" />
                {exporting ? '导出中...' : '导出Excel'}
              </button>
              <button
                onClick={() => fetchData(startDate, endDate)}
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
        <div className="mb-6 text-sm text-slate-500 text-center">
          {data?.time_range.description}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜索店编号或门店名称..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-slate-50 placeholder:text-slate-400 w-64"
                />
                {searchText && (
                  <button
                    onClick={() => setSearchText('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-600">开始</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-slate-50"
                />
                <span className="text-sm text-slate-400">至</span>
                <span className="text-sm text-slate-600">结束</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-slate-50"
                />
                <button
                  onClick={handleDateSearch}
                  disabled={!startDate || !endDate}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  查询
                </button>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  重置
                </button>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">店编号</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">门店</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">未跟进</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">跟进1次</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">跟进2次</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">跟进3次</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">跟进4次及以上</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">总计</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDistribution.map((item) => (
                  <tr key={item.dealer_id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">
                      {item.dealer_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                      {item.dealer_name}
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-slate-600">
                      <div className="font-medium">{item.follow_0}</div>
                      <div className="text-xs text-slate-400">{item.follow_0_rate}%</div>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-slate-600">
                      <div className="font-medium">{item.follow_1}</div>
                      <div className="text-xs text-slate-400">{item.follow_1_rate}%</div>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-slate-600">
                      <div className="font-medium">{item.follow_2}</div>
                      <div className="text-xs text-slate-400">{item.follow_2_rate}%</div>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-slate-600">
                      <div className="font-medium">{item.follow_3}</div>
                      <div className="text-xs text-slate-400">{item.follow_3_rate}%</div>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-slate-600">
                      <div className="font-medium">{item.follow_4_plus}</div>
                      <div className="text-xs text-slate-400">{item.follow_4_plus_rate}%</div>
                    </td>
                    <td className="px-6 py-4 text-center text-sm font-semibold text-slate-900">
                      {item.total}
                    </td>
                  </tr>
                ))}
                {totalRow && (
                  <tr className="bg-blue-50 font-semibold">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-900"></td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-900">合计</td>
                    <td className="px-6 py-4 text-center text-sm text-blue-700">
                      <div>{totalRow.follow_0}</div>
                      <div className="text-xs text-blue-500">
                        {totalRow.total > 0 ? (totalRow.follow_0 * 100.0 / totalRow.total).toFixed(1) : 0}%
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-blue-700">
                      <div>{totalRow.follow_1}</div>
                      <div className="text-xs text-blue-500">
                        {totalRow.total > 0 ? (totalRow.follow_1 * 100.0 / totalRow.total).toFixed(1) : 0}%
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-blue-700">
                      <div>{totalRow.follow_2}</div>
                      <div className="text-xs text-blue-500">
                        {totalRow.total > 0 ? (totalRow.follow_2 * 100.0 / totalRow.total).toFixed(1) : 0}%
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-blue-700">
                      <div>{totalRow.follow_3}</div>
                      <div className="text-xs text-blue-500">
                        {totalRow.total > 0 ? (totalRow.follow_3 * 100.0 / totalRow.total).toFixed(1) : 0}%
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-blue-700">
                      <div>{totalRow.follow_4_plus}</div>
                      <div className="text-xs text-blue-500">
                        {totalRow.total > 0 ? (totalRow.follow_4_plus * 100.0 / totalRow.total).toFixed(1) : 0}%
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-blue-900">
                      {totalRow.total}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FollowUpDistribution
