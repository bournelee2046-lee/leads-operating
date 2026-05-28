import { useState, useEffect } from 'react'
import { apiFetch } from '@/lib/api'

const API_BASE = '/api'

export const useDashboardData = () => {
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [refreshing, setRefreshing] = useState(false)
    const [latestSyncTime, setLatestSyncTime] = useState<string | null>(null)
    const [earliestDataTime, setEarliestDataTime] = useState<string | null>(null)
    const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null)
    const [period, setPeriod] = useState<'day' | 'month'>('day')

    const fetchDashboard = async (refreshDataMart = false, newPeriod = period) => {
        try {
            setLoading(!refreshDataMart)
            setRefreshing(refreshDataMart)
            setError(null)

            if (refreshDataMart) {
                const refreshResponse = await fetch(`${API_BASE}/refresh/trigger`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    credentials: 'same-origin',
                    body: JSON.stringify({ mode: 'incremental' }),
                })
                
                if (!refreshResponse.ok) {
                    const errBody = await refreshResponse.json().catch(() => ({}))
                    throw new Error(errBody.message || '刷新数据失败')
                }
            }

            const response = await fetch(`${API_BASE}/dashboard?period=${newPeriod}`, {
                credentials: 'same-origin',
            })
            const result = await response.json()
            
            if (result.success && result.data) {
                // 更新同步时间
                if (result.data.latest_sync_time) {
                    setLatestSyncTime(result.data.latest_sync_time)
                }
                if (result.data.earliest_data_time) {
                    setEarliestDataTime(result.data.earliest_data_time)
                }
                setLastRefreshTime(new Date())
                
                // 转换数据格式以匹配前端期望
                const transformedData = {
                    kpi: result.data.kpis?.map((k: any) => ({
                        label: k.display_name,
                        value: k.value,
                        change: k.change,
                        trend: k.trend
                    })) || [],
                    newKpi: result.data.new_kpis?.map((k: any) => ({
                        label: k.display_name,
                        value: k.value,
                        change: k.change,
                        changeLabel: k.change_label || '较前日'
                    })) || [],
                    sourceDistribution: result.data.source_distribution || [],
                    trendData: result.data.trend_data || [],
                    dealerRanking: result.data.dealer_ranking?.map((d: any) => ({
                        rank: d.rank,
                        dealerId: d.dealer_id,
                        name: d.dealer_name,
                        storeStatus: d.store_status,
                        conversions: d.conversion_count,
                        rate: d.conversion_rate
                    })) || []
                }
                setData(transformedData)
            } else {
                // 回退到模拟数据
                setData(getMockData())
            }
        } catch (e) {
            console.error('API Error:', e)
            setError(e instanceof Error ? e.message : '无法连接到后端服务')
            setData(getMockData())
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    const switchPeriod = (newPeriod: 'day' | 'month') => {
        setPeriod(newPeriod)
        fetchDashboard(false, newPeriod)
    }

    useEffect(() => {
        fetchDashboard(false)
    }, [])

    return { 
        data, 
        loading, 
        error, 
        refreshing,
        period,
        switchPeriod,
        refetch: (refreshDataMart = false) => fetchDashboard(refreshDataMart), 
        latestSyncTime,
        earliestDataTime, 
        lastRefreshTime 
    }
}

export const useFunnelHomeSummary = () => {
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchData = async () => {
        try {
            setLoading(true)
            setError(null)
            const result = await apiFetch<{ success: boolean; data: any }>('/api/funnel-target/home-summary')
            setData(result.data)
        } catch (e: any) {
            setError(e.message || '加载漏斗目标数据失败')
            setData(null)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [])

    return { data, loading, error, refetch: fetchData }
}

export const useFunnelData = (endpoint: string, params: Record<string, any>) => {
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchData = async () => {
        try {
            setLoading(true)
            setError(null)
            const query = new URLSearchParams()
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
            })
            const result = await apiFetch<{ success: boolean; data: any; pagination?: any }>(`/api/funnel-target/${endpoint}?${query.toString()}`)
            setData(result)
        } catch (e: any) {
            setError(e.message || '加载数据失败')
            setData(null)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [endpoint, JSON.stringify(params)])

    return { data, loading, error, refetch: fetchData }
}

function getMockData() {
  return {
    kpi: [
      { label: '年度总线索量', value: '0', change: '+0', trend: 'up' },
      { label: '年度总到店量', value: '-', change: '+0', trend: 'up' },
      { label: '月度总线索量', value: '0', change: '+0', trend: 'up' },
      { label: '月度总到店量', value: '-', change: '+0', trend: 'up' }
    ],
    newKpi: [
      { label: '新增总线索', value: '0', change: 0 },
      { label: '新增有效线索', value: '0', change: 0 },
      { label: '新增经销商线索', value: '0', change: 0 },
      { label: '新增经销商有效线索', value: '0', change: 0 }
    ],
    sourceDistribution: [
      { name: '官网', value: 340, valid_count: 280, valid_rate: 82.4 },
      { name: '抖音', value: 280, valid_count: 220, valid_rate: 78.6 },
      { name: '车展', value: 220, valid_count: 180, valid_rate: 81.8 },
      { name: '电话', value: 180, valid_count: 150, valid_rate: 83.3 },
      { name: '转介绍', value: 150, valid_count: 130, valid_rate: 86.7 },
      { name: '其他', value: 80, valid_count: 60, valid_rate: 75.0 }
    ],
    trendData: [
      { date: '12-01', shop_count: 85, shop_rate: 12.50 },
      { date: '12-02', shop_count: 92, shop_rate: 13.25 },
      { date: '12-03', shop_count: 78, shop_rate: 11.80 },
      { date: '12-04', shop_count: 105, shop_rate: 14.35 },
      { date: '12-05', shop_count: 98, shop_rate: 13.80 },
      { date: '12-06', shop_count: 112, shop_rate: 15.15 },
      { date: '12-07', shop_count: 128, shop_rate: 16.20 }
    ],
    dealerRanking: [
      { rank: 1, name: '北京朝阳4S店', conversions: 45, rate: 18.2 },
      { rank: 2, name: '上海浦东4S店', conversions: 38, rate: 16.8 },
      { rank: 3, name: '广州天河4S店', conversions: 32, rate: 15.5 },
      { rank: 4, name: '深圳南山4S店', conversions: 29, rate: 14.8 },
      { rank: 5, name: '杭州西湖4S店', conversions: 25, rate: 13.6 }
    ]
  }
}
