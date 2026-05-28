import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Download, FileText, Calendar } from 'lucide-react'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  today: string
  canExportTemplate: boolean
  canExportCustomRange: boolean
  customParams?: Record<string, string>
}

type TabType = 'template' | 'custom'

interface TabState {
  selectedDate: string
  startDate: string
  endDate: string
  countdown: number
  isCounting: boolean
  exporting: boolean
  error: string | null
}

function createInitialState(defaultDate?: string): TabState {
  return {
    selectedDate: defaultDate || '',
    startDate: '',
    endDate: '',
    countdown: 3,
    isCounting: false,
    exporting: false,
    error: null,
  }
}

export default function ExportModal({ isOpen, onClose, today, canExportTemplate, canExportCustomRange, customParams = {} }: ExportModalProps) {
  const toLocalDate = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const yesterday = toLocalDate(new Date(Date.now() - 86400000))
  const [activeTab, setActiveTab] = useState<TabType>('template')
  const [tab1, setTab1] = useState<TabState>(() => createInitialState(yesterday))
  const [tab2, setTab2] = useState<TabState>(createInitialState)
  const timerRef1 = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef2 = useRef<ReturnType<typeof setInterval> | null>(null)

  const currentState = activeTab === 'template' ? tab1 : tab2
  const setCurrentState = activeTab === 'template' ? setTab1 : setTab2
  const timerRef = activeTab === 'template' ? timerRef1 : timerRef2

  const stopCountdown = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setCurrentState(prev => ({ ...prev, isCounting: false, countdown: 3 }))
  }, [timerRef, setCurrentState])

  useEffect(() => {
    if (currentState.isCounting && currentState.countdown > 0) {
      timerRef.current = setInterval(() => {
        setCurrentState(prev => {
          if (prev.countdown <= 1) {
            return { ...prev, countdown: 0 }
          }
          return { ...prev, countdown: prev.countdown - 1 }
        })
      }, 1000)
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [currentState.isCounting, currentState.countdown, setCurrentState, timerRef])

  useEffect(() => {
    if (currentState.countdown === 0 && currentState.isCounting) {
      setCurrentState(prev => ({ ...prev, isCounting: false }))
    }
  }, [currentState.countdown, currentState.isCounting, setCurrentState])

  const canExport = currentState.countdown === 0 && !currentState.isCounting

  useEffect(() => {
    if (!canExportTemplate && canExportCustomRange && activeTab === 'template') {
      setActiveTab('custom')
    }
    if (canExportTemplate && !canExportCustomRange && activeTab === 'custom') {
      setActiveTab('template')
    }
  }, [activeTab, canExportCustomRange, canExportTemplate])

  const handleSwitchTab = (tab: TabType) => {
    if (tab === 'template' && !canExportTemplate) return
    if (tab === 'custom' && !canExportCustomRange) return
    stopCountdown()
    setActiveTab(tab)
  }

  const handleClose = () => {
    if (timerRef1.current) clearInterval(timerRef1.current)
    if (timerRef2.current) clearInterval(timerRef2.current)
    timerRef1.current = null
    timerRef2.current = null
    setTab1(prev => ({ ...prev, isCounting: false, countdown: 3, error: null, exporting: false }))
    setTab2(prev => ({ ...prev, isCounting: false, countdown: 3, error: null, exporting: false }))
    onClose()
  }

  const handleFilter = () => {
    setCurrentState(prev => ({ ...prev, error: null }))
    if (activeTab === 'template') {
      if (!tab1.selectedDate) {
        setTab1(prev => ({ ...prev, error: '请选择日期' }))
        return
      }
      setTab1(prev => ({ ...prev, isCounting: true, countdown: 3 }))
    } else {
      if (!tab2.startDate || !tab2.endDate) {
        setTab2(prev => ({ ...prev, error: '请选择起始日期和结束日期' }))
        return
      }
      if (tab2.startDate > tab2.endDate) {
        setTab2(prev => ({ ...prev, error: '起始日期不能晚于结束日期' }))
        return
      }
      setTab2(prev => ({ ...prev, isCounting: true, countdown: 3 }))
    }
  }

  const handleClear = () => {
    stopCountdown()
    if (activeTab === 'template') {
      setTab1(prev => ({ ...prev, selectedDate: '', error: null }))
    } else {
      setTab2(prev => ({ ...prev, startDate: '', endDate: '', error: null }))
    }
  }

  const handleExport = async () => {
    if (!canExport || currentState.exporting) return
    if (activeTab === 'template' && !canExportTemplate) return
    if (activeTab === 'custom' && !canExportCustomRange) return
    setCurrentState(prev => ({ ...prev, exporting: true, error: null }))

    try {
      let url: string
      let filename: string
      const extraParams = new URLSearchParams()
      Object.entries(customParams).forEach(([key, value]) => {
        if (value) extraParams.append(key, value)
      })
      const extraQuery = extraParams.toString()

      if (activeTab === 'template') {
        const templateParams = new URLSearchParams()
        templateParams.append('date', tab1.selectedDate)
        if (customParams.store_status) templateParams.append('store_status', customParams.store_status)
        url = `/api/dealer-daily-report/export-template?${templateParams.toString()}`
        filename = `线索运营日报_门店_${tab1.selectedDate}.xlsx`
      } else {
        url = `/api/dealer-daily-report/export-custom-range?start_date=${tab2.startDate}&end_date=${tab2.endDate}${extraQuery ? `&${extraQuery}` : ''}`
        filename = `门店运营日报_自定义_${tab2.startDate}_${tab2.endDate}.xlsx`
      }

      const res = await fetch(url)
      if (res.ok) {
        const blob = await res.blob()
        const downloadUrl = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = downloadUrl
        a.download = filename
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(downloadUrl)
        document.body.removeChild(a)
      } else {
        const j = await res.json()
        setCurrentState(prev => ({ ...prev, error: j.message || '导出失败', exporting: false }))
        return
      }
    } catch {
      setCurrentState(prev => ({ ...prev, error: '导出失败，请检查网络后重试', exporting: false }))
      return
    }

    setCurrentState(prev => ({ ...prev, exporting: false }))
  }

  const handleDateChange = (field: 'selectedDate' | 'startDate' | 'endDate', value: string) => {
    setCurrentState(prev => {
      const next = { ...prev, [field]: value, error: null }
      if (prev.isCounting) {
        if (timerRef.current) clearInterval(timerRef.current)
        timerRef.current = null
        next.isCounting = false
        next.countdown = 3
      }
      return next
    })
  }

  if (!isOpen) return null
  if (!canExportTemplate && !canExportCustomRange) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-lg font-semibold text-slate-900">导出Excel</h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 border-b border-slate-200">
          <div className="flex -mb-px">
            {canExportTemplate && (
              <button
                onClick={() => handleSwitchTab('template')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === 'template'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <FileText className="w-4 h-4" />
                导出日报
              </button>
            )}
            {canExportCustomRange && (
              <button
                onClick={() => handleSwitchTab('custom')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === 'custom'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Calendar className="w-4 h-4" />
                自定义导出
              </button>
            )}
          </div>
        </div>

        <div className="px-6 pb-6 pt-4">
          {activeTab === 'template' ? (
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">选择日期</label>
              <input
                type="date"
                value={tab1.selectedDate}
                max={today}
                onChange={e => handleDateChange('selectedDate', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                disabled={tab1.exporting}
              />
              {tab1.selectedDate && (
                <p className="text-xs text-slate-400 mt-2">
                  本月 = {tab1.selectedDate.slice(0, 8)}01 ~ {tab1.selectedDate}，本日 = {tab1.selectedDate}
                </p>
              )}
            </div>
          ) : (
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">日期范围</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={tab2.startDate}
                  max={tab2.endDate || today}
                  onChange={e => handleDateChange('startDate', e.target.value)}
                  className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                  disabled={tab2.exporting}
                />
                <span className="text-slate-400 text-sm">至</span>
                <input
                  type="date"
                  value={tab2.endDate}
                  min={tab2.startDate}
                  max={today}
                  onChange={e => handleDateChange('endDate', e.target.value)}
                  className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                  disabled={tab2.exporting}
                />
              </div>
              {tab2.startDate && tab2.endDate && (
                <p className="text-xs text-slate-400 mt-2">
                  所有指标按 {tab2.startDate} ~ {tab2.endDate} 累计计算
                </p>
              )}
            </div>
          )}

          {currentState.error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-3 mb-4 rounded-r-lg">
              <p className="text-red-700 text-xs">{currentState.error}</p>
            </div>
          )}

          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={handleFilter}
              disabled={currentState.exporting}
              className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 text-sm font-medium"
            >
              筛选
            </button>
            <button
              onClick={handleClear}
              disabled={currentState.exporting}
              className="flex-1 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 text-sm font-medium"
            >
              清空
            </button>
          </div>

          <button
            onClick={handleExport}
            disabled={!canExport || currentState.exporting}
            className="w-full px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 text-sm font-medium inline-flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            {currentState.exporting
              ? '导出中...'
              : currentState.isCounting
                ? `导出(${currentState.countdown}s)`
                : '导出'}
          </button>

          <p className="text-xs text-slate-400 mt-3 text-center">
            {activeTab === 'template'
              ? '选择日期 → 点击筛选 → 等待3秒导出'
              : '选择日期范围 → 点击筛选 → 等待3秒导出'}
          </p>
        </div>
      </div>
    </div>
  )
}
