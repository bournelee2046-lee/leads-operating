import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ChevronLeft,
  Download,
  HelpCircle,
  PhoneCall,
  RefreshCw,
  Search,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface Summary {
  total_calls: number
  unique_numbers: number
  answered_calls: number
  answered_rate: number
  effective_calls: number
  effective_rate: number
  effective_30s_calls: number
  effective_30s_rate: number
  effective_60s_calls: number
  effective_60s_rate: number
  active_staff_count: number
  per_staff_calls: number
  avg_talk_duration_sec: number
  avg_talk_duration_text: string
  total_talk_duration_sec: number
  high_freq_unanswered_numbers: number
}

interface TrendRow extends Summary {
  stat_date: string
}

interface StoreRow extends Summary {
  region: string
  zone: string
  dealer_id: string
  dealer_name: string
  avg_call_round: number
  recording_rate: number
}

interface ConsultantRow extends Summary {
  region: string
  zone: string
  dealer_id: string
  dealer_name: string
  staff_id: string
  consultant_name: string
  consultant_role: string
  seat_id: string
  seat_phone: string
  short_talk_rate: number
  no_recording_calls: number
}

interface NumberRow extends Summary {
  region: string
  zone: string
  dealer_id: string
  dealer_name: string
  call_number: string
  total_calls: number
  has_answered: boolean
  first_call_time: string
  latest_call_time: string
  max_talk_duration_sec: number
  max_talk_duration_text: string
  latest_caller_name: string
  latest_seat_id: string
  latest_seat_phone: string
  risk_tag: string
}

interface QualityRow {
  type: string
  count: number
  ratio: number
  rule: string
  priority: string
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

const formatInt = (value?: number) => Math.round(Number(value || 0)).toLocaleString('zh-CN')
const formatRate = (value?: number) => `${Number(value || 0).toFixed(1)}%`
const STORE_PAGE_SIZE = 50

const filenameFromDisposition = (disposition: string | null) => {
  if (!disposition) return ''
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (encoded?.[1]) return decodeURIComponent(encoded[1])
  const plain = disposition.match(/filename="?([^";]+)"?/i)
  return plain?.[1] || ''
}

const emptySummary: Summary = {
  total_calls: 0,
  unique_numbers: 0,
  answered_calls: 0,
  answered_rate: 0,
  effective_calls: 0,
  effective_rate: 0,
  effective_30s_calls: 0,
  effective_30s_rate: 0,
  effective_60s_calls: 0,
  effective_60s_rate: 0,
  active_staff_count: 0,
  per_staff_calls: 0,
  avg_talk_duration_sec: 0,
  avg_talk_duration_text: '0秒',
  total_talk_duration_sec: 0,
  high_freq_unanswered_numbers: 0,
}

type TabKey = 'store' | 'consultant' | 'number' | 'quality'
type TrendMode = 'volume' | 'rate' | 'quality'
type LazyTabKey = Exclude<TabKey, 'store'>
type Filters = {
  dateFrom: string
  dateTo: string
  region: string
  zone: string
  dealer: string
  callPerson: string
  answerGroup: string
  callType: string
}

const lazyTabInitialState = {
  consultant: { loading: false, loaded: false, error: null as string | null },
  number: { loading: false, loaded: false, error: null as string | null },
  quality: { loading: false, loaded: false, error: null as string | null },
}

export default function OutboundCallStats() {
  const fallbackRange = useMemo(() => getFallbackRange(), [])
  const requestRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const activeTabRef = useRef<TabKey>('store')
  const lazyAbortRef = useRef<Record<LazyTabKey, AbortController | null>>({
    consultant: null,
    number: null,
    quality: null,
  })
  const lazyTabsRef = useRef(lazyTabInitialState)
  const lazyRequestRef = useRef<Record<LazyTabKey, number>>({
    consultant: 0,
    number: 0,
    quality: 0,
  })
  const [defaultRange, setDefaultRange] = useState(fallbackRange)
  const [filters, setFilters] = useState<Filters>({
    dateFrom: defaultRange.dateFrom,
    dateTo: defaultRange.dateTo,
    region: '',
    zone: '',
    dealer: '',
    callPerson: '',
    answerGroup: '',
    callType: 'outbound',
  })
  const [appliedFilters, setAppliedFilters] = useState<Filters>(filters)
  const [regions, setRegions] = useState<string[]>([])
  const [zones, setZones] = useState<string[]>([])
  const [summary, setSummary] = useState<Summary>(emptySummary)
  const [trend, setTrend] = useState<TrendRow[]>([])
  const [stores, setStores] = useState<StoreRow[]>([])
  const [consultants, setConsultants] = useState<ConsultantRow[]>([])
  const [numbers, setNumbers] = useState<NumberRow[]>([])
  const [quality, setQuality] = useState<QualityRow[]>([])
  const [activeTab, setActiveTab] = useState<TabKey>('store')
  const [trendMode, setTrendMode] = useState<TrendMode>('volume')
  const [lazyTabs, setLazyTabs] = useState(lazyTabInitialState)
  const [storePage, setStorePage] = useState(1)
  const [storePageInput, setStorePageInput] = useState('1')
  const [showDefinitions, setShowDefinitions] = useState(false)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    lazyTabsRef.current = lazyTabs
  }, [lazyTabs])

  const queryParams = useCallback((source: Filters) => ({
    date_from: source.dateFrom,
    date_to: source.dateTo,
    region: source.region,
    zone: source.zone,
    dealer: source.dealer.trim(),
    call_person: source.callPerson.trim(),
    answer_group: source.answerGroup,
    call_type: source.callType,
  }), [])

  const fetchStatsJson = useCallback(async <T,>(path: string, source: Filters, signal?: AbortSignal) => {
    const query = buildQuery(queryParams(source))
    const res = await fetch(`${path}?${query}`, { signal })
    const json = await res.json()
    if (!res.ok || json.success === false) throw new Error(json.message || '请求失败')
    return json.data as T
  }, [queryParams])

  const resetLazyTabs = useCallback(() => {
    ;(['consultant', 'number', 'quality'] as LazyTabKey[]).forEach((tab) => {
      lazyAbortRef.current[tab]?.abort()
      lazyAbortRef.current[tab] = null
      lazyRequestRef.current[tab] += 1
    })
    setConsultants([])
    setNumbers([])
    setQuality([])
    const nextTabs = {
      consultant: { loading: false, loaded: false, error: null },
      number: { loading: false, loaded: false, error: null },
      quality: { loading: false, loaded: false, error: null },
    }
    lazyTabsRef.current = nextTabs
    setLazyTabs(nextTabs)
  }, [])

  const refreshCore = useCallback(async (source = appliedFilters) => {
    if (source.dateFrom && source.dateTo && source.dateFrom > source.dateTo) {
      setError('外呼开始日期不能晚于结束日期')
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    setLoading(true)
    setError(null)
    try {
      const [summaryData, trendData, storeData] = await Promise.all([
        fetchStatsJson<Summary>('/api/outbound-call-stats/summary', source, controller.signal),
        fetchStatsJson<TrendRow[]>('/api/outbound-call-stats/trend', source, controller.signal),
        fetchStatsJson<StoreRow[]>('/api/outbound-call-stats/stores', source, controller.signal),
      ])
      if (requestRef.current !== requestId) return
      setSummary(summaryData)
      setTrend(trendData)
      setStores(storeData)
      setStorePage(1)
      setStorePageInput('1')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : '获取外呼统计失败')
    } finally {
      if (requestRef.current === requestId) setLoading(false)
    }
  }, [appliedFilters, fetchStatsJson])

  const loadLazyTab = useCallback(async (tab: LazyTabKey, source = appliedFilters, force = false) => {
    if (source.dateFrom && source.dateTo && source.dateFrom > source.dateTo) {
      setLazyTabs((prev) => ({ ...prev, [tab]: { ...prev[tab], error: '外呼开始日期不能晚于结束日期' } }))
      return
    }
    const current = lazyTabsRef.current[tab]
    if (!force && (current.loaded || current.loading)) return

    lazyAbortRef.current[tab]?.abort()
    const controller = new AbortController()
    lazyAbortRef.current[tab] = controller
    const requestId = lazyRequestRef.current[tab] + 1
    lazyRequestRef.current[tab] = requestId
    setLazyTabs((prev) => ({ ...prev, [tab]: { ...prev[tab], loading: true, error: null } }))

    try {
      if (tab === 'consultant') {
        const data = await fetchStatsJson<ConsultantRow[]>('/api/outbound-call-stats/consultants', source, controller.signal)
        if (lazyRequestRef.current[tab] !== requestId) return
        setConsultants(data)
      } else if (tab === 'number') {
        const data = await fetchStatsJson<NumberRow[]>('/api/outbound-call-stats/numbers', source, controller.signal)
        if (lazyRequestRef.current[tab] !== requestId) return
        setNumbers(data)
      } else {
        const data = await fetchStatsJson<QualityRow[]>('/api/outbound-call-stats/quality', source, controller.signal)
        if (lazyRequestRef.current[tab] !== requestId) return
        setQuality(data)
      }
      setLazyTabs((prev) => ({ ...prev, [tab]: { loading: false, loaded: true, error: null } }))
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (lazyRequestRef.current[tab] !== requestId) return
      setLazyTabs((prev) => ({
        ...prev,
        [tab]: {
          ...prev[tab],
          loading: false,
          loaded: false,
          error: err instanceof Error ? err.message : '获取数据失败',
        },
      }))
    }
  }, [appliedFilters, fetchStatsJson])

  useEffect(() => {
    fetch('/api/outbound-call-stats/options')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          const nextDefault = {
            dateFrom: json.data.default_date_from || fallbackRange.dateFrom,
            dateTo: json.data.default_date_to || fallbackRange.dateTo,
          }
          setDefaultRange(nextDefault)
          const nextFilters = {
            dateFrom: nextDefault.dateFrom,
            dateTo: nextDefault.dateTo,
            region: '',
            zone: '',
            dealer: '',
            callPerson: '',
            answerGroup: '',
            callType: 'outbound',
          }
          setFilters(nextFilters)
          setAppliedFilters(nextFilters)
          setRegions(json.data.regions || [])
          setZones(json.data.zones || [])
        }
      })
      .catch(() => {
        setAppliedFilters(filters)
      })
      .finally(() => setReady(true))
  }, [])

  useEffect(() => {
    activeTabRef.current = activeTab
  }, [activeTab])

  useEffect(() => {
    if (!ready) return
    resetLazyTabs()
    refreshCore(appliedFilters)
  }, [ready, appliedFilters, refreshCore, resetLazyTabs])

  useEffect(() => {
    if (!ready || activeTab === 'store') return
    loadLazyTab(activeTab, appliedFilters)
  }, [ready, activeTab, appliedFilters, loadLazyTab])

  const updateFilter = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'dateFrom' || key === 'dateTo') setAppliedFilters((applied) => ({ ...applied, [key]: value }))
      return next
    })
  }

  const storeTotalPages = Math.max(1, Math.ceil(stores.length / STORE_PAGE_SIZE))
  const normalizedStorePage = Math.min(storePage, storeTotalPages)
  const pagedStores = stores.slice((normalizedStorePage - 1) * STORE_PAGE_SIZE, normalizedStorePage * STORE_PAGE_SIZE)

  const gotoStorePage = (value = storePageInput) => {
    const page = Number.parseInt(value, 10)
    if (!Number.isFinite(page)) {
      setStorePageInput(String(normalizedStorePage))
      return
    }
    const nextPage = Math.min(Math.max(page, 1), storeTotalPages)
    setStorePage(nextPage)
    setStorePageInput(String(nextPage))
  }

  const resetFilters = () => {
    const nextFilters = {
      dateFrom: defaultRange.dateFrom,
      dateTo: defaultRange.dateTo,
      region: '',
      zone: '',
      dealer: '',
      callPerson: '',
      answerGroup: '',
      callType: 'outbound',
    }
    setFilters(nextFilters)
    setAppliedFilters(nextFilters)
  }

  const handleSearch = () => {
    setAppliedFilters(filters)
  }

  const handleRefresh = () => {
    resetLazyTabs()
    refreshCore(appliedFilters)
    if (activeTab !== 'store') loadLazyTab(activeTab, appliedFilters, true)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch(`/api/outbound-call-stats/export?${buildQuery(queryParams(appliedFilters))}`)
      if (!res.ok) throw new Error('导出失败')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filenameFromDisposition(res.headers.get('Content-Disposition')) || '外呼统计.xlsx'
      document.body.appendChild(link)
      link.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(link)
    } catch {
      setError('导出失败，请重试')
    } finally {
      setExporting(false)
    }
  }

  const gotoDetail = () => {
    const params = buildQuery({
      date_from: appliedFilters.dateFrom,
      date_to: appliedFilters.dateTo,
      call_person: appliedFilters.callPerson,
      dealer: appliedFilters.dealer || appliedFilters.region || appliedFilters.zone,
      answer_group: appliedFilters.answerGroup,
    })
    window.location.href = `/outbound-call-detail?${params}`
  }

  const trendData = trend.map((row) => ({
    ...row,
    dateLabel: row.stat_date.slice(5),
  }))

  const focusStores = stores
    .filter((row) => row.high_freq_unanswered_numbers > 0 || row.total_calls > 0)
    .slice()
    .sort((a, b) => b.high_freq_unanswered_numbers - a.high_freq_unanswered_numbers)
    .slice(0, 5)
  const activeLazyLoading = activeTab !== 'store' ? lazyTabs[activeTab].loading : false

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-[1540px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between min-h-16 py-3 gap-4">
            <div className="flex items-center min-w-0">
              <button onClick={() => window.history.back()} className="mr-4 p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <ChevronLeft className="w-5 h-5 text-slate-600" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold text-slate-900">外呼统计</h1>
                  <div className="relative" onMouseEnter={() => setShowDefinitions(true)} onMouseLeave={() => setShowDefinitions(false)}>
                    <button className="w-7 h-7 rounded-full border border-slate-200 bg-white text-teal-700 flex items-center justify-center">
                      <HelpCircle className="w-4 h-4" />
                    </button>
                    {showDefinitions && (
                      <div className="absolute left-0 top-9 w-[720px] max-w-[calc(100vw-32px)] bg-slate-900 text-white rounded-lg shadow-xl p-4 text-xs leading-6 z-30">
                        <div className="font-semibold mb-2">指标口径说明</div>
                        <div className="grid grid-cols-2 gap-x-5 gap-y-1">
                          <span>默认排除呼入；呼入可通过筛选项单独查看。</span>
                          <span>接通数：接听状态包含“接听”且不包含“未接听”。</span>
                          <span>接通率 = 接通数 / 外呼总数。</span>
                          <span>有效通话数：接通记录中通话时长 &gt;= 10秒。</span>
                          <span>有效通话率 = 有效通话数 / 当前筛选通话总数。</span>
                          <span>30s通话占比 = 30s有效通话数 / 有效通话数。</span>
                          <span>60s通话占比 = 60s有效通话数 / 有效通话数。</span>
                          <span>平均通话时长 = 接通记录通话时长合计 / 接通数。</span>
                          <span>人均外呼数 = 外呼总数 / 有外呼记录顾问数。</span>
                          <span>高频未接通号码：同门店同号码外呼次数 &gt;= 5 且从未接通。</span>
                          <span>平均外呼轮次按同门店 + 同外呼号码计算。</span>
                          <span>录音覆盖率 = 有录音记录数 / 外呼总数；无外呼门店指标为 0。</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">基于 mart_outbound_call_detail 汇总，按外呼开始时间联动统计</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleRefresh} disabled={loading || activeLazyLoading} className="inline-flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-sm disabled:opacity-60">
                <RefreshCw className={`w-4 h-4 ${loading || activeLazyLoading ? 'animate-spin' : ''}`} />刷新
              </button>
              <button onClick={handleExport} disabled={exporting} className="inline-flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-sm disabled:opacity-60">
                <Download className="w-4 h-4" />{exporting ? '导出中' : '导出统计'}
              </button>
              <button onClick={gotoDetail} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-teal-700 text-white hover:bg-teal-800 text-sm">
                <PhoneCall className="w-4 h-4" />查看外呼明细
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-[1540px] mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <section className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-9 gap-3 items-end">
            <Field label="外呼开始日期"><input type="date" value={filters.dateFrom} onChange={(e) => updateFilter('dateFrom', e.target.value)} className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm" /></Field>
            <Field label="外呼结束日期"><input type="date" value={filters.dateTo} onChange={(e) => updateFilter('dateTo', e.target.value)} className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm" /></Field>
            <Field label="大区"><select value={filters.region} onChange={(e) => updateFilter('region', e.target.value)} className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm"><option value="">全部</option>{regions.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
            <Field label="战区"><select value={filters.zone} onChange={(e) => updateFilter('zone', e.target.value)} className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm"><option value="">全部</option>{zones.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
            <Field label="门店"><input value={filters.dealer} onChange={(e) => updateFilter('dealer', e.target.value)} placeholder="编码或名称" className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm" /></Field>
            <Field label="顾问/坐席"><input value={filters.callPerson} onChange={(e) => updateFilter('callPerson', e.target.value)} placeholder="姓名、工号或电话" className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm" /></Field>
            <Field label="接听归类"><select value={filters.answerGroup} onChange={(e) => updateFilter('answerGroup', e.target.value)} className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm"><option value="">全部</option><option value="answered">接通</option><option value="unanswered">未接听</option></select></Field>
            <Field label="呼叫类型"><select value={filters.callType} onChange={(e) => updateFilter('callType', e.target.value)} className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm"><option value="outbound">外呼</option><option value="inbound">呼入</option><option value="all">全部</option></select></Field>
            <div className="flex gap-2">
              <button onClick={handleSearch} className="flex-1 inline-flex items-center justify-center gap-2 h-9 bg-teal-700 text-white rounded-lg text-sm hover:bg-teal-800"><Search className="w-4 h-4" />查询</button>
              <button onClick={resetFilters} className="h-9 px-3 border border-slate-200 rounded-lg text-sm bg-white hover:bg-slate-50">重置</button>
            </div>
          </div>
        </section>

        {error && (
          <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-100 text-red-700 rounded-lg px-3 py-2 text-sm">
            <AlertCircle className="w-4 h-4" />{error}
          </div>
        )}

        <section className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
          <Metric label="外呼总数" value={formatInt(summary.total_calls)} hint={`去重号码 ${formatInt(summary.unique_numbers)}`} tone="teal" />
          <Metric label="接通率" value={formatRate(summary.answered_rate)} hint={`接通数 ${formatInt(summary.answered_calls)}`} tone="blue" />
          <Metric label="有效通话率" value={formatRate(summary.effective_rate)} hint={`有效通话 ${formatInt(summary.effective_calls)}`} tone="green" />
          <Metric label="人均外呼数" value={formatInt(summary.per_staff_calls)} hint={`外呼人数 ${formatInt(summary.active_staff_count)}`} tone="violet" />
          <Metric label="平均通话时长" value={summary.avg_talk_duration_text} hint={`30s ${formatInt(summary.effective_30s_calls)} / 60s ${formatInt(summary.effective_60s_calls)}`} tone="amber" />
          <Metric label="高频未接通号码" value={formatInt(summary.high_freq_unanswered_numbers)} hint="同门店同号码 >=5 次且未接通" tone="red" />
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[1.5fr_0.9fr] gap-4 mb-4">
          <div className="bg-white border border-slate-200 rounded-lg">
            <div className="min-h-14 px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-900">外呼趋势</h2>
                <p className="text-xs text-slate-500 mt-0.5">悬停柱子查看对应数据</p>
              </div>
              <div className="inline-flex bg-slate-100 rounded-lg p-1">
                {([
                  ['volume', '外呼量'],
                  ['rate', '接通率'],
                  ['quality', '有效通话'],
                ] as [TrendMode, string][]).map(([key, label]) => (
                  <button key={key} onClick={() => setTrendMode(key)} className={`px-3 py-1.5 rounded-md text-sm ${trendMode === key ? 'bg-white shadow-sm text-slate-900 font-medium' : 'text-slate-500'}`}>{label}</button>
                ))}
              </div>
            </div>
            <div className="h-[340px] p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="dateLabel" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip formatter={(value: number, name) => [(typeof value === 'number' && (String(name).includes('率') || String(name).includes('占比'))) ? `${Number(value).toFixed(1)}%` : formatInt(Number(value)), name]} />
                  <Legend />
                  {trendMode === 'volume' && <Bar dataKey="total_calls" name="外呼总数" fill="#0f766e" />}
                  {trendMode === 'volume' && <Bar dataKey="answered_calls" name="接通数" fill="#2563eb" />}
                  {trendMode === 'rate' && <Bar dataKey="answered_rate" name="接通率" fill="#2563eb" />}
                  {trendMode === 'rate' && <Bar dataKey="effective_30s_rate" name="30s通话占比" fill="#15803d" />}
                  {trendMode === 'rate' && <Bar dataKey="effective_60s_rate" name="60s通话占比" fill="#6d28d9" />}
                  {trendMode === 'quality' && <Bar dataKey="effective_calls" name="有效通话" fill="#15803d" />}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg">
            <div className="px-4 py-3 border-b border-slate-200">
              <h2 className="font-semibold text-slate-900">管理关注</h2>
              <p className="text-xs text-slate-500 mt-0.5">按高频未接通号码排序</p>
            </div>
            <div className="p-4 space-y-3">
              {focusStores.length ? focusStores.map((row, index) => (
                <div key={row.dealer_id} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-100 pb-3 last:border-0">
                  <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold">{index + 1}</span>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{row.dealer_name}</div>
                    <div className="text-xs text-slate-500 truncate">{row.region} / {row.zone}</div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${row.high_freq_unanswered_numbers > 20 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                    高频未接通 {formatInt(row.high_freq_unanswered_numbers)}
                  </span>
                </div>
              )) : <div className="text-sm text-slate-500">暂无关注项</div>}
            </div>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="min-h-14 px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">统计分析</h2>
              <p className="text-xs text-slate-500 mt-0.5">门店无外呼数据也会展示为 0</p>
            </div>
            <div className="inline-flex bg-slate-100 rounded-lg p-1">
              {([
                ['store', '门店排行'],
                ['consultant', '顾问排行'],
                ['number', '号码治理'],
                ['quality', '质量异常'],
              ] as [TabKey, string][]).map(([key, label]) => (
                <button key={key} onClick={() => setActiveTab(key)} className={`px-3 py-1.5 rounded-md text-sm ${activeTab === key ? 'bg-white shadow-sm text-slate-900 font-medium' : 'text-slate-500'}`}>{label}</button>
              ))}
            </div>
          </div>
          {activeTab === 'store' && (
            <StoreTable
              rows={pagedStores}
              page={normalizedStorePage}
              pageSize={STORE_PAGE_SIZE}
              total={stores.length}
              totalPages={storeTotalPages}
              pageInput={storePageInput}
              onPageInputChange={setStorePageInput}
              onGotoPage={gotoStorePage}
              onPrev={() => gotoStorePage(String(normalizedStorePage - 1))}
              onNext={() => gotoStorePage(String(normalizedStorePage + 1))}
            />
          )}
          {activeTab === 'consultant' && (
            <LazyTableState state={lazyTabs.consultant} onRetry={() => loadLazyTab('consultant', appliedFilters, true)}>
              <ConsultantTable rows={consultants} />
            </LazyTableState>
          )}
          {activeTab === 'number' && (
            <LazyTableState state={lazyTabs.number} onRetry={() => loadLazyTab('number', appliedFilters, true)}>
              <NumberTable rows={numbers} />
            </LazyTableState>
          )}
          {activeTab === 'quality' && (
            <LazyTableState state={lazyTabs.quality} onRetry={() => loadLazyTab('quality', appliedFilters, true)}>
              <QualityTable rows={quality} />
            </LazyTableState>
          )}
        </section>
      </main>
    </div>
  )
}

function LazyTableState({
  state,
  onRetry,
  children,
}: {
  state: { loading: boolean; loaded: boolean; error: string | null }
  onRetry: () => void
  children: React.ReactNode
}) {
  if (state.loading && !state.loaded) {
    return <div className="px-4 py-10 text-center text-sm text-slate-500">数据加载中...</div>
  }
  if (state.error) {
    return (
      <div className="px-4 py-10 text-center text-sm text-red-600">
        <div>{state.error}</div>
        <button onClick={onRetry} className="mt-3 px-3 py-1.5 border border-red-200 rounded-lg bg-white hover:bg-red-50">重试</button>
      </div>
    )
  }
  if (!state.loaded) {
    return <div className="px-4 py-10 text-center text-sm text-slate-500">数据准备中...</div>
  }
  return <>{children}</>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs font-medium text-slate-500">{label}</span><div className="mt-1">{children}</div></label>
}

function Metric({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: string }) {
  const toneClass: Record<string, string> = {
    teal: 'bg-teal-50 text-teal-700',
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    violet: 'bg-violet-50 text-violet-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
  }
  return (
    <article className="bg-white border border-slate-200 rounded-lg p-4 min-h-[104px]">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span className={`px-2 py-0.5 rounded-full ${toneClass[tone] || toneClass.teal}`}>统计</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      <div className="mt-2 text-xs text-slate-500">{hint}</div>
    </article>
  )
}

function StoreTable({
  rows,
  page,
  pageSize,
  total,
  totalPages,
  pageInput,
  onPageInputChange,
  onGotoPage,
  onPrev,
  onNext,
}: {
  rows: StoreRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  pageInput: string
  onPageInputChange: (value: string) => void
  onGotoPage: () => void
  onPrev: () => void
  onNext: () => void
}) {
  const start = total ? (page - 1) * pageSize + 1 : 0
  const end = Math.min(page * pageSize, total)
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1500px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{['排名', '门店', '大区', '战区', '外呼总数', '去重号码', '接通率', '有效通话率', '有效通话', '30s有效通话', '60s有效通话', '人均外呼', '平均轮次', '高频未接通', '录音覆盖率'].map((h) => <th key={h} className="text-left px-3 py-3 font-medium whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.dealer_id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-3">{(page - 1) * pageSize + index + 1}</td>
                <td className="px-3 py-3"><div className="font-medium">{row.dealer_name}</div><div className="text-xs text-slate-400 font-mono">{row.dealer_id}</div></td>
                <td className="px-3 py-3">{row.region}</td>
                <td className="px-3 py-3">{row.zone}</td>
                <td className="px-3 py-3">{formatInt(row.total_calls)}</td>
                <td className="px-3 py-3">{formatInt(row.unique_numbers)}</td>
                <td className="px-3 py-3">{formatRate(row.answered_rate)}</td>
                <td className="px-3 py-3">{formatRate(row.effective_rate)}</td>
                <td className="px-3 py-3">{formatInt(row.effective_calls)}</td>
                <td className="px-3 py-3">{formatInt(row.effective_30s_calls)}</td>
                <td className="px-3 py-3">{formatInt(row.effective_60s_calls)}</td>
                <td className="px-3 py-3">{formatInt(row.per_staff_calls)}</td>
                <td className="px-3 py-3">{Number(row.avg_call_round || 0).toFixed(1)}</td>
                <td className="px-3 py-3">{formatInt(row.high_freq_unanswered_numbers)}</td>
                <td className="px-3 py-3">{formatRate(row.recording_rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-slate-600">
        <div>共 {formatInt(total)} 家门店，当前展示 {formatInt(start)} - {formatInt(end)}，每页 {pageSize} 家</div>
        <div className="flex items-center gap-2">
          <button onClick={onPrev} disabled={page <= 1} className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-50">上一页</button>
          <span>第 {page} / {totalPages} 页</span>
          <button onClick={onNext} disabled={page >= totalPages} className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-50">下一页</button>
          <input
            value={pageInput}
            onChange={(event) => onPageInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onGotoPage()
            }}
            className="w-20 h-8 border border-slate-200 rounded-lg px-2"
            inputMode="numeric"
          />
          <button onClick={onGotoPage} className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white hover:bg-slate-50">跳转</button>
        </div>
      </div>
    </>
  )
}

function ConsultantTable({ rows }: { rows: ConsultantRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1400px] text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>{['排名', '顾问', '岗位', '门店', '座席工号', '座席电话', '外呼总数', '接通率', '有效通话', '30s有效通话', '60s有效通话', '平均通话', '短通话占比', '无录音数'].map((h) => <th key={h} className="text-left px-3 py-3 font-medium whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.dealer_id}-${row.staff_id}-${row.seat_id}-${index}`} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-3 py-3">{index + 1}</td>
              <td className="px-3 py-3"><div className="font-medium">{row.consultant_name || '-'}</div><div className="text-xs text-slate-400 font-mono">{row.staff_id || '-'}</div></td>
              <td className="px-3 py-3">{row.consultant_role || '-'}</td>
              <td className="px-3 py-3">{row.dealer_name || '-'}</td>
              <td className="px-3 py-3 font-mono">{row.seat_id || '-'}</td>
              <td className="px-3 py-3 font-mono">{row.seat_phone || '-'}</td>
              <td className="px-3 py-3">{formatInt(row.total_calls)}</td>
              <td className="px-3 py-3">{formatRate(row.answered_rate)}</td>
              <td className="px-3 py-3">{formatInt(row.effective_calls)}</td>
              <td className="px-3 py-3">{formatInt(row.effective_30s_calls)}</td>
              <td className="px-3 py-3">{formatInt(row.effective_60s_calls)}</td>
              <td className="px-3 py-3">{row.avg_talk_duration_text}</td>
              <td className="px-3 py-3">{formatRate(row.short_talk_rate)}</td>
              <td className="px-3 py-3">{formatInt(row.no_recording_calls)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function NumberTable({ rows }: { rows: NumberRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1260px] text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>{['外呼号码', '门店', '归属顾问', '外呼次数', '是否接通', '首次外呼', '最近外呼', '最大通话', '风险标签'].map((h) => <th key={h} className="text-left px-3 py-3 font-medium whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.dealer_id}-${row.call_number}`} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-3 py-3 font-mono font-medium">{row.call_number}</td>
              <td className="px-3 py-3">{row.dealer_name || '-'}</td>
              <td className="px-3 py-3">{row.latest_caller_name || '-'}</td>
              <td className="px-3 py-3">{formatInt(row.total_calls)}</td>
              <td className="px-3 py-3"><span className={`px-2 py-1 rounded-full text-xs ${row.has_answered ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{row.has_answered ? '是' : '否'}</span></td>
              <td className="px-3 py-3">{row.first_call_time}</td>
              <td className="px-3 py-3">{row.latest_call_time}</td>
              <td className="px-3 py-3">{row.max_talk_duration_text}</td>
              <td className="px-3 py-3">{row.risk_tag}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function QualityTable({ rows }: { rows: QualityRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>{['异常类型', '数量', '占比', '判断规则', '优先级'].map((h) => <th key={h} className="text-left px-3 py-3 font-medium whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.type} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-3 py-3 font-medium">{row.type}</td>
              <td className="px-3 py-3">{formatInt(row.count)}</td>
              <td className="px-3 py-3">{row.type === '低接通门店' ? `${formatInt(row.ratio)}家` : formatRate(row.ratio)}</td>
              <td className="px-3 py-3">{row.rule}</td>
              <td className="px-3 py-3"><span className={`px-2 py-1 rounded-full text-xs ${row.priority === '高' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{row.priority}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
