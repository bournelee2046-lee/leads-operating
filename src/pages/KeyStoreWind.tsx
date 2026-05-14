import React, { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Minus, Wind, ChevronDown, ChevronUp,
  Target, Activity, ArrowUp, ArrowDown, ArrowRight,
  Store, BarChart3, CheckCircle,
} from 'lucide-react'
import {
  WINDOW_OPTIONS, trendData, absData, compositeScore,
  generateDailySeries, STORE_DETAILS, DATES, METRIC_LABELS,
} from '../data/windMockData'

const KeyStoreWind: React.FC = () => {
  const [windowDays, setWindowDays] = useState(7)
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null)
  const [showAbsTable, setShowAbsTable] = useState(true)
  const [showStoreDetail, setShowStoreDetail] = useState(false)
  const [selectedStore, setSelectedStore] = useState<string | null>(null)
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortAsc, setSortAsc] = useState(true)

  const activeMetrics = Object.keys(METRIC_LABELS)

  const trendSeries = useMemo(() => {
    const result: Record<string, { ks: number[]; all: number[] }> = {}
    activeMetrics.forEach((key) => {
      result[key] = generateDailySeries(key)
    })
    return result
  }, [activeMetrics])

  const trendSummary = useMemo(() => {
    const t1Avg = trendData.reduce((s, r) => s + r.t1SyncRate, 0) / trendData.length
    const t2Avg = trendData.reduce((s, r) => s + r.t2InflectionSync, 0) / trendData.length
    const t3Avg = trendData.reduce((s, r) => s + r.t3SlopeRatio, 0) / trendData.length
    const maxDiverge = Math.max(...trendData.map((r) => r.t4DivergeDays))
    const pioneerCount = trendData.filter((r) => r.t5IsPioneer).length
    return { t1Avg, t2Avg, t3Avg, maxDiverge, pioneerCount }
  }, [])

  const colorForSync = (v: number) => v >= 80 ? 'text-green-600' : v >= 60 ? 'text-amber-500' : 'text-red-500'
  const bgForSync = (v: number) => v >= 80 ? 'bg-green-50' : v >= 60 ? 'bg-amber-50' : 'bg-red-50'
  const colorForSlope = (v: number) => v >= 0.8 && v <= 1.2 ? 'text-green-600' : 'text-amber-500'
  const bgForSlope = (v: number) => v >= 0.8 && v <= 1.2 ? 'bg-green-50' : 'bg-amber-50'
  const colorForStability = (s: string) => s === 'low' ? 'text-green-600' : s === 'medium' ? 'text-amber-500' : 'text-red-500'
  const bgForStability = (s: string) => s === 'low' ? 'bg-green-50' : s === 'medium' ? 'bg-amber-50' : 'bg-red-50'
  const labelForStability = (s: string) => s === 'low' ? '低' : s === 'medium' ? '中' : '高'
  const colorForDiverge = (d: number) => d === 0 ? 'text-green-600' : d <= 2 ? 'text-amber-500' : 'text-red-500'
  const bgForDiverge = (d: number) => d === 0 ? 'bg-green-50' : d <= 2 ? 'bg-amber-50' : 'bg-red-50'

  const sortedStores = useMemo(() => {
    const list = [...STORE_DETAILS]
    if (sortField) {
      list.sort((a, b) => {
        const va = a.metrics[sortField] ?? 0
        const vb = b.metrics[sortField] ?? 0
        return sortAsc ? va - vb : vb - va
      })
    }
    return list
  }, [sortField, sortAsc])

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(true)
    }
  }

  const scoreColor = compositeScore.level === 'green' ? 'text-green-600' : compositeScore.level === 'yellow' ? 'text-amber-500' : 'text-red-500'
  const scoreBg = compositeScore.level === 'green' ? 'bg-green-50' : compositeScore.level === 'yellow' ? 'bg-amber-50' : 'bg-red-50'

  const renderTrendArrow = (dir: 'up' | 'down' | 'flat') => {
    if (dir === 'up') return <ArrowUp className="w-3 h-3 text-green-500 inline" />
    if (dir === 'down') return <ArrowDown className="w-3 h-3 text-red-500 inline" />
    return <ArrowRight className="w-3 h-3 text-slate-400 inline" />
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 页头 */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Wind className="w-6 h-6 text-primary-600" />
            <h1 className="text-xl font-bold text-slate-900">重点店风向监测</h1>
          </div>
          <p className="text-sm text-slate-500">
            以11家重点门店为监测样本，通过趋势一致性与绝对值偏离度评估品牌整体线索运营健康走向。「趋势指标 7 个 / 绝对值指标 3 个」
          </p>
        </div>

        {/* ===== A区 顶部概览栏 ===== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* A1: 综合趋势得分卡片 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">综合趋势得分 T7</p>
            <div className="flex items-end gap-3 mt-2">
              <span className={`text-4xl font-bold ${scoreColor}`}>{compositeScore.score}</span>
              <div className="flex items-center gap-1 mb-1">
                {compositeScore.trend === 'up' ? (
                  <TrendingUp className="w-4 h-4 text-green-500" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-500" />
                )}
                <span className={`text-sm font-medium ${compositeScore.trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                  {compositeScore.trend === 'up' ? '+' : ''}{compositeScore.change}
                </span>
              </div>
            </div>
            <div className="mt-3">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${scoreBg} ${scoreColor}`}>
                {compositeScore.level === 'green' ? '风向明确' : compositeScore.level === 'yellow' ? '部分存疑' : '需要关注'}
              </span>
            </div>
          </div>

          {/* A2: 10指标结构环形图 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">监测指标体系</p>
            <div className="flex items-center gap-4 mt-1">
              <svg width="56" height="56" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="22" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                <circle cx="28" cy="28" r="22" fill="none" stroke="#3b82f6" strokeWidth="8"
                  strokeDasharray="96.8 41.5" strokeDashoffset="0" transform="rotate(-90 28 28)" />
              </svg>
              <div>
                <p className="text-2xl font-bold text-slate-900">10</p>
                <p className="text-xs text-slate-500">个监测指标</p>
                <div className="flex items-center gap-3 mt-1 text-xs">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />趋势7</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />绝对值3</span>
                </div>
              </div>
            </div>
          </div>

          {/* A3: 趋势/绝对值占比 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">趋势/绝对值 占比</p>
            <div className="mt-2">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>趋势类 70%</span>
                <span>绝对值类 30%</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
                <div className="h-full bg-blue-500 rounded-l-full" style={{ width: '70%' }} />
                <div className="h-full bg-amber-400 rounded-r-full" style={{ width: '30%' }} />
              </div>
            </div>
            <div className="mt-3 flex gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-blue-500" />T1-T7 趋势指标</span>
              <span className="flex items-center gap-1"><Target className="w-3 h-3 text-amber-500" />A1-A3 绝对值指标</span>
            </div>
          </div>

          {/* A4: 窗口选择器 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">统计窗口</p>
            <div className="flex gap-2 mt-2">
              {WINDOW_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setWindowDays(d)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                    windowDays === d
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {d}天
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              当前统计周期：最近 {windowDays} 天
            </p>
          </div>
        </div>

        {/* ===== B区 趋势镜面表格 ===== */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-500" />
              <h2 className="text-base font-semibold text-slate-900">趋势镜面</h2>
              <span className="text-xs text-slate-400">指标间趋势一致性对比</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  <th className="text-left px-5 py-3 font-medium">业务指标</th>
                  <th className="text-center px-4 py-3 font-medium w-20">T1 同步率</th>
                  <th className="text-center px-4 py-3 font-medium w-20">T2 拐点率</th>
                  <th className="text-center px-4 py-3 font-medium w-20">T3 斜率比</th>
                  <th className="text-center px-4 py-3 font-medium w-20">T4 背离天</th>
                  <th className="text-center px-4 py-3 font-medium w-16">T5 先行</th>
                  <th className="text-center px-4 py-3 font-medium w-20">T6 稳定性</th>
                </tr>
              </thead>
              <tbody>
                {trendData.map((row) => (
                  <tr
                    key={row.metricKey}
                    onClick={() => setExpandedMetric(expandedMetric === row.metricKey ? null : row.metricKey)}
                    className={`border-t border-slate-50 hover:bg-blue-50/40 cursor-pointer transition-colors ${
                      expandedMetric === row.metricKey ? 'bg-blue-50/60' : ''
                    }`}
                  >
                    <td className="px-5 py-3 font-medium text-slate-800">{row.metricName}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${bgForSync(row.t1SyncRate)} ${colorForSync(row.t1SyncRate)}`}>
                        {row.t1SyncRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${bgForSync(row.t2InflectionSync)} ${colorForSync(row.t2InflectionSync)}`}>
                        {row.t2InflectionSync.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${bgForSlope(row.t3SlopeRatio)} ${colorForSlope(row.t3SlopeRatio)}`}>
                        {row.t3SlopeRatio.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${bgForDiverge(row.t4DivergeDays)} ${colorForDiverge(row.t4DivergeDays)}`}>
                        {row.t4DivergeDays}天
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.t5IsPioneer ? (
                        <CheckCircle className="w-4 h-4 text-blue-500 mx-auto" />
                      ) : (
                        <Minus className="w-4 h-4 text-slate-300 mx-auto" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${bgForStability(row.t6Stability)} ${colorForStability(row.t6Stability)}`}>
                        {labelForStability(row.t6Stability)} CV:{row.t6CV.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
                {/* 汇总行 */}
                <tr className="border-t-2 border-slate-200 bg-slate-50/80 font-medium">
                  <td className="px-5 py-3 text-slate-700">汇总</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${bgForSync(trendSummary.t1Avg)} ${colorForSync(trendSummary.t1Avg)}`}>
                      {trendSummary.t1Avg.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${bgForSync(trendSummary.t2Avg)} ${colorForSync(trendSummary.t2Avg)}`}>
                      {trendSummary.t2Avg.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${bgForSlope(trendSummary.t3Avg)} ${colorForSlope(trendSummary.t3Avg)}`}>
                      {trendSummary.t3Avg.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${bgForDiverge(trendSummary.maxDiverge)} ${colorForDiverge(trendSummary.maxDiverge)}`}>
                      {trendSummary.maxDiverge}天
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-600">{trendSummary.pioneerCount}/6</td>
                  <td className="px-4 py-3 text-center text-slate-600">-</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ===== C区 时间序列图表 ===== */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-500" />
              <h2 className="text-base font-semibold text-slate-900">趋势时间序列</h2>
              <span className="text-xs text-slate-400">蓝线=重点店组合 灰线=全品牌 点击指标行或小图可展开</span>
            </div>
          </div>
          <div className="p-4">
            {expandedMetric ? (
              <div>
                <button
                  onClick={() => setExpandedMetric(null)}
                  className="text-sm text-primary-600 hover:text-primary-700 mb-3 flex items-center gap-1"
                >
                  <ChevronUp className="w-4 h-4" />收起大图
                </button>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={DATES.map((d, i) => ({
                      date: d,
                      ks: trendSeries[expandedMetric]?.ks[i] ?? 0,
                      all: trendSeries[expandedMetric]?.all[i] ?? 0,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} unit="%" />
                      <Tooltip
                        contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
                        formatter={(value: number, name: string) => [
                          `${value}%`,
                          name === 'ks' ? '重点店组合' : '全品牌',
                        ]}
                      />
                      <defs>
                        <linearGradient id="colorKs" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorAll" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#9ca3af" stopOpacity={0.1} />
                          <stop offset="95%" stopColor="#9ca3af" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="all" stroke="#9ca3af" fill="url(#colorAll)" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="ks" stroke="#3b82f6" fill="url(#colorKs)" strokeWidth={2.5} dot={{ r: 3, fill: '#3b82f6' }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-slate-500 mt-2 text-center">
                  {METRIC_LABELS[expandedMetric]} — 7日趋势
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeMetrics.map((key) => {
                  const chartData = DATES.map((d, i) => ({
                    date: d,
                    ks: trendSeries[key]?.ks[i] ?? 0,
                    all: trendSeries[key]?.all[i] ?? 0,
                  }))
                  return (
                    <div
                      key={key}
                      onClick={() => setExpandedMetric(key)}
                      className="cursor-pointer rounded-xl border border-slate-100 hover:border-blue-200 hover:shadow-sm transition-all p-2"
                    >
                      <p className="text-xs font-medium text-slate-600 mb-1 px-1">{METRIC_LABELS[key]}</p>
                      <ResponsiveContainer width="100%" height={120}>
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" />
                          <XAxis dataKey="date" tick={false} axisLine={false} />
                          <YAxis tick={false} axisLine={false} width={0} />
                          <Line type="monotone" dataKey="all" stroke="#cbd5e1" strokeWidth={1.5} dot={false} />
                          <Line type="monotone" dataKey="ks" stroke="#3b82f6" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ===== D区 绝对值镜面表格 ===== */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
          <div
            className="px-6 py-4 border-b border-slate-100 flex items-center justify-between cursor-pointer select-none"
            onClick={() => setShowAbsTable(!showAbsTable)}
          >
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-amber-500" />
              <h2 className="text-base font-semibold text-slate-900">绝对值镜面</h2>
              <span className="text-xs text-slate-400">重点店 vs 全品牌均值对比</span>
            </div>
            <button className="text-slate-400 hover:text-slate-600 transition-colors">
              {showAbsTable ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>
          </div>
          {showAbsTable && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500">
                    <th className="text-left px-5 py-3 font-medium">业务指标</th>
                    <th className="text-right px-4 py-3 font-medium">重点店均值</th>
                    <th className="text-right px-4 py-3 font-medium">全品牌均值</th>
                    <th className="text-right px-4 py-3 font-medium">A1 偏离度</th>
                    <th className="text-right px-4 py-3 font-medium">A2 离散度</th>
                    <th className="text-center px-4 py-3 font-medium">A3 有效店数</th>
                  </tr>
                </thead>
                <tbody>
                  {absData.map((row) => (
                    <tr key={row.metricKey} className="border-t border-slate-50">
                      <td className="px-5 py-3 font-medium text-slate-800">{row.metricName}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">{row.ksAvg.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-500">{row.allAvg.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          Math.abs(row.a1Deviation) <= 10 ? 'bg-green-50 text-green-600' : Math.abs(row.a1Deviation) <= 20 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
                        }`}>
                          {row.a1Deviation > 0 ? '+' : ''}{row.a1Deviation.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">{row.a2Dispersion.toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          row.a3ValidCount === 11 ? 'bg-green-50 text-green-600' : row.a3ValidCount >= 8 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
                        }`}>
                          {row.a3ValidCount}/11
                        </span>
                      </td>
                    </tr>
                  ))}
                  {/* 汇总行 */}
                  <tr className="border-t-2 border-slate-200 bg-slate-50/80 font-medium">
                    <td className="px-5 py-3 text-slate-700">汇总</td>
                    <td className="px-4 py-3 text-right text-slate-600">-</td>
                    <td className="px-4 py-3 text-right text-slate-600">-</td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {(absData.reduce((s, r) => s + r.a1Deviation, 0) / absData.length).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {(absData.reduce((s, r) => s + r.a2Dispersion, 0) / absData.length).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">
                      {(absData.reduce((s, r) => s + r.a3ValidCount, 0) / absData.length).toFixed(1)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ===== E区 11家店明细表 ===== */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
          <div
            className="px-6 py-4 border-b border-slate-100 flex items-center justify-between cursor-pointer select-none"
            onClick={() => setShowStoreDetail(!showStoreDetail)}
          >
            <div className="flex items-center gap-2">
              <Store className="w-5 h-5 text-purple-500" />
              <h2 className="text-base font-semibold text-slate-900">11家重点店明细</h2>
              <span className="text-xs text-slate-400">点击行查看该店趋势详情</span>
            </div>
            <button className="text-slate-400 hover:text-slate-600 transition-colors">
              {showStoreDetail ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>
          </div>
          {showStoreDetail && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500">
                    <th className="text-left px-4 py-3 font-medium sticky left-0 bg-slate-50 z-10">门店</th>
                    <th className="text-left px-3 py-3 font-medium w-20">类型</th>
                    {activeMetrics.map((key) => (
                      <th
                        key={key}
                        onClick={() => handleSort(key)}
                        className="text-right px-3 py-3 font-medium cursor-pointer hover:text-primary-600 transition-colors select-none"
                      >
                        <span className="flex items-center justify-end gap-1">
                          {METRIC_LABELS[key].replace('率', '')}
                          {sortField === key && (
                            <span className="text-primary-500">{sortAsc ? '↑' : '↓'}</span>
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedStores.map((store) => (
                    <tr
                      key={store.dealerId}
                      onClick={() => setSelectedStore(selectedStore === store.dealerId ? null : store.dealerId)}
                      className={`border-t border-slate-50 hover:bg-purple-50/30 cursor-pointer transition-colors ${
                        selectedStore === store.dealerId ? 'bg-purple-50/50' : ''
                      }`}
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-800 sticky left-0 bg-white">
                        <span className="flex items-center gap-2">
                          {store.dealerShortName}
                          <span className="text-[10px] text-slate-400">{store.dealerId}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          store.type === '非商贸重点店' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'
                        }`}>
                          {store.type.replace('重点店', '')}
                        </span>
                      </td>
                      {activeMetrics.map((key) => (
                        <td key={key} className="px-3 py-2.5 text-right font-mono text-slate-700">
                          <span className="flex items-center justify-end gap-1">
                            {store.metrics[key]?.toFixed(1)}%
                            {renderTrendArrow(store.directions[key])}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                  {/* 汇总行：重点店均值 */}
                  <tr className="border-t-2 border-slate-200 bg-blue-50/30 font-medium">
                    <td className="px-4 py-2.5 text-slate-700 sticky left-0 bg-blue-50/30">重点店均值</td>
                    <td className="px-3 py-2.5 text-xs text-slate-400">11 家</td>
                    {activeMetrics.map((key) => {
                      const avg = STORE_DETAILS.reduce((s, st) => s + (st.metrics[key] ?? 0), 0) / STORE_DETAILS.length
                      return (
                        <td key={key} className="px-3 py-2.5 text-right font-mono text-blue-700">
                          {avg.toFixed(1)}%
                        </td>
                      )
                    })}
                  </tr>
                  {/* 汇总行：全品牌均值 */}
                  <tr className="border-t border-slate-100 bg-slate-50/50 font-medium">
                    <td className="px-4 py-2.5 text-slate-500 sticky left-0 bg-slate-50/50">全品牌均值</td>
                    <td className="px-3 py-2.5 text-xs text-slate-400">-</td>
                    {activeMetrics.map((key) => {
                      const row = absData.find((r) => r.metricKey === key)
                      return (
                        <td key={key} className="px-3 py-2.5 text-right font-mono text-slate-500">
                          {row?.allAvg.toFixed(1)}%
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selectedStore && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Store className="w-5 h-5 text-purple-500" />
                <h3 className="text-sm font-semibold text-slate-900">
                  {STORE_DETAILS.find((s) => s.dealerId === selectedStore)?.dealerName} 趋势详情
                </h3>
              </div>
              <button
                onClick={() => setSelectedStore(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeMetrics.map((key) => {
                const chartData = DATES.map((d, i) => ({
                  date: d,
                  value: (trendSeries[key]?.ks[i] ?? 0) + (Math.random() - 0.5) * 8,
                }))
                return (
                  <div key={key} className="rounded-xl border border-slate-100 p-2">
                    <p className="text-xs font-medium text-slate-600 mb-1 px-1">{METRIC_LABELS[key]}</p>
                    <ResponsiveContainer width="100%" height={80}>
                      <LineChart data={chartData}>
                        <Line type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default KeyStoreWind
