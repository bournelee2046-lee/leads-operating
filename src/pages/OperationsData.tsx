import React from 'react'
import { ChevronLeft, Users, TrendingUp, BarChart3, Activity, Inbox } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/lib/auth'

const OperationsData = () => {
  const { hasPermission } = useAuth()
  const cards = [
    {
      id: 1,
      title: '客流明细',
      description: '进店客户详细信息统计',
      icon: Users,
      color: 'bg-blue-500',
      path: '/customer-visit',
      permission: 'operations.customer_visit.entry'
    },
    {
      id: 2,
      title: '客流统计',
      description: '门店客流聚合统计',
      icon: TrendingUp,
      color: 'bg-green-500',
      path: '/visit-stats',
      permission: 'operations.visit_stats.entry'
    },
    {
      id: 3,
      title: '预留卡片三',
      description: '功能开发中',
      icon: BarChart3,
      color: 'bg-purple-500',
      path: null,
      permission: null
    },
    {
      id: 4,
      title: '预留卡片四',
      description: '功能开发中',
      icon: Activity,
      color: 'bg-orange-500',
      path: null,
      permission: null
    },
  ].filter((card) => !card.permission || hasPermission(card.permission))

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
              <h1 className="text-xl font-semibold text-slate-900">运营数据</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!hasVisibleBusinessEntry ? (
          <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
            <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600">当前账号暂无可访问的运营数据入口</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {cards.map((card) => {
              const Icon = card.icon
              const CardContent = (
                <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-200 ${
                  card.path ? 'hover:shadow-md hover:-translate-y-1 cursor-pointer' : ''
                }`}>
                  <div className="p-4 border-b border-slate-100">
                    <div className="flex items-center">
                      <div className={`w-10 h-10 ${card.color} rounded-lg flex items-center justify-center mr-3`}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">{card.title}</h3>
                        <p className="text-sm text-slate-500">{card.description}</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 flex items-center justify-center h-32">
                    <p className="text-slate-400 text-sm">
                      {card.path ? '点击进入查看详情 →' : '功能开发中...'}
                    </p>
                  </div>
                </div>
              )

              if (card.path) {
                return (
                  <Link to={card.path} key={card.id}>
                    {CardContent}
                  </Link>
                )
              }

              return (
                <div key={card.id}>
                  {CardContent}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default OperationsData
