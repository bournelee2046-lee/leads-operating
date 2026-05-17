import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Gauge, Target, TrendingUp } from 'lucide-react'
import { useFunnelHomeSummary } from '@/hooks/useApi'

const fmtInt = (value: any) => Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })
const fmtRate = (value: any) => `${Number(value || 0).toFixed(1)}%`

export default function FunnelHomeCard() {
  const { data, loading, error } = useFunnelHomeSummary()

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-8">
        <div className="h-24 animate-pulse bg-slate-100 rounded-xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white border border-amber-200 rounded-2xl p-6 mb-8">
        <div className="flex items-center gap-2 text-amber-700">
          <AlertTriangle className="w-5 h-5" />
          <span className="font-medium">线上线索漏斗目标达成暂不可用</span>
        </div>
        <p className="text-sm text-slate-500 mt-2">{error}</p>
      </div>
    )
  }

  return (
    <Link to="/funnel-target-analysis" className="block bg-white border border-slate-200 rounded-2xl p-6 mb-8 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-cyan-600 flex items-center justify-center">
              <Gauge className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">线上线索漏斗目标达成</h3>
              <p className="text-sm text-slate-500">当月累计 · {data?.year_month || '-'}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center text-primary-600 text-sm font-medium">
          进入分析 <ArrowRight className="w-4 h-4 ml-1" />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mt-6">
        <Metric icon={Target} label="当月到店数" value={fmtInt(data?.visit_count)} />
        <Metric icon={TrendingUp} label="到店目标达成率" value={fmtRate(data?.visit_achievement_rate)} />
        <Metric icon={Gauge} label="时间进度" value={fmtRate(Number(data?.elapsed_day_ratio || 0) * 100)} />
        <Metric icon={Gauge} label="数据进度" value={fmtRate(Number(data?.data_progress_ratio || 0) * 100)} />
        <Metric icon={AlertTriangle} label="到店目标缺口" value={fmtInt(data?.visit_gap)} danger={Number(data?.visit_gap || 0) < 0} />
        <Metric icon={TrendingUp} label="成交倒推达成率" value={fmtRate(data?.derived_achievement_rate)} />
      </div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4 text-sm">
        <div className="bg-slate-50 rounded-xl p-4">
          <p className="text-slate-500">全国到店目标</p>
          <p className="text-xl font-semibold text-slate-900 mt-1">{fmtInt(data?.national_visit_target)}</p>
          <p className="text-xs text-slate-400 mt-1">更新：{data?.visit_target_updated_at || '-'}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-4">
          <p className="text-slate-500">预计月底到店</p>
          <p className="text-xl font-semibold text-slate-900 mt-1">{fmtInt(data?.projected_month_end_visit)}</p>
          <p className="text-xs text-slate-400 mt-1">默认转化率：{data?.default_conversion_rate == null ? '-' : fmtRate(Number(data.default_conversion_rate) * 100)}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-4">
          <p className="text-slate-500">滞后大区</p>
          <p className="text-xl font-semibold text-slate-900 mt-1">{fmtInt(data?.lagging_region_count)}</p>
          <p className="text-xs text-slate-400 mt-1">
            {(data?.top_lagging_regions || []).map((r: any) => r.region).filter(Boolean).join('、') || '暂无'}
          </p>
        </div>
      </div>
    </Link>
  )
}

function Metric({ icon: Icon, label, value, danger = false }: { icon: any; label: string; value: string; danger?: boolean }) {
  return (
    <div className="border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-bold mt-2 ${danger ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}
