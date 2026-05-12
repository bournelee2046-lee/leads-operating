import React from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  LabelList
} from 'recharts'
import {
  Users,
  TrendingUp,
  Bell,
  ChevronRight,
  BarChart3,
  Activity,
  Building2,
  Calendar,
  Target,
  RefreshCw,
  AlertCircle,
  Database
} from 'lucide-react'
import { useDashboardData } from '../hooks/useApi'

const Home = () => {
  const { data, loading, error, refetch, refreshing, latestSyncTime, earliestDataTime, lastRefreshTime, period, switchPeriod } = useDashboardData()

  // 格式化同步时间显示
  const formatSyncTime = (timeStr: string | null) => {
    if (!timeStr) return "-";
    try {
      const date = new Date(timeStr.replace(" ", "T"));
      return date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    } catch {
      return timeStr;
    }
  };

  const formatLastRefresh = (date: Date | null) => {
    if (!date) return "-";
    return date.toLocaleTimeString("zh-CN");
  };

  // 模拟数据作为后备
  const fallbackKpi = [
    { label: '年度总线索量', value: '0' },
    { label: '年度总到店量', value: '-' },
    { label: '月度总线索量', value: '0' },
    { label: '月度总到店量', value: '-' }
  ]
  
  const fallbackNewKpi = [
    { label: '新增总线索', value: '0', change: 0 },
    { label: '新增有效线索', value: '0', change: 0 },
    { label: '新增经销商线索', value: '0', change: 0 },
    { label: '新增经销商有效线索', value: '0', change: 0 }
  ]

  const fallbackSource = [
    { name: '官网', value: 340 },
    { name: '抖音', value: 280 },
    { name: '车展', value: 220 },
    { name: '电话', value: 180 },
    { name: '转介绍', value: 150 },
    { name: '其他', value: 80 }
  ]

  const fallbackTrend = [
    { date: '12-01', shop_count: 85, shop_rate: 12.50 },
    { date: '12-02', shop_count: 92, shop_rate: 13.25 },
    { date: '12-03', shop_count: 78, shop_rate: 11.80 },
    { date: '12-04', shop_count: 105, shop_rate: 14.35 },
    { date: '12-05', shop_count: 98, shop_rate: 13.80 },
    { date: '12-06', shop_count: 112, shop_rate: 15.15 },
    { date: '12-07', shop_count: 128, shop_rate: 16.20 }
  ]

  const fallbackDealer = [
    { rank: 1, name: '北京朝阳4S店', conversions: 45, rate: 18.2 },
    { rank: 2, name: '上海浦东4S店', conversions: 38, rate: 16.8 },
    { rank: 3, name: '广州天河4S店', conversions: 32, rate: 15.5 },
    { rank: 4, name: '深圳南山4S店', conversions: 29, rate: 14.8 },
    { rank: 5, name: '杭州西湖4S店', conversions: 25, rate: 13.6 }
  ]

  const kpiData = data?.kpi || fallbackKpi
  const newKpiData = data?.newKpi || fallbackNewKpi
  const sourceData = data?.sourceDistribution || fallbackSource
  const trendData = data?.trendData || fallbackTrend
  const dealerData = data?.dealerRanking || fallbackDealer;

  const navigationCards = [
    { title: '线索管理', desc: '查看和管理所有销售线索', icon: Users, color: 'bg-blue-500' },
    { title: '数据分析', desc: '深入分析线索转化数据', icon: BarChart3, color: 'bg-green-500' },
    { title: '经销商管理', desc: '管理经销商信息和绩效', icon: Building2, color: 'bg-purple-500' },
    { title: '跟进记录', desc: '记录和查看客户跟进', icon: Activity, color: 'bg-orange-500' },
    { title: '人单酬管理', desc: '管理待办任务和提醒', icon: Calendar, color: 'bg-pink-500' },
    { title: '运营数据', desc: '查看客流明细和运营报表', icon: Target, color: 'bg-cyan-500' },
    { title: '数据查询', desc: '灵活查询各业务表数据', icon: Database, color: 'bg-indigo-500' }
  ]

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

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
            <div className="flex-1">
              <p className="text-red-700">{error}</p>
              <p className="text-red-600 text-sm mt-1">当前显示模拟数据，请确保后端服务已启动</p>
            </div>
            <button
              onClick={() => refetch()}
              className="ml-4 text-red-600 hover:text-red-800 text-sm font-medium"
            >
              重试
            </button>
          </div>
        </div>
      )}
      {/* 顶部导航栏 */}
      <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-primary-800 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">线索运营监控系统</h1>
              <p className="text-xs text-slate-500">Lead Operation Management System</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* 数据时间 */}
            <div className="hidden sm:flex items-center gap-6 mr-4">
              <div className="text-right">
                <p className="text-xs text-slate-500">最早数据时间</p>
                <p className="text-sm font-medium text-slate-700">
                  {formatSyncTime(earliestDataTime)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">数据最新同步时间</p>
                <p className="text-sm font-medium text-slate-700">
                  {formatSyncTime(latestSyncTime)}
                </p>
                <p className="text-xs text-slate-400">
                  上次刷新: {formatLastRefresh(lastRefreshTime)}
                </p>
              </div>
            </div>
            <button
              onClick={() => refetch(false)}
              className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="刷新数据"
              disabled={loading || refreshing}
            >
              <RefreshCw className={`w-5 h-5 ${(loading || refreshing) ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => refetch(true)}
              className="relative px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="从原始数据库同步新数据"
              disabled={loading || refreshing}
            >
              {refreshing ? '同步中...' : '同步新数据'}
            </button>
            <button className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
              <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
                <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center">
                  <span className="text-primary-800 font-semibold">张</span>
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-slate-900">张经理</p>
                  <p className="text-xs text-slate-500">销售总监</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 欢迎区域 */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900">您好，张经理 👋</h2>
          <p className="text-slate-600 mt-1">今天是 {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</p>
        </div>

        {/* KPI指标卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {kpiData.map((item, index) => {
            // 卡片颜色配置
            const colors = [
              { bg: 'bg-blue-50', iconBg: 'bg-blue-500', text: 'text-blue-700' },
              { bg: 'bg-green-50', iconBg: 'bg-green-500', text: 'text-green-700' },
              { bg: 'bg-purple-50', iconBg: 'bg-purple-500', text: 'text-purple-700' },
              { bg: 'bg-orange-50', iconBg: 'bg-orange-500', text: 'text-orange-700' }
            ];
            const color = colors[index];
            
            return (
              <div
                key={index}
                className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600">{item.label}</p>
                    <p className="text-3xl font-bold text-slate-900 mt-2">{item.value}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color.iconBg}`}>
                    <TrendingUp className="w-6 h-6 text-white" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 日/月切换按钮 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => switchPeriod('day')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                period === 'day'
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              昨日数据
            </button>
            <button
              onClick={() => switchPeriod('month')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                period === 'month'
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              当月累计
            </button>
          </div>
        </div>

        {/* 新增线索指标卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {newKpiData.map((item, index) => {
            const colors = [
              { bg: 'bg-blue-50', iconBg: 'bg-blue-500', text: 'text-blue-700' },
              { bg: 'bg-green-50', iconBg: 'bg-green-500', text: 'text-green-700' },
              { bg: 'bg-purple-50', iconBg: 'bg-purple-500', text: 'text-purple-700' },
              { bg: 'bg-orange-50', iconBg: 'bg-orange-500', text: 'text-orange-700' }
            ];
            const color = colors[index];
            const isPositive = item.change >= 0;
            
            return (
              <div
                key={index}
                className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-600">{item.label}</p>
                    <p className="text-3xl font-bold text-slate-900 mt-2">{item.value}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          isPositive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {isPositive ? '↑' : '↓'} {Math.abs(item.change).toFixed(1)}%
                      </span>
                      <span className="text-xs text-slate-500">{item.changeLabel || '较前日'}</span>
                    </div>
                  </div>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color.iconBg}`}>
                    <TrendingUp className="w-6 h-6 text-white" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 图表区域 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* 线索来源分布 */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-slate-900">线索来源分布</h3>
              <button className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                查看详情
              </button>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourceData} margin={{ top: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} domain={[0, 'dataMax + 20000']} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                    formatter={(value: number, name: string) => [`${value}`, name === 'value' ? '线索数' : name]}
                  />
                  <Bar dataKey="value" fill="#3b82f6" radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="valid_rate" position="top" formatter={(value: number) => `${value}%`} fill="#64748b" fontSize={12} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 text-center text-sm text-slate-500">
              注：柱子上方百分比为线索有效率
            </div>
          </div>

          {/* 转化趋势 */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-slate-900">到店数及到店率趋势</h3>
              <button className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                查看详情
              </button>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} label={{ value: '到店数', angle: -90, position: 'insideLeft' }} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} domain={[0, 100]} label={{ value: '到店率(%)', angle: 90, position: 'insideRight' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                    formatter={(value: any, name: string) => {
                      if (name === 'shop_count') return [value, '到店数'];
                      if (name === 'shop_rate') return [`${Number(value).toFixed(2)}%`, '到店率'];
                      return [value, name];
                    }}
                  />
                  <Line yAxisId="left" type="monotone" dataKey="shop_count" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="到店数">
                    <LabelList dataKey="shop_count" position="top" fill="#3b82f6" fontSize={12} />
                  </Line>
                  <Line yAxisId="right" type="monotone" dataKey="shop_rate" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="到店率">
                    <LabelList dataKey="shop_rate" position="top" fill="#10b981" fontSize={12} formatter={(value: number) => `${value.toFixed(2)}%`} />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* 功能导航区 */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">功能导航</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {navigationCards.map((card, index) => {
              const Icon = card.icon;
              const isFollowUp = card.title === '跟进记录';
              const isOperationsData = card.title === '运营数据';
              const isDataQuery = card.title === '数据查询';
              const isDealerManagement = card.title === '经销商管理';
              
              if (isFollowUp) {
                return (
                  <Link
                    key={index}
                    to="/follow-up"
                    className="bg-white rounded-2xl p-6 text-left shadow-sm border border-slate-200 hover:shadow-md hover:-translate-y-1 transition-all duration-200 group w-full"
                  >
                    <div className={`w-12 h-12 ${card.color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h4 className="text-lg font-semibold text-slate-900 mb-1">{card.title}</h4>
                    <p className="text-sm text-slate-600">{card.desc}</p>
                    <div className="mt-4 flex items-center text-primary-600 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      进入管理 <ChevronRight className="w-4 h-4 ml-1" />
                    </div>
                  </Link>
                );
              }
              
              if (isOperationsData) {
                return (
                  <Link
                    key={index}
                    to="/operations-data"
                    className="bg-white rounded-2xl p-6 text-left shadow-sm border border-slate-200 hover:shadow-md hover:-translate-y-1 transition-all duration-200 group w-full"
                  >
                    <div className={`w-12 h-12 ${card.color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h4 className="text-lg font-semibold text-slate-900 mb-1">{card.title}</h4>
                    <p className="text-sm text-slate-600">{card.desc}</p>
                    <div className="mt-4 flex items-center text-primary-600 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      进入管理 <ChevronRight className="w-4 h-4 ml-1" />
                    </div>
                  </Link>
                );
              }

              if (isDataQuery) {
                return (
                  <Link
                    key={index}
                    to="/data-query"
                    className="bg-white rounded-2xl p-6 text-left shadow-sm border border-slate-200 hover:shadow-md hover:-translate-y-1 transition-all duration-200 group w-full"
                  >
                    <div className={`w-12 h-12 ${card.color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h4 className="text-lg font-semibold text-slate-900 mb-1">{card.title}</h4>
                    <p className="text-sm text-slate-600">{card.desc}</p>
                    <div className="mt-4 flex items-center text-primary-600 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      进入查询 <ChevronRight className="w-4 h-4 ml-1" />
                    </div>
                  </Link>
                );
              }

              if (isDealerManagement) {
                return (
                  <Link
                    key={index}
                    to="/dealer-management"
                    className="bg-white rounded-2xl p-6 text-left shadow-sm border border-slate-200 hover:shadow-md hover:-translate-y-1 transition-all duration-200 group w-full"
                  >
                    <div className={`w-12 h-12 ${card.color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h4 className="text-lg font-semibold text-slate-900 mb-1">{card.title}</h4>
                    <p className="text-sm text-slate-600">{card.desc}</p>
                    <div className="mt-4 flex items-center text-primary-600 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      进入管理 <ChevronRight className="w-4 h-4 ml-1" />
                    </div>
                  </Link>
                );
              }
              
              return (
                <button
                  key={index}
                  className="bg-white rounded-2xl p-6 text-left shadow-sm border border-slate-200 hover:shadow-md hover:-translate-y-1 transition-all duration-200 group w-full"
                >
                  <div className={`w-12 h-12 ${card.color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h4 className="text-lg font-semibold text-slate-900 mb-1">{card.title}</h4>
                  <p className="text-sm text-slate-600">{card.desc}</p>
                  <div className="mt-4 flex items-center text-primary-600 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    进入管理 <ChevronRight className="w-4 h-4 ml-1" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 经销商排行榜 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">经销商转化排行榜</h3>
              <button className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                查看全部
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    排名
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    经销商名称
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    转化量
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    转化率
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {dealerData.map((dealer, index) => (
                  <tr key={index} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                        dealer.rank === 1 
                          ? 'bg-yellow-100 text-yellow-700' 
                          : dealer.rank === 2 
                          ? 'bg-slate-100 text-slate-700' 
                          : dealer.rank === 3 
                          ? 'bg-orange-100 text-orange-700' 
                          : 'bg-slate-50 text-slate-600'
                      }`}>
                        {dealer.rank}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-slate-900">{dealer.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-900 font-semibold">{dealer.conversions}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {dealer.rate}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button className="text-primary-600 hover:text-primary-700 font-medium">
                        查看详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Home;
