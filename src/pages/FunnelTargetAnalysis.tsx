import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, RefreshCw, Save, Search, Settings2, Upload } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useFunnelData } from '@/hooks/useApi'

const fmtInt = (value: any) => Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })
const fmtRate = (value: any) => `${Number(value || 0).toFixed(1)}%`
const currentMonth = () => new Date().toISOString().slice(0, 7)

export default function FunnelTargetAnalysis() {
  const { hasPermission } = useAuth()
  const [filters, setFilters] = useState({
    year_month: currentMonth(),
    region: '',
    zone: '',
    dealer_search: '',
    model_name: '',
    channel_2: '',
    channel_3: '',
    lead_ops_owner: '',
    lead_ops_support: '',
  })
  const [activeDealerModel, setActiveDealerModel] = useState<{ dealer_id: string; model_name: string } | null>(null)
  const [activeView, setActiveView] = useState<'dashboard' | 'detail' | 'config'>('dashboard')
  const [dashboardLevel, setDashboardLevel] = useState<'region' | 'zone'>('region')
  const [dashboardStatus, setDashboardStatus] = useState('')
  const [diagnosisTag, setDiagnosisTag] = useState('')
  const [configMessage, setConfigMessage] = useState('')

  const dealerModels = useFunnelData('dealer-models', { ...filters, page_size: 100 })
  const orgDealers = useFunnelData('org-dealers', { ...filters, progress_status: dashboardStatus, diagnosis_tag: diagnosisTag })
  const channels = useFunnelData('channels', { ...filters, dealer_search: activeDealerModel?.dealer_id || filters.dealer_search, model_name: activeDealerModel?.model_name || filters.model_name })
  const overview = useFunnelData('home-summary', { year_month: filters.year_month })
  const dashboardSummary = useFunnelData('dashboard-summary', filters)
  const dashboardRegions = useFunnelData('dashboard-regions', { ...filters, level: dashboardLevel })
  const salesTargets = useFunnelData('config/sales-targets', { year_month: filters.year_month })
  const conversionRates = useFunnelData('config/conversion-rates', { year_month: filters.year_month })
  const modelSources = useFunnelData('config/model-source-values', { year_month: filters.year_month })
  const modelMappings = useFunnelData('config/model-mappings', { year_month: filters.year_month })
  const filterOptions = useFunnelData('filter-options', { year_month: filters.year_month, region: filters.region })

  const rows = dealerModels.data?.data || []
  const orgRows = orgDealers.data?.data || []
  const channelRows = channels.data?.data || []
  const summary = overview.data?.data
  const dashboard = dashboardSummary.data?.data
  const regionRows = dashboardRegions.data?.data || []
  const targetSummary = salesTargets.data?.summary
  const rateRows = conversionRates.data?.data || []
  const modelSourceRows = modelSources.data?.data || []
  const modelSourceSummary = modelSources.data?.summary || []
  const savedMappings = (modelMappings.data?.data || []).filter((row: any) => row.is_active !== false)
  const options = filterOptions.data?.data || {}
  const ownerOptions = options.lead_ops_owner_options || (options.lead_ops_owners || []).map((name: string) => ({ name, dealer_count: 0 }))
  const localZoneOptions = filters.region
    ? Array.from(new Set(
      (options.dealers || [])
        .filter((dealer: any) => dealer.region === filters.region && dealer.zone)
        .map((dealer: any) => dealer.zone)
    )).sort()
    : []
  const zoneOptions = localZoneOptions.length > 0 ? localZoneOptions : (options.zones || [])

  const channelTitle = activeDealerModel
    ? `${activeDealerModel.dealer_id} / ${activeDealerModel.model_name}`
    : '当前筛选'

  const recompute = async () => {
    setConfigMessage('正在重算...')
    try {
      await apiFetch('/api/funnel-target/recompute', {
        method: 'POST',
        body: JSON.stringify({ year_month: filters.year_month }),
      })
      setConfigMessage('重算完成')
    } catch (e: any) {
      setConfigMessage(e.message || '重算失败')
    }
    dealerModels.refetch()
    orgDealers.refetch()
    channels.refetch()
    overview.refetch()
    dashboardSummary.refetch()
    dashboardRegions.refetch()
    salesTargets.refetch()
    conversionRates.refetch()
    modelSources.refetch()
    modelMappings.refetch()
    filterOptions.refetch()
  }

  const canManage = hasPermission('funnel_target.config.manage')

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">线上线索漏斗目标达成</h1>
              <p className="text-xs text-slate-500">当月累计 · 区域负责人驾驶舱</p>
            </div>
          </div>
          {canManage && (
            <button onClick={recompute} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm">
              <RefreshCw className="w-4 h-4" /> 重算
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <section className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <Input label="月份" type="month" value={filters.year_month} onChange={(v) => setFilters({ ...filters, year_month: v })} />
            <Select label="大区" value={filters.region} options={options.regions || []} onChange={(v) => setFilters({ ...filters, region: v, zone: '' })} />
            <Select label="战区" value={filters.zone} options={zoneOptions} onChange={(v) => setFilters({ ...filters, zone: v })} />
            <DealerSearch
              label="门店"
              value={filters.dealer_search}
              dealers={options.dealers || []}
              onChange={(v) => setFilters({ ...filters, dealer_search: v })}
            />
            <Input label="车型" value={filters.model_name} onChange={(v) => setFilters({ ...filters, model_name: v })} />
            <Select label="二级渠道" value={filters.channel_2} options={options.channel_2 || []} onChange={(v) => setFilters({ ...filters, channel_2: v })} />
            <Select label="三级渠道" value={filters.channel_3} options={options.channel_3 || []} onChange={(v) => setFilters({ ...filters, channel_3: v })} />
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={() => { dealerModels.refetch(); orgDealers.refetch(); channels.refetch(); overview.refetch(); dashboardSummary.refetch(); dashboardRegions.refetch(); salesTargets.refetch(); conversionRates.refetch(); modelSources.refetch(); modelMappings.refetch(); filterOptions.refetch() }} className="inline-flex items-center gap-2 px-3 py-2 bg-primary-600 text-white rounded-lg text-sm">
              <Search className="w-4 h-4" /> 查询
            </button>
            {canManage && (
              <button
                onClick={() => setActiveView('config')}
                className="inline-flex items-center gap-2 px-3 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm"
              >
                <Settings2 className="w-4 h-4" />
                车型映射配置
                <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{savedMappings.length}</span>
              </button>
            )}
            {canManage && <ConfigQuickPanel yearMonth={filters.year_month} rateRows={rateRows} onDone={async () => { setConfigMessage('配置已保存'); await recompute() }} />}
            {configMessage && <span className="text-sm text-slate-500">{configMessage}</span>}
          </div>
        </section>

        <ViewTabs activeView={activeView} onChange={setActiveView} />

        {activeView === 'dashboard' && (
          <DashboardView
            dashboard={dashboard}
            regionRows={regionRows}
            orgRows={orgRows}
            ownerOptions={ownerOptions}
            selectedOwner={filters.lead_ops_owner}
            level={dashboardLevel}
            status={dashboardStatus}
            diagnosisTag={diagnosisTag}
            onOwnerChange={(owner) => {
              setFilters({ ...filters, lead_ops_owner: owner, region: '', zone: '', dealer_search: '' })
              setDashboardStatus('')
              setDiagnosisTag('')
            }}
            onLevelChange={setDashboardLevel}
            onStatusChange={(status) => { setDashboardStatus(status); setDiagnosisTag('') }}
            onDiagnosisChange={(tag) => { setDiagnosisTag(tag); setDashboardStatus('') }}
            onRegionClick={(row) => {
              if (dashboardLevel === 'zone') {
                setFilters({ ...filters, zone: row.name === '未归属' ? '' : row.name })
              } else {
                setFilters({ ...filters, region: row.name === '未归属' ? '' : row.name, zone: '' })
              }
            }}
            onViewModels={(row) => {
              setFilters({ ...filters, dealer_search: row.dealer_id })
              setActiveView('detail')
            }}
            onViewChannels={(row) => {
              setFilters({ ...filters, dealer_search: row.dealer_id })
              setActiveDealerModel({ dealer_id: row.dealer_id, model_name: '' })
              setActiveView('detail')
            }}
          />
        )}

        {activeView === 'detail' && (
          <>
            <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <SummaryCard label="当月到店数" value={fmtInt(summary?.visit_count)} />
              <SummaryCard label="全国目标达成率" value={fmtRate(summary?.visit_achievement_rate)} />
              <SummaryCard label="时间进度" value={fmtRate(Number(summary?.elapsed_day_ratio || 0) * 100)} />
              <SummaryCard label="数据进度" value={fmtRate(Number(summary?.data_progress_ratio || 0) * 100)} />
              <SummaryCard label="到店目标缺口" value={fmtInt(summary?.visit_gap)} danger={Number(summary?.visit_gap || 0) < 0} />
            </section>
            <TableSection title="门店 x 车型" subtitle="定位哪家门店的哪个车型造成缺口">
              <DataTable rows={rows} columns={dealerModelColumns} onRowClick={(row) => setActiveDealerModel({ dealer_id: row.dealer_id, model_name: row.model_name })} />
            </TableSection>
            <TableSection title={`门店 x 车型 x 渠道：${channelTitle}`} subtitle="判断线索量、有效率、到店转化或成交转化问题">
              <DataTable rows={channelRows} columns={channelColumns} />
            </TableSection>
          </>
        )}

        {activeView === 'config' && (
          <>
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <h2 className="font-semibold text-slate-900">成交目标配置</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
                  <MiniStat label="目标门店" value={fmtInt(targetSummary?.dealer_count)} />
                  <MiniStat label="车型目标行" value={fmtInt(targetSummary?.row_count)} />
                  <MiniStat label="成交目标合计" value={fmtInt(targetSummary?.sales_target_sum)} />
                  <MiniStat label="最近更新" value={targetSummary?.latest_updated_at ? new Date(targetSummary.latest_updated_at).toLocaleString('zh-CN') : '-'} />
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <h2 className="font-semibold text-slate-900">转化率配置</h2>
                <div className="mt-3 max-h-28 overflow-auto text-sm">
                  {rateRows.length === 0 ? (
                    <p className="text-slate-500">暂无配置，默认不计算成交倒推到店。</p>
                  ) : rateRows.map((row: any, index: number) => (
                    <div key={index} className="flex items-center justify-between py-1 border-b border-slate-100 last:border-0">
                      <span className="text-slate-600">{row.scope_type === 'model' ? row.model_name : '全国统一'}</span>
                      <span className="font-medium text-slate-900">{fmtRate(Number(row.conversion_rate || 0) * 100)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
            <ModelMappingPanel
              yearMonth={filters.year_month}
              rows={modelSourceRows}
              summary={modelSourceSummary}
              savedMappings={savedMappings}
              onDone={() => { modelSources.refetch(); modelMappings.refetch(); salesTargets.refetch(); conversionRates.refetch(); dealerModels.refetch(); orgDealers.refetch(); channels.refetch(); overview.refetch(); dashboardSummary.refetch(); dashboardRegions.refetch() }}
            />
          </>
        )}
      </main>
    </div>
  )
}

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
    </label>
  )
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
        <option value="">全部</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  )
}

function DealerSearch({ label, value, dealers, onChange }: { label: string; value: string; dealers: any[]; onChange: (value: string) => void }) {
  const options = dealers
    .filter((dealer) => {
      if (!value.trim()) return true
      const keyword = value.trim().toLowerCase()
      return String(dealer.dealer_id || '').toLowerCase().includes(keyword) || String(dealer.dealer_name || '').toLowerCase().includes(keyword)
    })
    .slice(0, 80)

  return (
    <label className="block">
      <span className="text-xs text-slate-500">{label}</span>
      <input
        list="funnel-dealer-options"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="编码或名称"
        className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
      />
      <datalist id="funnel-dealer-options">
        {options.map((dealer) => (
          <option key={dealer.dealer_id} value={dealer.dealer_id}>{dealer.dealer_name}</option>
        ))}
      </datalist>
    </label>
  )
}

function ViewTabs({ activeView, onChange }: { activeView: 'dashboard' | 'detail' | 'config'; onChange: (value: 'dashboard' | 'detail' | 'config') => void }) {
  const tabs = [
    { key: 'dashboard', label: '驾驶舱' },
    { key: 'detail', label: '明细分析' },
    { key: 'config', label: '配置中心' },
  ] as const
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${activeView === tab.key ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

function DashboardView({
  dashboard,
  regionRows,
  orgRows,
  ownerOptions,
  selectedOwner,
  level,
  status,
  diagnosisTag,
  onOwnerChange,
  onLevelChange,
  onStatusChange,
  onDiagnosisChange,
  onRegionClick,
  onViewModels,
  onViewChannels,
}: {
  dashboard: any;
  regionRows: any[];
  orgRows: any[];
  ownerOptions: any[];
  selectedOwner: string;
  level: 'region' | 'zone';
  status: string;
  diagnosisTag: string;
  onOwnerChange: (value: string) => void;
  onLevelChange: (value: 'region' | 'zone') => void;
  onStatusChange: (value: string) => void;
  onDiagnosisChange: (value: string) => void;
  onRegionClick: (row: any) => void;
  onViewModels: (row: any) => void;
  onViewChannels: (row: any) => void;
}) {
  const totalStatus = (dashboard?.status_counts || []).reduce((sum: number, row: any) => sum + Number(row.count || 0), 0)
  const selectedLabel = status ? `状态：${status}` : diagnosisTag ? `诊断：${diagnosisTag}` : '全部门店'

  return (
    <div className="space-y-6">
      <OwnerTabs owners={ownerOptions} selectedOwner={selectedOwner} totalDealers={dashboard?.dealer_count} onChange={onOwnerChange} />

      <section className="grid grid-cols-2 lg:grid-cols-7 gap-4">
        <button onClick={() => onStatusChange('')} className="text-left"><SummaryCard label="管理门店数" value={fmtInt(dashboard?.dealer_count)} /></button>
        <button onClick={() => onStatusChange('')} className="text-left"><SummaryCard label="当月到店数" value={fmtInt(dashboard?.visit_count)} /></button>
        <button onClick={() => onStatusChange('轻度落后')} className="text-left"><SummaryCard label="到店目标达成率" value={fmtRate(dashboard?.visit_achievement_rate)} danger={Number(dashboard?.visit_gap || 0) < 0} /></button>
        <button onClick={() => onStatusChange('轻度落后')} className="text-left"><SummaryCard label="倒推达成率" value={fmtRate(dashboard?.derived_achievement_rate)} /></button>
        <button onClick={() => onStatusChange('轻度落后')} className="text-left"><SummaryCard label="轻度落后门店" value={fmtInt((dashboard?.status_counts || []).find((row: any) => row.status === '轻度落后')?.count)} /></button>
        <button onClick={() => onStatusChange('严重落后')} className="text-left"><SummaryCard label="严重落后门店" value={fmtInt((dashboard?.status_counts || []).find((row: any) => row.status === '严重落后')?.count)} danger /></button>
        <button onClick={() => onStatusChange('配置异常')} className="text-left"><SummaryCard label="配置异常门店" value={fmtInt((dashboard?.status_counts || []).find((row: any) => row.status === '配置异常')?.count)} /></button>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">门店进度状态</h2>
            <p className="text-xs text-slate-500 mt-1">数据进度 {fmtRate(Number(dashboard?.data_progress_ratio || 0) * 100)}，最新线索日期 {dashboard?.latest_lead_date || '-'}</p>
          </div>
          <div className="text-sm text-slate-500">当前列表：{selectedLabel}</div>
        </div>
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-5 gap-2">
          {(dashboard?.status_counts || []).map((row: any) => {
            const pct = totalStatus ? Number(row.count || 0) * 100 / totalStatus : 0
            return (
              <button key={row.status} onClick={() => onStatusChange(row.status)} className={`rounded-lg border px-3 py-3 text-left ${status === row.status ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                <div className="flex items-center justify-between text-sm font-medium">
                  <span>{row.status}</span>
                  <span>{fmtInt(row.count)}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-white/70 overflow-hidden">
                  <div className="h-full rounded-full bg-cyan-500" style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => { onStatusChange(''); onDiagnosisChange('') }} className="px-3 py-1.5 rounded-full border border-slate-200 text-xs text-slate-600">全部门店</button>
          {(dashboard?.diagnosis_counts || []).slice(0, 8).map((row: any) => (
            <button key={row.tag} onClick={() => onDiagnosisChange(row.tag)} className={`px-3 py-1.5 rounded-full border text-xs ${diagnosisTag === row.tag ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-600'}`}>
              {row.tag} {fmtInt(row.count)}
            </button>
          ))}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">{level === 'region' ? '大区进度汇总' : '战区进度汇总'}</h2>
            <p className="text-xs text-slate-500 mt-1">点击大区或战区后，同页刷新下方门店列表</p>
          </div>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <button onClick={() => onLevelChange('region')} className={`px-3 py-1.5 text-sm ${level === 'region' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`}>大区</button>
            <button onClick={() => onLevelChange('zone')} className={`px-3 py-1.5 text-sm ${level === 'zone' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`}>战区</button>
          </div>
        </div>
        <DataTable rows={regionRows} columns={regionSummaryColumns} onRowClick={onRegionClick} />
      </section>

      <TableSection title="大区 x 门店" subtitle="承接状态卡、大区、战区和诊断标签的同页联动结果">
        <DataTable rows={orgRows} columns={dealerDashboardColumns(onViewModels, onViewChannels)} />
      </TableSection>
    </div>
  )
}

function OwnerTabs({ owners, selectedOwner, totalDealers, onChange }: { owners: any[]; selectedOwner: string; totalDealers: any; onChange: (value: string) => void }) {
  const topOwners = owners.slice(0, 8)
  const moreOwners = owners.slice(8)
  const selectedInMore = selectedOwner && !topOwners.some((owner) => owner.name === selectedOwner)

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">负责人视角</h2>
          <p className="text-xs text-slate-500 mt-1">切换后，驾驶舱总数据、状态分布、大区/战区汇总和门店列表都会按负责人范围刷新。</p>
        </div>
        {selectedOwner && (
          <button onClick={() => onChange('')} className="text-sm text-slate-500 hover:text-slate-900">
            清除负责人
          </button>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange('')}
          className={`rounded-full px-3 py-2 text-sm font-medium ${!selectedOwner ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
        >
          全部 {fmtInt(totalDealers)}
        </button>
        {topOwners.map((owner) => (
          <button
            key={owner.name}
            type="button"
            onClick={() => onChange(owner.name)}
            className={`rounded-full px-3 py-2 text-sm font-medium ${selectedOwner === owner.name ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            {owner.name} {owner.dealer_count ? fmtInt(owner.dealer_count) : ''}
          </button>
        ))}
        {moreOwners.length > 0 && (
          <select
            value={selectedInMore ? selectedOwner : ''}
            onChange={(event) => onChange(event.target.value)}
            className={`rounded-full border px-3 py-2 text-sm ${selectedInMore ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'}`}
          >
            <option value="">更多负责人</option>
            {moreOwners.map((owner) => (
              <option key={owner.name} value={owner.name}>{owner.name} {owner.dealer_count ? `(${owner.dealer_count})` : ''}</option>
            ))}
          </select>
        )}
      </div>
    </section>
  )
}

function SummaryCard({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`text-2xl font-bold mt-2 ${danger ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-900 truncate">{value}</p>
    </div>
  )
}

function ModelMappingPanel({ yearMonth, rows, summary, savedMappings, onDone }: { yearMonth: string; rows: any[]; summary: any[]; savedMappings: any[]; onDone: () => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const mappedSummary = summary.find((row: any) => row.mapping_status === '已映射')
  const unmappedSummary = summary.find((row: any) => row.mapping_status === '未映射')
  const mappedMetric = Number(mappedSummary?.metric_count || 0)
  const unmappedMetric = Number(unmappedSummary?.metric_count || 0)

  const scan = async () => {
    setBusy(true)
    setMessage('正在扫描源车型...')
    try {
      await apiFetch('/api/funnel-target/config/model-source-values/scan', {
        method: 'POST',
        body: JSON.stringify({ year_month: yearMonth }),
      })
      setMessage('扫描完成')
      onDone()
    } catch (e: any) {
      setMessage(e.message || '扫描失败')
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    const mappings = rows
      .map((row) => {
        const currentValue = (draft[rowKey(row)] ?? row.standard_model_name ?? '').trim()
        return {
          ...row,
          standard_model_name: currentValue,
          target_enabled: row.source_type === '成交目标',
          __changed: currentValue && currentValue !== String(row.standard_model_name || '').trim(),
        }
      })
      .filter((row) => row.__changed)
    if (mappings.length === 0) {
      setMessage('请先填写至少一个标准车型')
      return
    }
    setBusy(true)
    setMessage('正在保存映射并重算...')
    try {
      await apiFetch('/api/funnel-target/config/model-mappings', {
        method: 'POST',
        body: JSON.stringify({ year_month: yearMonth, mappings }),
      })
      await apiFetch('/api/funnel-target/recompute', {
        method: 'POST',
        body: JSON.stringify({ year_month: yearMonth }),
      })
      setDraft({})
      setMessage('映射已保存，重算完成')
      onDone()
    } catch (e: any) {
      setMessage(e.message || '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section id="model-mapping-config" className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">车型映射配置</h2>
          <p className="text-xs text-slate-500 mt-1">源车型 {fmtInt(rows.length)} 个，已映射 {fmtInt(mappedSummary?.source_value_count || savedMappings.length)} 个，未映射 {fmtInt(unmappedSummary?.source_value_count || 0)} 个，影响指标量 {fmtInt(unmappedMetric)}</p>
          {message && <p className="text-xs text-slate-600 mt-1">{message}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={scan} disabled={busy} className="inline-flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:opacity-50">
            <RefreshCw className="w-4 h-4" /> 扫描源车型
          </button>
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-lg text-sm disabled:opacity-50">
            <Save className="w-4 h-4" /> 保存映射并重算
          </button>
        </div>
      </div>
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>已完成映射</span>
          <span className="text-slate-400">这里展示已保存的映射关系</span>
        </div>
        <div className="mt-3 overflow-auto max-h-44 rounded-lg border border-emerald-100 bg-white">
          {savedMappings.length === 0 ? (
            <div className="px-3 py-6 text-xs text-slate-500">暂无已完成映射</div>
          ) : (
            <table className="min-w-full text-xs">
              <thead className="bg-emerald-50 sticky top-0 z-10">
                <tr>
                  {['来源', '来源字段', '原始车型值', '标准车型', '更新时间'].map((label) => (
                    <th key={label} className="px-3 py-2 text-left font-medium text-emerald-700 whitespace-nowrap">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-50">
                {savedMappings.slice(0, 40).map((row) => (
                  <tr key={rowKey(row)} className="bg-white">
                    <td className="px-3 py-2 whitespace-nowrap text-slate-700">{row.source_table}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-700">{row.source_field}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-900">{row.source_model_code}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-medium text-emerald-700">{row.standard_model_name}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">{row.updated_at ? new Date(row.updated_at).toLocaleString('zh-CN') : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div className="overflow-auto max-h-80">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 sticky top-0 z-10">
            <tr>
              {['状态', '来源', '来源字段', '原始车型值', '影响门店', '指标量', '标准车型'].map((label) => (
                <th key={label} className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">暂无源车型数据</td></tr>
            )}
            {rows.slice(0, 120).map((row) => (
              <tr key={rowKey(row)} className="hover:bg-slate-50">
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${row.mapping_status === '已映射' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {row.mapping_status}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{row.source_type}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.source_field}</td>
                <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-900">{row.source_model_value}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtInt(row.dealer_count)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtInt(row.metric_count)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <input
                    value={draft[rowKey(row)] ?? row.standard_model_name ?? ''}
                    onChange={(e) => setDraft({ ...draft, [rowKey(row)]: e.target.value })}
                    placeholder="如 AION i60"
                    className="border border-slate-300 rounded-lg px-2 py-1 text-sm w-36"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function rowKey(row: any) {
  return `${row.source_type}|${row.source_field}|${row.source_model_value}`
}

function TableSection({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
      </div>
      {children}
    </section>
  )
}

function DataTable({ rows, columns, onRowClick }: { rows: any[]; columns: any[]; onRowClick?: (row: any) => void }) {
  return (
    <div className="overflow-auto max-h-[520px]">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 sticky top-0 z-10">
          <tr>
            {columns.map((col) => <th key={col.key} className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">{col.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-slate-500">暂无数据，请确认目标配置或点击重算</td></tr>
          )}
          {rows.map((row, index) => (
            <tr key={index} onClick={() => onRowClick?.(row)} className={onRowClick ? 'hover:bg-cyan-50 cursor-pointer' : 'hover:bg-slate-50'}>
              {columns.map((col) => <td key={col.key} className="px-3 py-2 whitespace-nowrap text-slate-700">{col.render ? col.render(row[col.key], row) : row[col.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ConfigQuickPanel({ yearMonth, rateRows, onDone }: { yearMonth: string; rateRows: any[]; onDone: () => void | Promise<void> }) {
  const [visitTarget, setVisitTarget] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [rateOpen, setRateOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const save = async () => {
    setBusy(true)
    setErrorMsg('')
    try {
      if (visitTarget) {
        await apiFetch('/api/funnel-target/config/visit-targets', { method: 'POST', body: JSON.stringify({ year_month: yearMonth, national_visit_target: Number(visitTarget) }) })
      }
      if (file) {
        const form = new FormData()
        form.append('year_month', yearMonth)
        form.append('file', file)
        const response = await fetch('/api/funnel-target/config/sales-targets/import', { method: 'POST', body: form, credentials: 'same-origin' })
        const result = await response.json()
        if (!response.ok || result?.success === false) {
          throw new Error(result?.message || '目标表导入失败')
        }
      }
      setFile(null)
      setVisitTarget('')
      await onDone()
    } catch (e: any) {
      setErrorMsg(e.message || '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex flex-wrap items-end gap-2">
      <input placeholder="全国到店目标" value={visitTarget} onChange={(e) => setVisitTarget(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-32" />
      <button
        type="button"
        onClick={() => setRateOpen(!rateOpen)}
        className="inline-flex items-center gap-2 px-3 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm bg-white"
      >
        <Settings2 className="w-4 h-4" />
        转化率配置
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{rateRows.length}</span>
      </button>
      <label className="inline-flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-sm cursor-pointer">
        <Upload className="w-4 h-4" />
        目标表
        <input type="file" accept=".xlsx" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </label>
      {errorMsg && <span className="text-xs text-red-600">{errorMsg}</span>}
      <button onClick={save} disabled={busy} className="px-3 py-2 bg-slate-900 text-white rounded-lg text-sm disabled:opacity-50">{busy ? '保存中' : '保存配置'}</button>
      {rateOpen && (
        <ConversionRatePopover
          yearMonth={yearMonth}
          rateRows={rateRows}
          onClose={() => setRateOpen(false)}
          onDone={onDone}
        />
      )}
    </div>
  )
}

function ConversionRatePopover({ yearMonth, rateRows, onClose, onDone }: { yearMonth: string; rateRows: any[]; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [modelName, setModelName] = useState('')
  const [rate, setRate] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!rate) return
    setSaving(true)
    try {
      await apiFetch('/api/funnel-target/config/conversion-rates', {
        method: 'POST',
        body: JSON.stringify({
          year_month: yearMonth,
          scope_type: modelName.trim() ? 'model' : 'national',
          model_name: modelName.trim(),
          conversion_rate: Number(rate),
        }),
      })
      setRate('')
      setModelName('')
      await onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="absolute right-0 top-11 z-30 w-[420px] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h3 className="font-semibold text-slate-900">成交倒推转化率</h3>
          <p className="mt-0.5 text-xs text-slate-500">留空车型表示全国统一；填写车型表示该车型单独覆盖。</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100">关闭</button>
      </div>
      <div className="space-y-4 p-4">
        <div>
          <div className="mb-2 text-xs font-medium text-slate-500">已保存配置</div>
          <div className="max-h-40 overflow-auto rounded-lg border border-slate-200">
            {rateRows.length === 0 ? (
              <div className="px-3 py-5 text-center text-sm text-slate-500">暂无配置，保存后会展示在这里。</div>
            ) : rateRows.map((row: any, index: number) => (
              <div key={`${row.scope_type}-${row.model_name || 'national'}-${index}`} className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-sm last:border-0">
                <div>
                  <div className="font-medium text-slate-800">{row.scope_type === 'model' ? row.model_name : '全国统一'}</div>
                  <div className="text-xs text-slate-500">{row.updated_at ? new Date(row.updated_at).toLocaleString('zh-CN') : '未记录更新时间'}</div>
                </div>
                <div className="text-base font-semibold text-slate-900">{fmtRate(Number(row.conversion_rate || 0) * 100)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[1fr_120px_auto] gap-2">
          <input placeholder="适用车型，可空为全国" value={modelName} onChange={(e) => setModelName(e.target.value)} className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="如 0.12" value={rate} onChange={(e) => setRate(e.target.value)} className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button type="button" onClick={save} disabled={saving || !rate} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">
            {saving ? '保存中' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

const dealerModelColumns = [
  { key: 'region', label: '大区' },
  { key: 'zone', label: '战区' },
  { key: 'dealer_id', label: '门店编码' },
  { key: 'dealer_name', label: '门店' },
  { key: 'model_name', label: '车型' },
  { key: 'online_lead_count', label: '线上线索', render: fmtInt },
  { key: 'valid_lead_count', label: '有效线索', render: fmtInt },
  { key: 'visit_count', label: '到店数', render: fmtInt },
  { key: 'sales_count', label: '成交数', render: fmtInt },
  { key: 'sales_target', label: '成交目标', render: fmtInt },
  { key: 'applied_conversion_rate', label: '应用转化率', render: (value: any) => fmtRate(Number(value || 0) * 100) },
  { key: 'conversion_rate_source', label: '转化率来源' },
  { key: 'derived_visit_target_to_date', label: '倒推应达到店', render: fmtInt },
  { key: 'derived_visit_gap', label: '倒推缺口', render: fmtInt },
  { key: 'derived_achievement_rate', label: '倒推达成率', render: fmtRate },
  { key: 'status_label', label: '状态' },
]

const orgColumns = [
  { key: 'region', label: '大区' },
  { key: 'zone', label: '战区' },
  { key: 'dealer_id', label: '门店编码' },
  { key: 'dealer_name', label: '门店' },
  { key: 'lead_ops_owner', label: '区域负责人' },
  { key: 'lead_ops_support', label: '区域支持' },
  { key: 'online_lead_count', label: '线上线索', render: fmtInt },
  { key: 'visit_count', label: '到店数', render: fmtInt },
  { key: 'dealer_visit_target_to_date', label: '应达到店', render: fmtInt },
  { key: 'dealer_visit_gap', label: '缺口', render: fmtInt },
  { key: 'dealer_visit_achievement_rate', label: '达成率', render: fmtRate },
  { key: 'projected_month_end_visit', label: '预计月底', render: fmtInt },
  { key: 'status_label', label: '状态' },
]

const regionSummaryColumns = [
  { key: 'name', label: '组织' },
  { key: 'dealer_count', label: '门店数', render: fmtInt },
  { key: 'visit_count', label: '到店数', render: fmtInt },
  { key: 'visit_target_to_date', label: '应达到店', render: fmtInt },
  { key: 'visit_gap', label: '缺口', render: fmtInt },
  { key: 'visit_achievement_rate', label: '到店达成率', render: fmtRate },
  { key: 'derived_achievement_rate', label: '倒推达成率', render: fmtRate },
  { key: 'light_lagging_count', label: '轻度落后', render: fmtInt },
  { key: 'serious_lagging_count', label: '严重落后', render: fmtInt },
  { key: 'config_error_count', label: '配置异常', render: fmtInt },
]

function dealerDashboardColumns(onViewModels: (row: any) => void, onViewChannels: (row: any) => void) {
  return [
    { key: 'region', label: '大区' },
    { key: 'zone', label: '战区' },
    { key: 'dealer_id', label: '门店编码' },
    { key: 'dealer_name', label: '门店' },
    { key: 'lead_ops_owner', label: '区域负责人' },
    { key: 'lead_ops_support', label: '区域支持' },
    { key: 'online_lead_count', label: '线上线索', render: fmtInt },
    { key: 'valid_lead_count', label: '有效线索', render: fmtInt },
    { key: 'lead_valid_rate', label: '有效率', render: fmtRate },
    { key: 'visit_count', label: '到店数', render: fmtInt },
    { key: 'lead_visit_rate', label: '线索到店率', render: fmtRate },
    { key: 'dealer_visit_target_to_date', label: '应达到店', render: fmtInt },
    { key: 'dealer_visit_gap', label: '缺口', render: fmtInt },
    { key: 'dealer_visit_achievement_rate', label: '达成率', render: fmtRate },
    { key: 'derived_visit_target_to_date', label: '倒推应达到店', render: fmtInt },
    { key: 'derived_achievement_rate', label: '倒推达成率', render: fmtRate },
    { key: 'primary_diagnosis', label: '诊断' },
    { key: 'progress_status', label: '状态' },
    {
      key: 'actions',
      label: '操作',
      render: (_value: any, row: any) => (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onViewModels(row) }}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
          >
            查看车型
          </button>
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onViewChannels(row) }}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
          >
            查看渠道
          </button>
        </div>
      )
    },
  ]
}

const channelColumns = [
  { key: 'dealer_id', label: '门店编码' },
  { key: 'dealer_name', label: '门店' },
  { key: 'model_name', label: '车型' },
  { key: 'channel_2', label: '二级渠道' },
  { key: 'channel_3', label: '三级渠道' },
  { key: 'channel_4', label: '四级渠道' },
  { key: 'online_lead_count', label: '线上线索', render: fmtInt },
  { key: 'valid_lead_count', label: '有效线索', render: fmtInt },
  { key: 'lead_valid_rate', label: '有效率', render: fmtRate },
  { key: 'visit_record_count', label: '到店记录', render: fmtInt },
  { key: 'visit_count', label: '到店数', render: fmtInt },
  { key: 'lead_visit_rate', label: '线索到店率', render: fmtRate },
  { key: 'sales_count', label: '成交数', render: fmtInt },
  { key: 'visit_sales_rate', label: '到店成交率', render: fmtRate },
]
