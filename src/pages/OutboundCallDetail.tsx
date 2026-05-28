import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ChevronLeft,
  Download,
  Filter,
  PhoneCall,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react'

interface OutboundCallRow {
  大区: string
  战区: string
  门店编码: string
  门店名称: string
  顾问ID: string
  顾问姓名: string
  顾问岗位: string
  座席工号: string
  座席电话: string
  外呼人: string
  开始时间: string
  结束时间: string
  外呼轮次: number
  外呼号码: string
  接听状态: string
  通话时长: number
  振铃时长: number
  是否有录音: string
  通话时长文本: string
  振铃时长文本: string
}

interface Summary {
  total_calls: number
  answered_calls: number
  answered_rate: number
  avg_talk_duration_sec: number
  avg_talk_duration_text: string
}

interface Pagination {
  total: number
  page: number
  page_size: number
  total_pages: number
}

const toLocalDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getFallbackRange = () => {
  const end = new Date()
  const start = new Date(end.getFullYear(), end.getMonth(), 1)
  return { dateFrom: toLocalDate(start), dateTo: toLocalDate(end) }
}

const buildQuery = (params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value))
  })
  return query.toString()
}

const filenameFromDisposition = (disposition: string | null) => {
  if (!disposition) return ''
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (encoded?.[1]) return decodeURIComponent(encoded[1])
  const plain = disposition.match(/filename="?([^";]+)"?/i)
  return plain?.[1] || ''
}

const EXPORT_MAX_ROWS = 50000
const EXPORT_MAX_DAYS = 7

type Filters = {
  dateFrom: string
  dateTo: string
  globalKeyword: string
  callPerson: string
  callNumber: string
  dealer: string
  answerGroup: string
  minDuration: string
  maxDuration: string
}

const OutboundCallDetail = () => {
  const fallbackRange = useMemo(() => getFallbackRange(), [])
  const dataRequestRef = useRef(0)
  const summaryRequestRef = useRef(0)
  const dataAbortRef = useRef<AbortController | null>(null)
  const summaryAbortRef = useRef<AbortController | null>(null)
  const [defaultRange, setDefaultRange] = useState(fallbackRange)
  const [showFilters, setShowFilters] = useState(true)
  const [filters, setFilters] = useState<Filters>({
    dateFrom: defaultRange.dateFrom,
    dateTo: defaultRange.dateTo,
    globalKeyword: '',
    callPerson: '',
    callNumber: '',
    dealer: '',
    answerGroup: '',
    minDuration: '',
    maxDuration: '',
  })
  const [appliedFilters, setAppliedFilters] = useState<Filters>(filters)
  const [data, setData] = useState<OutboundCallRow[]>([])
  const [summary, setSummary] = useState<Summary>({
    total_calls: 0,
    answered_calls: 0,
    answered_rate: 0,
    avg_talk_duration_sec: 0,
    avg_talk_duration_text: '0秒',
  })
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, page_size: 100, total_pages: 0 })
  const [loading, setLoading] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const queryParams = useCallback((source: Filters, page?: number) => ({
    date_from: source.dateFrom,
    date_to: source.dateTo,
    global_keyword: source.globalKeyword.trim(),
    call_person: source.callPerson.trim(),
    call_number: source.callNumber.trim(),
    dealer: source.dealer.trim(),
    answer_group: source.answerGroup,
    min_duration: source.minDuration,
    max_duration: source.maxDuration,
    page,
    page_size: 100,
  }), [])

  const fetchSummary = useCallback(async (source = appliedFilters) => {
    summaryAbortRef.current?.abort()
    const controller = new AbortController()
    summaryAbortRef.current = controller
    const requestId = summaryRequestRef.current + 1
    summaryRequestRef.current = requestId
    setSummaryLoading(true)
    try {
      const res = await fetch(`/api/outbound-call/summary?${buildQuery(queryParams(source))}`, { signal: controller.signal })
      const json = await res.json()
      if (summaryRequestRef.current !== requestId) return
      if (json.success) {
        setSummary(json.data)
      } else {
        setError(json.message || '获取外呼统计失败')
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError('获取外呼统计失败')
    } finally {
      if (summaryRequestRef.current === requestId) setSummaryLoading(false)
    }
  }, [appliedFilters, queryParams])

  const fetchData = useCallback(async (page = 1, source = appliedFilters) => {
    if (source.dateFrom && source.dateTo && source.dateFrom > source.dateTo) {
      setError('外呼开始日期不能晚于结束日期')
      return
    }

    dataAbortRef.current?.abort()
    const controller = new AbortController()
    dataAbortRef.current = controller
    const requestId = dataRequestRef.current + 1
    dataRequestRef.current = requestId
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/outbound-call/detail?${buildQuery(queryParams(source, page))}`, { signal: controller.signal })
      const json = await res.json()
      if (dataRequestRef.current !== requestId) return
      if (json.success) {
        setData(json.data)
        setPagination(json.pagination)
      } else {
        setError(json.message || '获取外呼明细失败')
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError('获取外呼明细失败')
    } finally {
      if (dataRequestRef.current === requestId) setLoading(false)
    }
  }, [appliedFilters, queryParams])

  const refreshAll = useCallback((page = 1, source = appliedFilters) => {
    fetchSummary(source)
    fetchData(page, source)
  }, [fetchData, fetchSummary])

  useEffect(() => {
    fetch('/api/outbound-call/options')
      .then((res) => res.json())
      .then((json) => {
        const query = new URLSearchParams(window.location.search)
        const nextDefault = {
          dateFrom: json.success && json.data.default_date_from ? json.data.default_date_from : fallbackRange.dateFrom,
          dateTo: json.success && json.data.default_date_to ? json.data.default_date_to : fallbackRange.dateTo,
        }
        setDefaultRange(nextDefault)
        const nextFilters = {
          dateFrom: query.get('date_from') || nextDefault.dateFrom,
          dateTo: query.get('date_to') || nextDefault.dateTo,
          globalKeyword: query.get('global_keyword') || '',
          callPerson: query.get('call_person') || '',
          callNumber: query.get('call_number') || '',
          dealer: query.get('dealer') || '',
          answerGroup: query.get('answer_group') || '',
          minDuration: query.get('min_duration') || '',
          maxDuration: query.get('max_duration') || '',
        }
        setFilters(nextFilters)
        setAppliedFilters(nextFilters)
      })
      .catch(() => {
        setAppliedFilters(filters)
      })
      .finally(() => setReady(true))
  }, [])

  useEffect(() => {
    if (ready) refreshAll(1, appliedFilters)
  }, [ready, appliedFilters, refreshAll])

  const updateFilter = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'dateFrom' || key === 'dateTo') setAppliedFilters((applied) => ({ ...applied, [key]: value }))
      return next
    })
  }

  const handleSearch = () => {
    setAppliedFilters(filters)
  }

  const resetFilters = () => {
    const nextFilters = {
      dateFrom: defaultRange.dateFrom,
      dateTo: defaultRange.dateTo,
      globalKeyword: '',
      callPerson: '',
      callNumber: '',
      dealer: '',
      answerGroup: '',
      minDuration: '',
      maxDuration: '',
    }
    setFilters(nextFilters)
    setAppliedFilters(nextFilters)
  }

  const handleExport = async () => {
    if (appliedFilters.dateFrom && appliedFilters.dateTo) {
      const start = new Date(`${appliedFilters.dateFrom}T00:00:00`)
      const end = new Date(`${appliedFilters.dateTo}T00:00:00`)
      const daySpan = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
      if (daySpan > EXPORT_MAX_DAYS) {
        setError(`外呼明细导出日期跨度不能超过 ${EXPORT_MAX_DAYS} 天，请缩小外呼日期范围后重试。`)
        return
      }
    }
    if (pagination.total > EXPORT_MAX_ROWS) {
      setError(`当前筛选结果共 ${pagination.total} 条，超过单次导出上限 ${EXPORT_MAX_ROWS} 条，请缩小日期范围或增加门店、顾问、外呼号码等筛选条件后重试。`)
      return
    }

    setExporting(true)
    try {
      const res = await fetch(`/api/outbound-call/export?${buildQuery(queryParams(appliedFilters))}`)
      if (!res.ok) {
        const contentType = res.headers.get('Content-Type') || ''
        if (contentType.includes('application/json')) {
          const json = await res.json()
          throw new Error(json.message || '导出失败')
        }
        throw new Error('导出失败')
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filenameFromDisposition(res.headers.get('Content-Disposition')) || '外呼明细.xlsx'
      document.body.appendChild(link)
      link.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(link)
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败，请重试')
    } finally {
      setExporting(false)
    }
  }

  const columns = [
    '大区', '战区', '门店编码', '门店名称',
    '顾问ID', '顾问姓名', '顾问岗位',
    '座席工号', '座席电话', '外呼人',
    '开始时间', '结束时间', '外呼轮次', '外呼号码', '接听状态', '通话时长', '振铃时长', '是否有录音',
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center min-w-0">
              <button
                onClick={() => window.history.back()}
                className="mr-4 p-2 hover:bg-slate-100 rounded-lg transition-colors"
                title="返回"
              >
                <ChevronLeft className="w-5 h-5 text-slate-600" />
              </button>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-slate-900">外呼明细</h1>
                <p className="text-xs text-slate-500 mt-0.5">基于 mart_outbound_call_detail，按外呼开始时间和接听状态统计</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden lg:block text-xs text-slate-500">
                导出上限 {EXPORT_MAX_ROWS.toLocaleString('zh-CN')} 行 / {EXPORT_MAX_DAYS} 天
              </div>
              <button
                onClick={() => refreshAll(pagination.page, appliedFilters)}
                className="flex items-center px-3 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading || summaryLoading ? 'animate-spin' : ''}`} />
                刷新
              </button>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center px-3 py-2 text-sm font-medium text-white bg-cyan-700 rounded-lg hover:bg-cyan-800 disabled:opacity-60"
              >
                <Download className="w-4 h-4 mr-2" />
                {exporting ? '导出中' : '导出'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4 flex items-center text-red-700">
            <AlertCircle className="w-5 h-5 mr-2" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <div className="bg-white rounded-lg p-4 border border-slate-200">
            <div className="text-sm text-slate-500">外呼总数</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{summary.total_calls}</div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-slate-200">
            <div className="text-sm text-slate-500">接通数</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-700">{summary.answered_calls}</div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-slate-200">
            <div className="text-sm text-slate-500">接通率</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{summary.answered_rate}%</div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-slate-200">
            <div className="text-sm text-slate-500">平均通话时长</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{summary.avg_talk_duration_text}</div>
          </div>
        </div>

        <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <PhoneCall className="w-5 h-5 text-cyan-700" />
              <h2 className="text-base font-semibold text-slate-900">外呼明细表</h2>
              <span className="text-xs text-slate-500">顾问与门店通过座席工号、座席电话关联人员表获取</span>
            </div>
            <div className="w-full text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 lg:hidden">
              导出上限 {EXPORT_MAX_ROWS.toLocaleString('zh-CN')} 行 / {EXPORT_MAX_DAYS} 天，超出后请缩小日期范围或增加筛选条件。
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilters((value) => !value)}
                className="flex items-center px-3 py-1.5 text-sm text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                <SlidersHorizontal className="w-4 h-4 mr-2" />
                筛选
              </button>
              <button
                onClick={handleSearch}
                className="flex items-center px-3 py-1.5 text-sm text-white bg-cyan-700 rounded-lg hover:bg-cyan-800"
              >
                <Search className="w-4 h-4 mr-2" />
                查询
              </button>
              <button
                onClick={resetFilters}
                className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                重置
              </button>
            </div>
          </div>

          {showFilters && (
            <div className="px-4 py-4 border-b border-slate-200 bg-slate-50">
              <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-9 gap-3">
                <label className="block">
                  <span className="block text-xs font-medium text-slate-600 mb-1">全局筛选</span>
                  <input value={filters.globalKeyword} onChange={(event) => updateFilter('globalKeyword', event.target.value)} placeholder="任意关键字" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-600 mb-1">外呼开始日期</span>
                  <input type="date" value={filters.dateFrom} onChange={(event) => updateFilter('dateFrom', event.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-600 mb-1">外呼结束日期</span>
                  <input type="date" value={filters.dateTo} onChange={(event) => updateFilter('dateTo', event.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-600 mb-1">外呼人/坐席</span>
                  <input value={filters.callPerson} onChange={(event) => updateFilter('callPerson', event.target.value)} placeholder="姓名、工号或电话" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-600 mb-1">外呼号码</span>
                  <input value={filters.callNumber} onChange={(event) => updateFilter('callNumber', event.target.value)} placeholder="完整号码或片段" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-600 mb-1">门店</span>
                  <input value={filters.dealer} onChange={(event) => updateFilter('dealer', event.target.value)} placeholder="编码、名称或区域" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-600 mb-1">接听归类</span>
                  <select value={filters.answerGroup} onChange={(event) => updateFilter('answerGroup', event.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    <option value="">全部</option>
                    <option value="answered">接通</option>
                    <option value="unanswered">未接听</option>
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-600 mb-1">最小时长/秒</span>
                  <input type="number" min="0" value={filters.minDuration} onChange={(event) => updateFilter('minDuration', event.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-600 mb-1">最大时长/秒</span>
                  <input type="number" min="0" value={filters.maxDuration} onChange={(event) => updateFilter('maxDuration', event.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </label>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1500px] text-sm">
              <thead>
                <tr className="bg-slate-100 text-xs text-slate-500">
                  <th colSpan={4} className="px-3 py-2 text-left font-semibold border-b border-slate-200">门店信息</th>
                  <th colSpan={3} className="px-3 py-2 text-left font-semibold border-b border-slate-200">顾问信息</th>
                  <th colSpan={3} className="px-3 py-2 text-left font-semibold border-b border-slate-200">坐席信息</th>
                  <th colSpan={8} className="px-3 py-2 text-left font-semibold border-b border-slate-200">外呼明细</th>
                </tr>
                <tr className="bg-slate-50">
                  {columns.map((column) => (
                    <th key={column} className="px-3 py-3 text-left font-medium text-slate-700 whitespace-nowrap border-b border-slate-200">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && data.length === 0 ? (
                  <tr>
                    <td colSpan={18} className="px-3 py-8 text-center text-slate-400">正在加载数据...</td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={18} className="px-3 py-8 text-center text-slate-400">暂无匹配数据</td>
                  </tr>
                ) : data.map((row, index) => (
                  <tr key={`${row.门店编码}-${row.外呼号码}-${row.开始时间}-${index}`} className="hover:bg-cyan-50/40">
                    <td className="px-3 py-3 whitespace-nowrap text-slate-600">{row.大区}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-600">{row.战区}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-700 font-medium">{row.门店编码}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-700">{row.门店名称}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-500">{row.顾问ID}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-700">{row.顾问姓名}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-500">{row.顾问岗位}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-700 font-medium">{row.座席工号}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-600">{row.座席电话}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-700">{row.外呼人}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-700">{row.开始时间}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-500">{row.结束时间}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-600">第{row.外呼轮次}次</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-900 font-medium">{row.外呼号码}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full border text-xs font-medium ${row.接听状态.includes('接听') && !row.接听状态.includes('未接听') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                        {row.接听状态}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-900 font-medium">{row.通话时长文本}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-600">{row.振铃时长文本}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-700">{row.是否有录音}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Filter className="w-4 h-4" />
              共 {pagination.total} 条记录，第 {pagination.page}/{pagination.total_pages || 1} 页
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchData(Math.max(pagination.page - 1, 1), appliedFilters)}
                disabled={pagination.page <= 1 || loading}
                className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                上一页
              </button>
              <button
                onClick={() => fetchData(Math.min(pagination.page + 1, pagination.total_pages || 1), appliedFilters)}
                disabled={pagination.page >= pagination.total_pages || loading}
                className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default OutboundCallDetail
