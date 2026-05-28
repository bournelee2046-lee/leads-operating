import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  Clock3,
  Info,
  Layers3,
  MapPinned,
  RefreshCw,
  Target,
  TrendingUp,
} from 'lucide-react'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { apiFetch } from '@/lib/api'

type LineKey = 'target' | 'ma7' | 'ma15' | 'lastMonth'
type Region = string
type ProvinceStatus = 'normal' | 'watch' | 'lag'

type MonthTrendRow = {
  label: string
  day: number
  visits: number
  target: number
  lastMonth: number
  cumulative: number
  progress: number
  mom: number
  ma7: number
  ma15: number
}

type ProvincePoint = {
  name: string
  region: string
  regions: string[]
  status: ProvinceStatus
  x: number
  y: number
  desc: string
  action: string
}

type VisitTrendOverview = {
  latest_data_date?: string
  trend?: Partial<MonthTrendRow>[]
  summary?: {
    visit_count?: number
    visit_rate?: number
    visit_achievement_rate?: number
    dealer_lead_count?: number
  }
  provinces?: Array<{
    name: string
    region?: string
    regions?: string[]
    status?: ProvinceStatus
    desc?: string
  }>
}

const statusText: Record<ProvinceStatus, string> = {
  normal: '正常',
  watch: '关注',
  lag: '落后',
}

const statusClasses: Record<ProvinceStatus, string> = {
  normal: 'bg-emerald-600 text-white border-emerald-500',
  watch: 'bg-amber-500 text-white border-amber-400',
  lag: 'bg-rose-600 text-white border-rose-500',
}

const statusSoftClasses: Record<ProvinceStatus, string> = {
  normal: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  watch: 'bg-amber-50 text-amber-700 border-amber-200',
  lag: 'bg-rose-50 text-rose-700 border-rose-200',
}

const lineMeta: Record<LineKey, { label: string; color: string; strokeDasharray?: string; help: string }> = {
  target: {
    label: '目标进度线',
    color: '#94a3b8',
    strokeDasharray: '7 7',
    help: '按月度目标折算的每日应达到店节奏',
  },
  ma7: {
    label: '7日均线',
    color: '#059669',
    help: '过滤单日波动，观察最近一周节奏',
  },
  ma15: {
    label: '15日均线',
    color: '#7c3aed',
    help: '观察半月级别趋势是否持续偏离',
  },
  lastMonth: {
    label: '上月同期',
    color: '#d97706',
    strokeDasharray: '4 5',
    help: '对比上月同日表现，判断同比节奏变化',
  },
}

const provinceData: ProvincePoint[] = [
  { name: '北京', region: '华北区', regions: ['华北区'], status: 'normal', x: 48, y: 31, desc: '首都区域整体节奏正常，可继续日常巡检。', action: '保持巡检' },
  { name: '天津', region: '华北区', regions: ['华北区'], status: 'watch', x: 52, y: 34, desc: '局部门店节奏偏慢，建议关注近 7 日新增。', action: '看近 7 日门店' },
  { name: '河北', region: '华北区', regions: ['华北区'], status: 'watch', x: 46, y: 36, desc: '省内门店状态分化，需要看战区和门店列表。', action: '拆到战区' },
  { name: '山西', region: '华北区', regions: ['华北区'], status: 'lag', x: 40, y: 38, desc: '进度落后，建议进入漏斗诊断查看线索供给和到店率。', action: '诊断供给和到店率' },
  { name: '内蒙古', region: '华北区', regions: ['华北区'], status: 'normal', x: 42, y: 24, desc: '节奏正常，但仍需关注远端门店样本波动。', action: '保持巡检' },
  { name: '辽宁', region: '东北区', regions: ['东北区'], status: 'normal', x: 60, y: 27, desc: '节奏正常，暂无明显扩散风险。', action: '保持巡检' },
  { name: '吉林', region: '东北区', regions: ['东北区'], status: 'watch', x: 63, y: 21, desc: '短线节奏需要关注，建议查看区域门店变化。', action: '看区域门店' },
  { name: '黑龙江', region: '东北区', regions: ['东北区'], status: 'normal', x: 62, y: 13, desc: '整体进度正常。', action: '保持巡检' },
  { name: '上海', region: '华东区', regions: ['华东区'], status: 'normal', x: 65, y: 51, desc: '进度正常，可作为稳定样本观察。', action: '保持巡检' },
  { name: '江苏', region: '华东区', regions: ['华东区'], status: 'normal', x: 61, y: 47, desc: '节奏正常。', action: '保持巡检' },
  { name: '浙江', region: '华东区', regions: ['华东区'], status: 'watch', x: 63, y: 57, desc: '部分门店短线新增偏弱，建议看门店分布。', action: '看门店分布' },
  { name: '安徽', region: '华东区', regions: ['华东区'], status: 'lag', x: 55, y: 51, desc: '进度落后，需进入漏斗页拆解原因。', action: '拆解落后原因' },
  { name: '福建', region: '华东区', regions: ['华东区'], status: 'normal', x: 61, y: 66, desc: '节奏正常。', action: '保持巡检' },
  { name: '江西', region: '华东区', regions: ['华东区'], status: 'watch', x: 54, y: 62, desc: '到店率有波动，建议结合新增经销商线索看。', action: '看新增经销商线索' },
  { name: '山东', region: '山东专区', regions: ['山东专区'], status: 'normal', x: 55, y: 40, desc: '节奏正常。', action: '保持巡检' },
  { name: '河南', region: '华中区', regions: ['华中区'], status: 'lag', x: 47, y: 48, desc: '进度落后，需要看省内门店和渠道供给。', action: '看门店和渠道' },
  { name: '湖北', region: '华中区', regions: ['华中区'], status: 'watch', x: 48, y: 57, desc: '省内门店状态分化，建议先看落后门店。', action: '看落后门店' },
  { name: '湖南', region: '湖南专区', regions: ['湖南专区'], status: 'normal', x: 47, y: 66, desc: '节奏正常。', action: '保持巡检' },
  { name: '广东', region: '华南一区', regions: ['华南一区', '华南二区'], status: 'normal', x: 51, y: 78, desc: '节奏正常。', action: '保持巡检' },
  { name: '广西', region: '华南一区', regions: ['华南一区'], status: 'watch', x: 40, y: 78, desc: '局部门店需要关注到店转化。', action: '看到店转化' },
  { name: '海南', region: '华南一区', regions: ['华南一区'], status: 'normal', x: 47, y: 90, desc: '节奏正常。', action: '保持巡检' },
  { name: '四川', region: '西区', regions: ['西区'], status: 'watch', x: 34, y: 62, desc: '省内到店节奏略慢，建议看近 7 日。', action: '看近 7 日' },
  { name: '重庆', region: '西区', regions: ['西区'], status: 'normal', x: 40, y: 61, desc: '节奏正常。', action: '保持巡检' },
  { name: '贵州', region: '云贵专区', regions: ['云贵专区'], status: 'lag', x: 39, y: 71, desc: '进度落后，需进入漏斗诊断。', action: '进入漏斗诊断' },
  { name: '云南', region: '云贵专区', regions: ['云贵专区'], status: 'watch', x: 31, y: 77, desc: '关注到店率波动。', action: '看到店率' },
  { name: '陕西', region: '西区', regions: ['西区'], status: 'normal', x: 38, y: 49, desc: '节奏正常。', action: '保持巡检' },
  { name: '甘肃', region: '西区', regions: ['西区'], status: 'watch', x: 30, y: 43, desc: '需要关注样本门店波动。', action: '看样本门店' },
  { name: '青海', region: '西区', regions: ['西区'], status: 'normal', x: 24, y: 48, desc: '节奏正常。', action: '保持巡检' },
  { name: '宁夏', region: '西区', regions: ['西区'], status: 'normal', x: 34, y: 38, desc: '节奏正常。', action: '保持巡检' },
  { name: '新疆', region: '西区', regions: ['西区'], status: 'normal', x: 16, y: 31, desc: '节奏正常。', action: '保持巡检' },
  { name: '西藏', region: '西区', regions: ['西区'], status: 'normal', x: 18, y: 62, desc: '节奏正常。', action: '保持巡检' },
]

const fallbackMonthTrend = createMonthTrend()
const defaultYearMonth = getCurrentYearMonth()

export default function VisitTrendDetail() {
  const [overview, setOverview] = useState<VisitTrendOverview | null>(null)
  const [dataError, setDataError] = useState('')
  const [dataLoading, setDataLoading] = useState(true)
  const [selectedYearMonth, setSelectedYearMonth] = useState(defaultYearMonth)
  const [refreshKey, setRefreshKey] = useState(0)
  const [visibleLines, setVisibleLines] = useState<Record<LineKey, boolean>>({
    target: true,
    ma7: true,
    ma15: true,
    lastMonth: true,
  })
  const [selectedRegion, setSelectedRegion] = useState<Region>('全国')
  const [selectedProvinceName, setSelectedProvinceName] = useState('安徽')

  useEffect(() => {
    let mounted = true
    const loadOverview = async () => {
      try {
        setDataLoading(true)
        setDataError('')
        const params = new URLSearchParams({ year_month: selectedYearMonth })
        const result = await apiFetch<{ success: boolean; data: VisitTrendOverview }>(`/api/visit-trend/overview?${params.toString()}`)
        if (mounted) setOverview(result.data)
      } catch (error: unknown) {
        if (mounted) {
          setOverview(null)
          const message = error instanceof Error ? error.message : ''
          setDataError(
            message.includes('未登录') || message.includes('过期')
              ? '登录状态已过期，当前展示样例数据；重新登录后可读取最新大盘数据。'
              : '大盘数据接口暂不可用，当前展示样例数据；请确认后端服务已启动并已加载最新接口。'
          )
        }
      } finally {
        if (mounted) setDataLoading(false)
      }
    }
    loadOverview()
    return () => {
      mounted = false
    }
  }, [selectedYearMonth, refreshKey])

  const trendRows = useMemo(() => {
    if (!overview?.trend?.length) return fallbackMonthTrend
    return overview.trend.map((row, index) => normalizeTrendRow(row, index))
  }, [overview])
  const selectedMonthLabel = formatYearMonthLabel(selectedYearMonth)
  const isCurrentMonth = selectedYearMonth === defaultYearMonth
  const mapProvinces = useMemo(() => mergeProvinceStatus(provinceData, overview?.provinces || []), [overview])
  const regionTabs = useMemo(() => {
    const regions = new Set<string>()
    mapProvinces.forEach((province) => {
      const provinceRegions = province.regions?.length ? province.regions : [province.region]
      provinceRegions.filter(Boolean).forEach((region) => regions.add(region))
    })
    return ['全国', ...Array.from(regions).sort((a, b) => a.localeCompare(b, 'zh-CN'))]
  }, [mapProvinces])
  const latest = trendRows[trendRows.length - 1]
  const selectedProvince = mapProvinces.find((item) => item.name === selectedProvinceName) || null
  const scopedProvinces = useMemo(() => {
    if (selectedRegion === '全国') return mapProvinces
    return mapProvinces.filter((item) => item.regions.includes(selectedRegion))
  }, [mapProvinces, selectedRegion])
  const focusRows = useMemo(() => {
    const rows = selectedProvince ? [selectedProvince] : scopedProvinces
    return [...rows].sort((a, b) => statusWeight[b.status] - statusWeight[a.status]).slice(0, 6)
  }, [scopedProvinces, selectedProvince])
  const statusStack = useMemo(() => {
    const rows = selectedProvince ? [selectedProvince] : scopedProvinces
    return (['normal', 'watch', 'lag'] as ProvinceStatus[]).map((status) => ({
      status,
      count: rows.filter((item) => item.status === status).length,
      ratio: rows.length ? rows.filter((item) => item.status === status).length / rows.length : 0,
    }))
  }, [scopedProvinces, selectedProvince])

  const toggleLine = (key: LineKey) => {
    setVisibleLines((current) => ({ ...current, [key]: !current[key] }))
  }

  const selectRegion = (region: Region) => {
    setSelectedRegion(region)
    setSelectedProvinceName('')
  }

  const selectProvince = (province: ProvincePoint) => {
    const nextRegion = selectedRegion !== '全国' && province.regions.includes(selectedRegion)
      ? selectedRegion
      : province.regions[0] || province.region
    setSelectedRegion(nextRegion)
    setSelectedProvinceName(province.name)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1640px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100" aria-label="返回首页">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold text-slate-900">到店进度大盘</h1>
              <p className="truncate text-xs text-slate-500">先判断月度趋势是否正常，再通过地图定位异常省份，具体运营动作进入漏斗目标达成</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="hidden items-center gap-2 text-xs text-slate-500 md:inline-flex">
              <span>查看月份</span>
              <input
                type="month"
                value={selectedYearMonth}
                max={defaultYearMonth}
                onChange={(event) => setSelectedYearMonth(event.target.value || defaultYearMonth)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              />
            </label>
            <span className="hidden rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-500 lg:inline-flex">
              数据截止：{overview?.latest_data_date || '截止昨日'}
            </span>
            <button
              type="button"
              onClick={() => setRefreshKey((current) => current + 1)}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={dataLoading}
            >
              <RefreshCw className={`h-4 w-4 ${dataLoading ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1640px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={BarChart3} label="当月累计到店数" value={formatInt(overview?.summary?.visit_count ?? latest.cumulative)} hint={dataLoading ? '正在读取最新数据' : `最新可见数据：${overview?.latest_data_date || '截止昨日'}`} tone="blue" />
          <MetricCard icon={TrendingUp} label="当前到店率" value={`${formatDecimal(overview?.summary?.visit_rate ?? 14.8)}%`} hint="口径：到店数 / 新增经销商线索" tone="emerald" />
          <MetricCard icon={Target} label="月到店数进度" value={`${formatDecimal(overview?.summary?.visit_achievement_rate ?? latest.progress)}%`} hint="按月度目标折算，不使用今日实时数据" tone="violet" />
          <MetricCard icon={AlertTriangle} label="需要关注省份" value={String(mapProvinces.filter((item) => item.status !== 'normal').length)} hint="地图只展示状态，不在底图展示数字" tone="amber" />
        </section>

        {dataError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {dataError}
          </div>
        )}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-start">
            <div>
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary-600" />
                <h2 className="text-base font-semibold text-slate-900">月度到店数趋势</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">主呈现为{isCurrentMonth ? '本月' : selectedMonthLabel}每日到店数，辅以目标节奏、均线和上月同期，帮助管理者快速判断是否偏离正常推进。</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 shadow-sm md:hidden">
                <span>月份</span>
                <input
                  type="month"
                  value={selectedYearMonth}
                  max={defaultYearMonth}
                  onChange={(event) => setSelectedYearMonth(event.target.value || defaultYearMonth)}
                  className="h-7 border-0 bg-transparent text-xs font-semibold text-slate-700 outline-none"
                />
              </label>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">
                <Clock3 className="h-3.5 w-3.5" />
                T+1 更新
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
                <Info className="h-3.5 w-3.5" />
                不展示今日分时
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 p-5 xl:grid-cols-[minmax(0,1.45fr)_360px]">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-4 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{isCurrentMonth ? '本月' : selectedMonthLabel}每日到店数</p>
                  <p className="mt-1 text-xs text-slate-500">浅蓝柱为当日到店数，蓝色主线强化{isCurrentMonth ? '本月' : '所选月份'}实际走势；下方图例可点击显示或隐藏辅助线。</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <LegendPill color="#60a5fa" label="本月每日到店数" />
                  {(Object.keys(lineMeta) as LineKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleLine(key)}
                      title={lineMeta[key].help}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        visibleLines[key]
                          ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                          : 'border-slate-200 bg-slate-100 text-slate-400 line-through'
                      }`}
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: lineMeta[key].color }} />
                      {lineMeta[key].label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-[460px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trendRows} margin={{ top: 24, right: 18, bottom: 10, left: 0 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} interval={2} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} domain={['dataMin - 18', 'dataMax + 28']} />
                    <Tooltip content={<MonthTrendTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }} />
                    <Bar dataKey="visits" barSize={22} radius={[5, 5, 0, 0]} name="当日进店数">
                      {trendRows.map((row) => (
                        <Cell key={row.label} fill={row.day === latest.day ? 'rgba(59, 130, 246, 0.62)' : 'rgba(96, 165, 250, 0.42)'} />
                      ))}
                    </Bar>
                    {visibleLines.target && (
                      <Line type="monotone" dataKey="target" stroke={lineMeta.target.color} strokeWidth={2.2} strokeDasharray={lineMeta.target.strokeDasharray} dot={false} name="目标进度线" />
                    )}
                    {visibleLines.lastMonth && (
                      <Line type="monotone" dataKey="lastMonth" stroke={lineMeta.lastMonth.color} strokeWidth={2.2} strokeDasharray={lineMeta.lastMonth.strokeDasharray} dot={false} opacity={0.72} name="上月同期进店数" />
                    )}
                    {visibleLines.ma15 && (
                      <Line type="monotone" dataKey="ma15" stroke={lineMeta.ma15.color} strokeWidth={2.4} dot={false} opacity={0.76} name="15日均线" />
                    )}
                    {visibleLines.ma7 && (
                      <Line type="monotone" dataKey="ma7" stroke={lineMeta.ma7.color} strokeWidth={2.5} dot={false} opacity={0.86} name="7日均线" />
                    )}
                    <Line type="monotone" dataKey="visits" stroke="#1d4ed8" strokeWidth={3.6} dot={{ r: 3.4, fill: '#1d4ed8', stroke: '#fff', strokeWidth: 1.5 }} activeDot={{ r: 5 }} name="本月每日到店数" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <aside className="space-y-4">
              <SidePanel title="趋势判读">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-amber-50 text-amber-600">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">短线略低于目标节奏</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">最近 7 日均线低于目标进度线，但仍高于上月同期。建议先看落后省份是否集中，再进入漏斗页拆原因。</p>
                  </div>
                </div>
              </SidePanel>
              <SidePanel title="辅助线怎么读">
                <div className="space-y-3 text-sm text-slate-600">
                  <GuideRow title="目标进度线" text="代表按月度目标均匀推进时，每日应达到的到店水平。" />
                  <GuideRow title="7日均线" text="用于看短期是否突然变弱，适合日常巡检。" />
                  <GuideRow title="15日均线" text="用于看半月趋势，避免被单日波动误导。" />
                  <GuideRow title="上月同期" text="用于判断当前节奏是季节性波动，还是经营动作导致的偏离。" />
                </div>
              </SidePanel>
              <SidePanel title="联动管理动作">
                <div className="space-y-2">
                  <Link to="/funnel-target-analysis?status=lag" className="flex h-10 items-center justify-between rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
                    查看落后门店
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link to="/funnel-target-analysis" className="flex h-10 items-center justify-between rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
                    进入漏斗目标达成
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </SidePanel>
            </aside>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.55fr)_390px]">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-start">
              <div>
                <div className="flex items-center gap-2">
                  <MapPinned className="h-5 w-5 text-primary-600" />
                  <h2 className="text-base font-semibold text-slate-900">全国省份门店进度状态</h2>
                </div>
                <p className="mt-1 text-sm text-slate-500">地图只表达空间分布和状态，不在地图上展示数字；点击省份后进入漏斗目标达成做原因诊断。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <LegendPill color="#059669" label="正常" />
                <LegendPill color="#d97706" label="关注" />
                <LegendPill color="#dc2626" label="落后" />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 px-5 pt-4">
              {regionTabs.map((region) => (
                <button
                  key={region}
                  type="button"
                  onClick={() => selectRegion(region)}
                  className={`h-9 rounded-lg border px-3 text-sm font-semibold transition-colors ${
                    selectedRegion === region
                      ? 'border-primary-600 bg-primary-600 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {region}
                </button>
              ))}
            </div>

            <div className="p-5">
              <div className="relative min-h-[620px] overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50">
                <div className="absolute left-4 top-4 z-10 flex max-w-[calc(100%-2rem)] flex-wrap gap-2">
                  <span className="rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">标准中国地图底图区接入位</span>
                  <span className="rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">业务状态覆盖层</span>
                </div>
                <ChinaMapPlaceholder />
                <div className="absolute inset-0">
                  {mapProvinces.map((province) => {
                    const dimmed = selectedRegion !== '全国' && !province.regions.includes(selectedRegion)
                    const selected = selectedProvinceName === province.name
                    return (
                      <button
                        key={province.name}
                        type="button"
                        onClick={() => selectProvince(province)}
                        className={`absolute min-w-[58px] -translate-x-1/2 -translate-y-1/2 rounded-lg border px-2 py-1.5 text-xs font-bold shadow-lg transition ${
                          statusClasses[province.status]
                        } ${dimmed ? 'opacity-25' : 'opacity-100'} ${selected ? 'scale-110 ring-4 ring-slate-900/10' : 'hover:scale-105'}`}
                        style={{ left: `${province.x}%`, top: `${province.y}%` }}
                        title={`${province.name} · ${statusText[province.status]}`}
                      >
                        {province.name}
                      </button>
                    )
                  })}
                </div>
                <div className="absolute bottom-4 right-4 z-10 max-w-xs rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs leading-5 text-slate-500 shadow-sm">
                  正式版本需使用自然资源部标准地图服务系统或天地图合规底图，并保留审图号；当前业务状态作为覆盖层，不修改行政边界。
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <SidePanel title="当前聚焦">
              <div className="flex items-start gap-3">
                <div className={`grid h-11 w-11 flex-none place-items-center rounded-lg border text-sm font-bold ${selectedProvince ? statusSoftClasses[selectedProvince.status] : 'border-blue-200 bg-blue-50 text-blue-700'}`}>
                  {selectedProvince ? statusText[selectedProvince.status] : '全国'}
                </div>
                <div>
                  <p className="text-base font-semibold text-slate-900">
                    {selectedProvince ? `${selectedProvince.name} · ${statusText[selectedProvince.status]}` : selectedRegion}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {selectedProvince
                      ? selectedProvince.desc
                      : selectedRegion === '全国'
                        ? '当前展示全国省份门店进度状态。颜色只表示正常、关注、落后，不展示数字。'
                        : `当前聚焦${selectedRegion}大区，可继续点击省份查看状态解释。`}
                  </p>
                </div>
              </div>
            </SidePanel>

            <SidePanel title="状态结构">
              <div className="space-y-3">
                {statusStack.map((item) => (
                  <div key={item.status} className="grid grid-cols-[52px_minmax(0,1fr)_44px] items-center gap-3 text-sm">
                    <span className="text-slate-600">{statusText[item.status]}</span>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${item.status === 'normal' ? 'bg-emerald-600' : item.status === 'watch' ? 'bg-amber-500' : 'bg-rose-600'}`} style={{ width: `${Math.max(8, item.ratio * 100)}%` }} />
                    </div>
                    <span className={`justify-self-end rounded-full border px-2 py-0.5 text-xs ${statusSoftClasses[item.status]}`}>
                      {statusText[item.status]}
                    </span>
                  </div>
                ))}
              </div>
            </SidePanel>

            <SidePanel title="重点关注">
              <div className="space-y-2">
                {focusRows.map((province) => (
                  <button
                    key={province.name}
                    type="button"
                    onClick={() => selectProvince(province)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-100 p-3 text-left transition-colors hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-900">{province.name}</span>
                      <span className="mt-1 block truncate text-xs text-slate-500">{province.regions.join(' / ') || province.region} · {province.action}</span>
                    </span>
                    <span className={`flex-none rounded-full border px-2 py-1 text-xs ${statusSoftClasses[province.status]}`}>
                      {statusText[province.status]}
                    </span>
                  </button>
                ))}
              </div>
            </SidePanel>

            <SidePanel title="下钻动作">
              <div className="space-y-2">
                <Link to={`/funnel-target-analysis?province=${encodeURIComponent(selectedProvince?.name || '')}&status=lag`} className="flex h-10 items-center justify-between rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
                  查看落后省份门店
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/funnel-target-analysis" className="flex h-10 items-center justify-between rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
                  进入漏斗目标达成
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/funnel-target-analysis?diagnosis=lead_supply" className="flex h-10 items-center justify-between rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
                  分析线索供给不足
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </SidePanel>
          </aside>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <NoteCard title="大盘承担什么" text="负责快速看趋势、看空间分布、判断哪里需要关注，不负责展开所有经营明细。" />
          <NoteCard title="漏斗页承担什么" text="负责解释原因，包括线索供给、有效线索、到店率、车型、渠道和门店责任。" />
          <NoteCard title="地图合规要求" text="正式上线必须接入合规标准地图底图，保留审图号，业务状态仅作为覆盖层展示。" />
        </section>
      </main>
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, hint, tone }: { icon: React.ElementType; label: string; value: string; hint: string; tone: 'blue' | 'emerald' | 'amber' | 'violet' }) {
  const toneClass = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
  }[tone]

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-2 truncate text-2xl font-bold text-slate-900">{value}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{hint}</p>
        </div>
        <div className={`grid h-11 w-11 flex-none place-items-center rounded-lg ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

function SidePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-slate-900">{title}</h3>
      {children}
    </div>
  )
}

function GuideRow({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="font-semibold text-slate-900">{title}</p>
      <p className="mt-1 leading-6">{text}</p>
    </div>
  )
}

function NoteCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <Layers3 className="h-4 w-4 text-primary-600" />
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      <p className="text-sm leading-6 text-slate-600">{text}</p>
    </div>
  )
}

function LegendPill({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

function MonthTrendTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: MonthTrendRow }>; label?: string }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const momPrefix = row.mom > 0 ? '+' : ''

  return (
    <div className="min-w-[230px] rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-xl">
      <p className="mb-2 text-sm font-semibold text-slate-900">{label}</p>
      <TooltipRow label="当日进店数" value={formatInt(row.visits)} />
      <TooltipRow label="月累计到店数" value={formatInt(row.cumulative)} />
      <TooltipRow label="月到店数进度" value={`${formatDecimal2(row.progress)}%`} />
      <TooltipRow label="上月同期进店数" value={formatInt(row.lastMonth)} />
      <TooltipRow label="与上月同期环比" value={`${momPrefix}${formatDecimal(row.mom)}%`} valueClassName={row.mom >= 0 ? 'text-emerald-600' : 'text-rose-600'} />
      <div className="my-2 border-t border-slate-100" />
      <TooltipRow label="7日均线" value={formatInt(row.ma7)} />
      <TooltipRow label="15日均线" value={formatInt(row.ma15)} />
    </div>
  )
}

function TooltipRow({ label, value, valueClassName = 'text-slate-900' }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex items-center justify-between gap-5 py-0.5 text-slate-500">
      <span>{label}</span>
      <strong className={valueClassName}>{value}</strong>
    </div>
  )
}

function ChinaMapPlaceholder() {
  return (
    <svg className="absolute inset-0 h-full w-full opacity-80" viewBox="0 0 1000 620" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="mapFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#eff6ff" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
      </defs>
      <rect width="1000" height="620" fill="#f8fafc" />
      <path
        d="M155 195 L235 115 L390 105 L495 148 L632 106 L735 162 L810 260 L748 350 L790 420 L675 500 L560 468 L455 540 L340 505 L250 430 L150 390 L110 292 Z"
        fill="url(#mapFill)"
        stroke="#cbd5e1"
        strokeWidth="2"
      />
      <path d="M238 168 L348 230 L455 205 L560 272 L665 226" fill="none" stroke="#cbd5e1" strokeDasharray="8 8" />
      <path d="M270 390 L420 338 L565 370 L720 332" fill="none" stroke="#cbd5e1" strokeDasharray="8 8" />
      <path d="M415 115 L382 258 L420 380 L382 506" fill="none" stroke="#cbd5e1" strokeDasharray="8 8" />
      <path d="M595 135 L610 265 L580 405 L640 490" fill="none" stroke="#cbd5e1" strokeDasharray="8 8" />
      <circle cx="742" cy="535" r="18" fill="#e2e8f0" stroke="#cbd5e1" />
      <text x="500" y="318" textAnchor="middle" fill="#64748b" fontSize="26" fontWeight="700">
        标准中国地图底图区
      </text>
      <text x="500" y="350" textAnchor="middle" fill="#94a3b8" fontSize="15">
        正式版本替换为合规标准地图服务，当前仅展示业务状态覆盖层交互
      </text>
    </svg>
  )
}

function normalizeTrendRow(row: Partial<MonthTrendRow>, index: number): MonthTrendRow {
  return {
    label: String(row.label || index + 1),
    day: Number(row.day || index + 1),
    visits: Number(row.visits || 0),
    target: Number(row.target || 0),
    lastMonth: Number(row.lastMonth || 0),
    cumulative: Number(row.cumulative || 0),
    progress: Number(row.progress || 0),
    mom: Number(row.mom || 0),
    ma7: Number(row.ma7 || 0),
    ma15: Number(row.ma15 || 0),
  }
}

function mergeProvinceStatus(base: ProvincePoint[], liveRows: VisitTrendOverview['provinces']): ProvincePoint[] {
  if (!liveRows?.length) return base
  const liveByName = new Map(liveRows.map((item) => [item.name, item]))
  return base.map((province) => {
    const live = liveByName.get(province.name)
    if (!live) return province
    return {
      ...province,
      status: live.status || province.status,
      desc: live.desc || province.desc,
      region: live.regions?.[0] || live.region || province.region,
      regions: live.regions?.length ? live.regions : live.region ? [live.region] : province.regions,
      action: live.status === 'lag' ? '进入漏斗诊断' : live.status === 'watch' ? '关注近 7 日' : province.action,
    }
  })
}

function createMonthTrend(): MonthTrendRow[] {
  const targetDaily = 118
  let cumulative = 0
  const rows: MonthTrendRow[] = []

  for (let day = 1; day <= 22; day += 1) {
    const visits = Math.max(62, Math.round(118 + Math.sin(day * 0.64) * 22 + Math.cos(day * 0.23) * 14 + (day > 15 ? -10 : 0)))
    const lastMonth = Math.max(58, Math.round(112 + Math.sin((day + 2) * 0.58) * 18 + Math.cos(day * 0.27) * 10 + (day > 12 ? 5 : 0)))
    cumulative += visits
    rows.push({
      label: `5/${day}`,
      day,
      visits,
      target: targetDaily,
      lastMonth,
      cumulative,
      progress: Math.round((cumulative / (targetDaily * 31)) * 100),
      mom: Math.round(((visits - lastMonth) / Math.max(1, lastMonth)) * 100),
      ma7: 0,
      ma15: 0,
    })
  }

  return rows.map((row, index) => ({
    ...row,
    ma7: movingAverage(rows, 'visits', 7, index),
    ma15: movingAverage(rows, 'visits', 15, index),
  }))
}

function movingAverage(rows: MonthTrendRow[], key: 'visits', windowSize: number, index: number) {
  const start = Math.max(0, index - windowSize + 1)
  const slice = rows.slice(start, index + 1)
  return Math.round(slice.reduce((sum, row) => sum + row[key], 0) / slice.length)
}

function formatInt(value: number) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })
}

function formatDecimal(value: number) {
  return Number(value || 0).toFixed(1)
}

function formatDecimal2(value: number) {
  return Number(value || 0).toFixed(2)
}

function getCurrentYearMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatYearMonthLabel(value: string) {
  const [year, month] = value.split('-')
  if (!year || !month) return value
  return `${year}年${month}月`
}

const statusWeight: Record<ProvinceStatus, number> = {
  normal: 0,
  watch: 1,
  lag: 2,
}
