import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, RefreshCw, AlertCircle, Inbox } from 'lucide-react'
import { useAuth } from '@/lib/auth'

interface DistributionItem {
  dealer_id: string
  dealer_name: string
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
  month_start: string
  end_time: string
  description: string
}

interface FollowUpData {
  dealers: any[]
  distribution: DistributionItem[]
  time_range: TimeRange
}

const FollowUp = () => {
  const [data, setData] = useState<FollowUpData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canViewDistributionEntry = hasPermission('follow.distribution.entry')
  const canRefreshEntryData = hasPermission('follow.data.refresh')
  const canQueryDistribution = hasPermission('follow.distribution.query')

  const fetchData = async () => {
    if (!canQueryDistribution) {
      setLoading(false)
      setData(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/follow-up/distribution')
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
    fetchData()
  }, [canQueryDistribution])

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

  const cards = [
    {
      title: '跟进次数分布',
      desc: '各门店线索跟进次数分布统计',
      color: 'from-blue-500 to-blue-600',
      iconBg: 'bg-blue-500',
      path: '/follow-up/distribution',
      visible: canViewDistributionEntry
    },
    {
      title: '预留卡片二',
      desc: '功能开发中',
      color: 'from-green-500 to-green-600',
      iconBg: 'bg-green-500',
      path: '',
      visible: true
    },
    {
      title: '预留卡片三',
      desc: '功能开发中',
      color: 'from-purple-500 to-purple-600',
      iconBg: 'bg-purple-500',
      path: '',
      visible: true
    },
    {
      title: '预留卡片四',
      desc: '功能开发中',
      color: 'from-orange-500 to-orange-600',
      iconBg: 'bg-orange-500',
      path: '',
      visible: true
    }
  ].filter((card) => card.visible)

  const hasVisibleBusinessEntry = cards.some((card) => card.path)

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
              <h1 className="text-xl font-semibold text-slate-900">跟进记录</h1>
            </div>
            {canRefreshEntryData && (
              <button
                onClick={fetchData}
                className="flex items-center px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                刷新数据
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {data?.time_range.description && (
          <div className="mb-6 text-sm text-slate-500 text-center">
            {data.time_range.description}
          </div>
        )}

        {!hasVisibleBusinessEntry && (
          <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
            <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600">当前账号暂无可访问的跟进记录入口</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {cards.map((card, index) => {
            const isClickable = card.path !== ''
            return (
              <div
                key={index}
                onClick={() => isClickable && navigate(card.path)}
                className={`bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-200 ${
                  isClickable
                    ? 'cursor-pointer hover:shadow-md hover:-translate-y-1 group'
                    : ''
                }`}
              >
                <div className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center`}>
                      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-slate-900">{card.title}</h3>
                      <p className="text-sm text-slate-500">{card.desc}</p>
                    </div>
                    {isClickable && (
                      <svg className="w-5 h-5 text-slate-400 group-hover:text-primary-600 group-hover:translate-x-1 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </div>
                  {!isClickable && (
                    <div className="h-24 flex items-center justify-center bg-slate-50 rounded-xl">
                      <p className="text-slate-400">功能开发中...</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default FollowUp
