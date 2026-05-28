import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  type LucideIcon,
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Building2,
  Check,
  ChevronLeft,
  Clock3,
  ClipboardList,
  FileText,
  Filter,
  Folder,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Store,
  TrendingDown,
  TrendingUp,
  Trash2,
  X,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'

type TaskSummary = {
  task_count: number
  in_progress_count: number
  completed_count: number
  archived_count: number
  store_count: number
  latest_task_time: string
}

type TaskRow = {
  task_id: number
  task_name: string
  dimension: string
  status: string
  week_start_date: string
  baseline_date: string
  created_at: string
  completed_at: string
  completed_by: string
  archived_at: string
  archived_by: string
  filter_date: string
  summary_status: string
  store_count: number
  follow_count: number
  store_preview: string[]
  latest_history?: {
    操作类型?: string
    操作后状态?: string
    操作人?: string
    操作时间?: string
    操作备注?: string
  } | null
}

type TaskStore = {
  store_code: string
  store_name: string
  region: string
  zone: string
  source_store_status: string
  governance_status: string
  store_rating: string
  status_note: string
  admin_note: string
  follow_count: number
  latest_follow_time: string
  reason_summary: string
  report_date: string
  local_lead_count: number
  visit_count: number
  visit_rate: number
  prev_week_visit_count: number
  prev_month_visit_count: number
  wow_visit_diff: number
  wow_visit_rate: number | null
  mom_visit_diff: number
  mom_visit_rate: number | null
  continuous_days: number
  continuous_tasks: Array<{ task_id: number; task_name: string; status: string; week_start_date: string; baseline_date: string; created_at: string }>
}

type TaskDetail = TaskRow & {
  baseline_data: string
  stores: TaskStore[]
  history: Array<{
    任务ID?: number
    操作类型?: string
    操作前状态?: string
    操作后状态?: string
    操作人?: string
    操作时间?: string
    操作备注?: string
  }>
  follow_records: Array<{
    record_id: number
    task_id: number
    report_date: string
    store_code: string
    store_name: string
    local_lead_count: number
    visit_count: number
    reason: string
    remark: string
    operator: string
    created_at: string
    follow_time: string
  }>
  summary?: TaskSummaryRecord | null
}

type TaskSummaryRecord = {
  summary_id: number
  task_id: number
  summary_type: string
  source: string
  content: string
  draft_content: string
  confirm_status: string
  confirmed_by: string
  confirmed_at: string
  created_at: string
  updated_at: string
}

type PreviewResult = {
  report_date: string
  stores: TaskStore[]
  total: number
}

type DealerDailyReportResponse = {
  success: boolean
  data: Array<{ report_date?: string }>
}

type FollowReason = {
  id: number
  name: string
  sort_order: number
  status: string
  parent_id: number | null
  parent_name?: string
  created_at: string
}

const emptySummary: TaskSummary = {
  task_count: 0,
  in_progress_count: 0,
  completed_count: 0,
  archived_count: 0,
  store_count: 0,
  latest_task_time: '',
}

const defaultFollowReasonNames = [
  '线索量正常，无需干预',
  '线索量下降，已联系督导',
  '线索量下降，已联系店长',
  '线索量下降，等待自然恢复',
  '门店积极配合，等待数据回升',
  '门店不配合，已上报',
  '到店率正常',
  '到店率偏低，已提醒门店',
  '到店率偏低，门店已采取措施',
  '其他原因',
]

const normalizeFollowReasons = (rows: FollowReason[]) => {
  const seen = new Set<string>()
  return rows
    .filter((reason) => {
      const name = reason.name?.trim()
      const key = `${reason.parent_id ?? ''}-${name}`
      if (!name || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => Number(a.sort_order ?? 999999) - Number(b.sort_order ?? 999999) || Number(a.id) - Number(b.id))
}

const defaultFollowReasons = (): FollowReason[] => defaultFollowReasonNames.map((name, index) => ({
  id: index + 1,
  name,
  sort_order: index + 1,
  status: '启用',
  parent_id: null,
  parent_name: getReasonGroupTitle(name),
  created_at: '',
}))

const getReasonGroupTitle = (name: string) => {
  if (name.includes('线索量')) return '线索量问题'
  if (name.includes('门店') || name.includes('配合') || name.includes('上报')) return '门店配合度'
  if (name.includes('到店率')) return '到店率问题'
  return '其他原因'
}

const groupFollowReasons = (reasons: FollowReason[]) => {
  const groupNames = Array.from(new Set(reasons.map((reason) => reason.parent_name || getReasonGroupTitle(reason.name || ''))))
  const groups = groupNames.map((title) => ({ title, reasons: [] as FollowReason[] }))
  reasons.forEach((reason) => {
    const title = reason.parent_name || getReasonGroupTitle(reason.name || '')
    const group = groups.find((item) => item.title === title) || groups[groups.length - 1]
    group.reasons.push(reason)
  })
  return groups.filter((group) => group.reasons.length > 0)
}

const maxVisitCountText = (stores: TaskStore[] = []) => {
  const maxVisitCount = Math.max(0, ...stores.map((store) => Number(store.visit_count || 0)))
  return String(Math.ceil(maxVisitCount))
}

const parseMultiLineTerms = (value: string) => {
  const seen = new Set<string>()
  return String(value || '')
    .split(/[\s,，;；、|/]+/)
    .map((item) => item.trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false
      seen.add(item)
      return true
    })
}

function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[84px] flex-col items-center justify-center border-r border-white/10 px-4 last:border-r-0">
      <span className="text-xs font-semibold text-white/70">{label}</span>
      <strong className="mt-1 text-3xl font-bold leading-none tracking-normal text-white">{value}</strong>
    </div>
  )
}

const FollowUp = () => {
  const navigate = useNavigate()
  const { taskId } = useParams()
  const isTaskPage = Boolean(taskId)
  const { hasPermission } = useAuth()
  const canQueryFollow = hasPermission('follow.view')
  const canViewStoreProfile = hasPermission('store_profile.view')
  const canViewStoreManagement = hasPermission('store_management.view')
  const canRefreshEntryData = hasPermission('follow.data.refresh')
  const canCreateTask = hasPermission('follow.task.create')
  const canEditTaskStores = hasPermission('follow.task.edit')
  const canChangeTaskStatus = hasPermission('follow.task.status')
  const canEditFollowRecord = hasPermission('follow.record.edit')
  const canManageFollowReasons = hasPermission('follow.reason.config.manage')
  const canGenerateSummary = hasPermission('follow.summary.generate')
  const canConfirmSummary = hasPermission('follow.summary.confirm')

  const [summary, setSummary] = useState<TaskSummary>(emptySummary)
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null)
  const [taskLoading, setTaskLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [dimension, setDimension] = useState('')
  const [keyword, setKeyword] = useState('')
  const [storeSort, setStoreSort] = useState<'continuous_days' | 'visit_count' | 'wow_visit_rate' | 'mom_visit_rate'>('continuous_days')
  const [storeSortOrder, setStoreSortOrder] = useState<'desc' | 'asc'>('desc')
  const [storeKeyword, setStoreKeyword] = useState('')
  const [visitThreshold, setVisitThreshold] = useState('0')
  const [continuousThreshold, setContinuousThreshold] = useState('0')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({
    dimension: '日任务',
    task_name: '',
    min_visit_count: '',
    max_visit_rate: '',
    min_wow_decline_rate: '',
    min_mom_decline_rate: '',
    keyword: '',
    store_codes_text: '',
    store_names_text: '',
  })
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [selectedPreviewStores, setSelectedPreviewStores] = useState<Set<string>>(new Set())
  const [taskStorePickerMode, setTaskStorePickerMode] = useState<'create' | 'append'>('create')
  const [actionLoading, setActionLoading] = useState(false)
  const [editingFollowStore, setEditingFollowStore] = useState<TaskStore | null>(null)
  const [followForm, setFollowForm] = useState({ reasons: [] as string[], remark: '' })
  const [followReasons, setFollowReasons] = useState<FollowReason[]>([])
  const [showReasonModal, setShowReasonModal] = useState(false)
  const [editingReason, setEditingReason] = useState<FollowReason | null>(null)
  const [reasonForm, setReasonForm] = useState({ name: '', status: '启用', sort_order: '', parent_id: '', is_group: false })
  const [summaryDraft, setSummaryDraft] = useState('')
  const [showSummaryModal, setShowSummaryModal] = useState(false)
  const [createModalOffset, setCreateModalOffset] = useState({ x: 0, y: 0 })
  const [reasonModalOffset, setReasonModalOffset] = useState({ x: 0, y: 0 })
  const dragStateRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const reasonDragStateRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const autoPreviewStartedRef = useRef(false)

  const fetchOverview = async () => {
    if (!canQueryFollow) {
      setLoading(false)
      setError(null)
      setTasks([])
      setSummary(emptySummary)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (dimension) params.set('dimension', dimension)
      if (keyword) params.set('keyword', keyword)
      const result = await apiFetch<{ success: boolean; data: { summary: TaskSummary; tasks: TaskRow[] } }>(`/api/governance/overview${params.toString() ? `?${params.toString()}` : ''}`)
      setSummary(result.data.summary || emptySummary)
      setTasks(result.data.tasks || [])
      if (!isTaskPage && !taskDetail && result.data.tasks?.length) {
        await fetchTaskDetail(result.data.tasks[0].task_id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取线索运营监控数据失败')
      setSummary(emptySummary)
      setTasks([])
    } finally {
      setLoading(false)
    }
  }

  const fetchTaskDetail = async (taskId: number) => {
    if (!canQueryFollow) return
    setTaskLoading(true)
    setError(null)
    try {
      const result = await apiFetch<{ success: boolean; data: TaskDetail }>(`/api/governance/tasks/${taskId}`)
      setTaskDetail(result.data)
      setVisitThreshold(maxVisitCountText(result.data?.stores || []))
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取任务详情失败')
    } finally {
      setTaskLoading(false)
    }
  }

  const fetchFollowReasons = async () => {
    if (!canQueryFollow) return
    try {
      const result = await apiFetch<{ success: boolean; data: FollowReason[] }>('/api/governance/follow-reasons')
      const normalized = normalizeFollowReasons(result.data || [])
      setFollowReasons(normalized)
    } catch (err) {
      setFollowReasons([])
      setError(err instanceof Error ? err.message : '获取跟进原因失败')
    }
  }

  useEffect(() => {
    fetchOverview()
    fetchFollowReasons()
  }, [canQueryFollow])

  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', handleCreateModalDrag)
      window.removeEventListener('mouseup', stopCreateModalDrag)
    }
  }, [])

  useEffect(() => {
    if (canQueryFollow && taskId) {
      setStoreKeyword('')
      setContinuousThreshold('0')
      fetchTaskDetail(Number(taskId))
    }
  }, [canQueryFollow, taskId])

  const visibleStores = useMemo(() => {
    const list = taskDetail?.stores ? [...taskDetail.stores] : []
    const visitMin = Number(visitThreshold || 0)
    const consecutiveMin = Number(continuousThreshold || 0)
    const keywordValue = storeKeyword.trim().toLowerCase()
    const threshold = visitMin > 0 ? visitMin : 0
    const continuousLimit = consecutiveMin > 0 ? consecutiveMin : 0

    const filtered = list.filter((store) => {
      if (visitThreshold !== '' && store.visit_count > threshold) return false
      if (store.continuous_days < continuousLimit) return false
      if (keywordValue) {
        const searchable = [
          store.store_code,
          store.store_name,
          store.region,
          store.zone,
          String(store.follow_count),
        ].join(' ').toLowerCase()
        if (!searchable.includes(keywordValue)) return false
      }
      return true
    })

    filtered.sort((a, b) => {
      const av = Number(a[storeSort] ?? 0)
      const bv = Number(b[storeSort] ?? 0)
      return storeSortOrder === 'asc' ? av - bv : bv - av
    })
    return filtered
  }, [taskDetail, visitThreshold, continuousThreshold, storeKeyword, storeSort, storeSortOrder])

  const configuredFollowReasons = useMemo(() => {
    const seen = new Set<string>()
    return followReasons.filter((reason) => {
      if (reason.parent_id === 0) return false
      const name = reason.name?.trim()
      if (!name || seen.has(name)) return false
      seen.add(name)
      return true
    })
  }, [followReasons])

  const configuredReasonGroups = useMemo(
    () => followReasons.filter((reason) => reason.parent_id === 0),
    [followReasons],
  )

  const enabledFollowReasons = useMemo(
    () => configuredFollowReasons.filter((reason) => (reason.status || '启用') === '启用'),
    [configuredFollowReasons],
  )

  const groupedFollowReasons = useMemo(() => groupFollowReasons(enabledFollowReasons), [enabledFollowReasons])

  const currentStoreFollowRecords = useMemo(() => {
    if (!taskDetail || !editingFollowStore) return []
    return taskDetail.follow_records.filter((row) => row.store_code === editingFollowStore.store_code)
  }, [editingFollowStore, taskDetail])

  const followedStoreCount = useMemo(() => {
    if (!taskDetail) return 0
    return new Set(
      taskDetail.follow_records
        .map((row) => String(row.store_code || '').trim())
        .filter(Boolean),
    ).size
  }, [taskDetail])

  const handleRefresh = async () => {
    await fetchOverview()
  }

  const openTask = async (taskId: number) => {
    navigate(`/follow-up/tasks/${taskId}`)
  }

  const buildCreatePayload = () => ({
    dimension: createForm.dimension,
    task_name: createForm.task_name,
    keyword: createForm.keyword,
    store_codes: parseMultiLineTerms(createForm.store_codes_text),
    store_names: parseMultiLineTerms(createForm.store_names_text),
    filters: {
      min_visit_count: createForm.min_visit_count,
      max_visit_rate: createForm.max_visit_rate,
      min_wow_decline_rate: createForm.min_wow_decline_rate,
      min_mom_decline_rate: createForm.min_mom_decline_rate,
    },
    sort_by: 'visit_count',
    sort_order: 'desc',
    limit: 1000,
  })

  const fetchLatestDealerDailyDate = async () => {
    const result = await apiFetch<DealerDailyReportResponse>('/api/dealer-daily-report?period=daily&page=1&page_size=1&sort_by=lead_count&sort_order=desc')
    return normalizeDateText(result.data?.[0]?.report_date)
  }

  const apiFetchWithTimeout = async <T,>(url: string, options: RequestInit = {}, timeoutMs = 12000) => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await apiFetch<T>(url, { ...options, signal: controller.signal })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('预览请求超时，请稍后重试')
      }
      throw err
    } finally {
      window.clearTimeout(timeout)
    }
  }

  const previewStoresWithPayload = async (payload = buildCreatePayload()) => {
    const result = await apiFetchWithTimeout<{ success: boolean; data: PreviewResult }>('/api/governance/filter-preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    const storeCodes = new Set((payload.store_codes || []).map((item: string) => item.toLowerCase()))
    const storeNames = (payload.store_names || []).map((item: string) => item.toLowerCase())
    const filteredStores = (result.data.stores || []).filter((store) => {
      const code = String(store.store_code || '').toLowerCase()
      const name = String(store.store_name || '').toLowerCase()
      if (storeCodes.size && !storeCodes.has(code)) return false
      if (storeNames.length && !storeNames.some((item: string) => name.includes(item))) return false
      return true
    })
    setPreview({ ...result.data, stores: filteredStores, total: filteredStores.length, report_date: normalizeDateText(result.data.report_date) })
    setSelectedPreviewStores(new Set())
  }

  const previewStores = async () => {
    setActionLoading(true)
    setError(null)
    try {
      await previewStoresWithPayload()
    } catch (err) {
      setError(err instanceof Error ? err.message : '预览筛选失败')
    } finally {
      setActionLoading(false)
    }
  }

  useEffect(() => {
    if (!showCreateModal) {
      autoPreviewStartedRef.current = false
      return
    }
    if (autoPreviewStartedRef.current || preview) return

    autoPreviewStartedRef.current = true
    const normalizedForm = {
      ...createForm,
      min_visit_count: createForm.min_visit_count === '0' ? '' : createForm.min_visit_count,
    }
    if (normalizedForm.min_visit_count !== createForm.min_visit_count) {
      setCreateForm(normalizedForm)
    }
    setSelectedPreviewStores(new Set())
    setError(null)
    previewStoresWithPayload({
      dimension: normalizedForm.dimension,
      task_name: normalizedForm.task_name,
      keyword: normalizedForm.keyword,
      store_codes: parseMultiLineTerms(normalizedForm.store_codes_text),
      store_names: parseMultiLineTerms(normalizedForm.store_names_text),
      filters: {
        min_visit_count: normalizedForm.min_visit_count,
        max_visit_rate: normalizedForm.max_visit_rate,
        min_wow_decline_rate: normalizedForm.min_wow_decline_rate,
        min_mom_decline_rate: normalizedForm.min_mom_decline_rate,
      },
      sort_by: 'visit_count',
      sort_order: 'desc',
      limit: 1000,
    }).catch((err) => setError(err instanceof Error ? err.message : '预览筛选失败'))
  }, [showCreateModal, preview])

  const startCreateModalDrag = (event: React.MouseEvent<HTMLDivElement>) => {
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: createModalOffset.x,
      originY: createModalOffset.y,
    }
    window.addEventListener('mousemove', handleCreateModalDrag)
    window.addEventListener('mouseup', stopCreateModalDrag)
  }

  const handleCreateModalDrag = (event: MouseEvent) => {
    const dragState = dragStateRef.current
    if (!dragState) return
    setCreateModalOffset({
      x: dragState.originX + event.clientX - dragState.startX,
      y: dragState.originY + event.clientY - dragState.startY,
    })
  }

  const stopCreateModalDrag = () => {
    dragStateRef.current = null
    window.removeEventListener('mousemove', handleCreateModalDrag)
    window.removeEventListener('mouseup', stopCreateModalDrag)
  }

  const startReasonModalDrag = (event: React.MouseEvent<HTMLDivElement>) => {
    reasonDragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: reasonModalOffset.x,
      originY: reasonModalOffset.y,
    }
    window.addEventListener('mousemove', handleReasonModalDrag)
    window.addEventListener('mouseup', stopReasonModalDrag)
  }

  const handleReasonModalDrag = (event: MouseEvent) => {
    const dragState = reasonDragStateRef.current
    if (!dragState) return
    setReasonModalOffset({
      x: dragState.originX + event.clientX - dragState.startX,
      y: dragState.originY + event.clientY - dragState.startY,
    })
  }

  const stopReasonModalDrag = () => {
    reasonDragStateRef.current = null
    window.removeEventListener('mousemove', handleReasonModalDrag)
    window.removeEventListener('mouseup', stopReasonModalDrag)
  }

  const togglePreviewStore = (storeCode: string) => {
    setSelectedPreviewStores((current) => {
      const next = new Set(current)
      if (next.has(storeCode)) next.delete(storeCode)
      else next.add(storeCode)
      return next
    })
  }

  const openCreateModal = () => {
    const defaultForm = {
      dimension: '日任务',
      task_name: '',
      min_visit_count: '',
      max_visit_rate: '',
      min_wow_decline_rate: '',
      min_mom_decline_rate: '',
      keyword: '',
      store_codes_text: '',
      store_names_text: '',
    }
    setCreateForm(defaultForm)
    setPreview(null)
    setSelectedPreviewStores(new Set())
    setTaskStorePickerMode('create')
    setCreateModalOffset({ x: 0, y: 0 })
    autoPreviewStartedRef.current = false
    setShowCreateModal(true)
    setError(null)
  }

  const closeCreateModal = () => {
    stopCreateModalDrag()
    setShowCreateModal(false)
    setPreview(null)
    setSelectedPreviewStores(new Set())
    setTaskStorePickerMode('create')
    setError(null)
    setCreateForm({
      dimension: '日任务',
      task_name: '',
      min_visit_count: '',
      max_visit_rate: '',
      min_wow_decline_rate: '',
      min_mom_decline_rate: '',
      keyword: '',
      store_codes_text: '',
      store_names_text: '',
    })
  }

  const openAppendStoresModal = () => {
    if (!taskDetail) return
    setTaskStorePickerMode('append')
    const defaultForm = {
      dimension: taskDetail.dimension || '日任务',
      task_name: taskDetail.task_name || '',
      min_visit_count: '',
      max_visit_rate: '',
      min_wow_decline_rate: '',
      min_mom_decline_rate: '',
      keyword: '',
      store_codes_text: '',
      store_names_text: '',
    }
    setCreateForm(defaultForm)
    setPreview(null)
    setSelectedPreviewStores(new Set())
    setCreateModalOffset({ x: 0, y: 0 })
    autoPreviewStartedRef.current = false
    setShowCreateModal(true)
    setError(null)
  }

  const createTask = async () => {
    const selectedStores = (preview?.stores || []).filter((store) => selectedPreviewStores.has(store.store_code))
    if (!selectedStores.length) {
      setError('请至少选择一家门店')
      return
    }
    if (!preview?.report_date) {
      setError('请先预览并确认筛选日期')
      return
    }
    setActionLoading(true)
    setError(null)
    try {
      const result = await apiFetch<{ success: boolean; data: { task_id: number } }>('/api/governance/tasks', {
        method: 'POST',
        body: JSON.stringify({ ...buildCreatePayload(), report_date: normalizeDateText(preview.report_date), stores: selectedStores }),
      })
      closeCreateModal()
      await fetchOverview()
      await fetchTaskDetail(result.data.task_id)
      navigate(`/follow-up/tasks/${result.data.task_id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建任务失败')
    } finally {
      setActionLoading(false)
    }
  }

  const appendStoresToTask = async () => {
    if (!taskDetail) return
    const selectedStores = (preview?.stores || []).filter((store) => selectedPreviewStores.has(store.store_code))
    if (!selectedStores.length) {
      setError('请至少选择一家门店')
      return
    }
    const merged = new Map<string, TaskStore>()
    taskDetail.stores.forEach((store) => merged.set(store.store_code, store))
    selectedStores.forEach((store) => merged.set(store.store_code, store))
    setActionLoading(true)
    setError(null)
    try {
      await apiFetch(`/api/governance/tasks/${taskDetail.task_id}/stores`, {
        method: 'PUT',
        body: JSON.stringify({
          ...buildCreatePayload(),
          report_date: preview?.report_date ? normalizeDateText(preview.report_date) : taskDetail.filter_date || taskDetail.baseline_date,
          stores: Array.from(merged.values()),
        }),
      })
      closeCreateModal()
      await fetchTaskDetail(taskDetail.task_id)
      await fetchOverview()
    } catch (err) {
      setError(err instanceof Error ? err.message : '增加门店失败')
    } finally {
      setActionLoading(false)
    }
  }

  const updateTaskStatus = async (action: 'complete' | 'archive' | 'restore') => {
    if (!taskDetail) return
    const actionLabel = action === 'complete' ? '完成' : action === 'archive' ? '归档' : '恢复'
    if (!window.confirm(`确认${actionLabel}当前任务？`)) return
    setActionLoading(true)
    setError(null)
    try {
      await apiFetch(`/api/governance/tasks/${taskDetail.task_id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      })
      await fetchOverview()
      await fetchTaskDetail(taskDetail.task_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : `${actionLabel}任务失败`)
    } finally {
      setActionLoading(false)
    }
  }

  const deleteTask = async (targetTaskId: number, targetTaskName?: string) => {
    if (!window.confirm(`确认删除任务「${targetTaskName || targetTaskId}」？删除后任务将从列表隐藏，跟进记录、任务历史和总结会保留。`)) return
    setActionLoading(true)
    setError(null)
    try {
      await apiFetch(`/api/governance/tasks/${targetTaskId}`, { method: 'DELETE' })
      if (taskDetail?.task_id === targetTaskId || Number(taskId) === targetTaskId) {
        setTaskDetail(null)
        navigate('/follow-up')
      }
      await fetchOverview()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除任务失败')
    } finally {
      setActionLoading(false)
    }
  }

  const saveFollowRecord = async () => {
    if (!taskDetail || !editingFollowStore) return
    const reasonText = followForm.reasons.join('、')
    setActionLoading(true)
    setError(null)
    try {
      await apiFetch(`/api/governance/tasks/${taskDetail.task_id}/follow-records`, {
        method: 'POST',
        body: JSON.stringify({
          store_code: editingFollowStore.store_code,
          report_date: editingFollowStore.report_date,
          reason: reasonText,
          remark: followForm.remark,
        }),
      })
      setEditingFollowStore(null)
      setFollowForm({ reasons: [], remark: '' })
      await fetchTaskDetail(taskDetail.task_id)
      await fetchOverview()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存跟进记录失败')
    } finally {
      setActionLoading(false)
    }
  }

  const openReasonModal = () => {
    setEditingReason(null)
    setReasonForm({ name: '', status: '启用', sort_order: '', parent_id: String(configuredReasonGroups[0]?.id || ''), is_group: false })
    setReasonModalOffset({ x: 0, y: 0 })
    setShowReasonModal(true)
  }

  const openEditReason = (reason: FollowReason) => {
    setEditingReason(reason)
    setReasonForm({
      name: reason.name || '',
      status: reason.status || '启用',
      sort_order: reason.sort_order == null ? '' : String(reason.sort_order),
      parent_id: reason.parent_id && reason.parent_id !== 0 ? String(reason.parent_id) : '',
      is_group: reason.parent_id === 0,
    })
  }

  const saveFollowReason = async () => {
    if (!reasonForm.name.trim()) {
      setError('请填写跟进原因')
      return
    }
    setActionLoading(true)
    setError(null)
    const body = JSON.stringify({
      name: reasonForm.name.trim(),
      status: reasonForm.status,
      sort_order: reasonForm.sort_order ? Number(reasonForm.sort_order) : undefined,
      parent_id: reasonForm.is_group ? 0 : Number(reasonForm.parent_id || 0) || null,
      is_group: reasonForm.is_group,
    })
    try {
      if (editingReason) {
        await apiFetch(`/api/governance/follow-reasons/${editingReason.id}`, { method: 'PATCH', body })
      } else {
        await apiFetch('/api/governance/follow-reasons', { method: 'POST', body })
      }
      setEditingReason(null)
      setReasonForm({ name: '', status: '启用', sort_order: '', parent_id: String(configuredReasonGroups[0]?.id || ''), is_group: false })
      await fetchFollowReasons()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存跟进原因失败')
    } finally {
      setActionLoading(false)
    }
  }

  const deleteFollowReason = async (reason: FollowReason) => {
    if (!window.confirm(`确认删除“${reason.name}”？已产生的历史记录不会被删除。`)) return
    setActionLoading(true)
    setError(null)
    try {
      await apiFetch(`/api/governance/follow-reasons/${reason.id}`, { method: 'DELETE' })
      if (editingReason?.id === reason.id) {
        setEditingReason(null)
        setReasonForm({ name: '', status: '启用', sort_order: '', parent_id: String(configuredReasonGroups[0]?.id || ''), is_group: false })
      }
      await fetchFollowReasons()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除跟进原因失败')
    } finally {
      setActionLoading(false)
    }
  }

  const generateSummary = async () => {
    if (!taskDetail) return
    setActionLoading(true)
    setError(null)
    try {
      const result = await apiFetch<{ success: boolean; data: TaskSummaryRecord }>(`/api/governance/tasks/${taskDetail.task_id}/summary/generate`, {
        method: 'POST',
      })
      setSummaryDraft(result.data.draft_content || result.data.content || '')
      setShowSummaryModal(true)
      await fetchTaskDetail(taskDetail.task_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成总结失败')
    } finally {
      setActionLoading(false)
    }
  }

  const confirmSummary = async () => {
    if (!taskDetail) return
    setActionLoading(true)
    setError(null)
    try {
      await apiFetch(`/api/governance/tasks/${taskDetail.task_id}/summary`, {
        method: 'POST',
        body: JSON.stringify({ content: summaryDraft, source: '人工确认' }),
      })
      setShowSummaryModal(false)
      await fetchTaskDetail(taskDetail.task_id)
      await fetchOverview()
    } catch (err) {
      setError(err instanceof Error ? err.message : '确认总结失败')
    } finally {
      setActionLoading(false)
    }
  }

  const fmtRate = (val: number | null | undefined) => {
    if (val == null) return '-'
    return `${val > 0 ? '+' : ''}${val.toFixed(1)}%`
  }

  const fmtNum = (val: number | null | undefined) => (val == null ? '-' : Number(val).toLocaleString())

  const normalizeDateText = (value?: string) => {
    if (!value) return ''
    const match = String(value).match(/\d{4}-\d{2}-\d{2}/)
    if (match) return match[0]
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return String(value)
    return parsed.toISOString().slice(0, 10)
  }

  const toggleFollowReason = (name: string) => {
    setFollowForm((prev) => ({
      ...prev,
      reasons: prev.reasons.includes(name)
        ? prev.reasons.filter((item) => item !== name)
        : [...prev.reasons, name],
    }))
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => window.history.back()} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <ChevronLeft className="w-5 h-5 text-slate-600" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-primary-600" />
                  <h1 className="text-xl font-semibold text-slate-900">线索运营监控系统</h1>
                </div>
                <p className="text-xs text-slate-500">{isTaskPage ? '跟进任务页面：按列表查看任务门店、跟进记录和总结' : '复用现有日报、任务、门店档案与门店管理数据，聚合看板、任务和复盘入口'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canCreateTask && (
                <button
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  新建任务
                </button>
              )}
              <button
                onClick={openReasonModal}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <ClipboardList className="w-4 h-4" />
                跟进原因配置
              </button>
              {canRefreshEntryData && (
                <button
                  onClick={handleRefresh}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm text-primary-700 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  刷新
                </button>
              )}
              {canViewStoreProfile && (
                <Link to="/store_profile" className="inline-flex items-center gap-2 px-3 py-2 text-sm text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                  <Store className="w-4 h-4" />
                  门店档案
                </Link>
              )}
              {canViewStoreManagement && (
                <Link to="/store_management" className="inline-flex items-center gap-2 px-3 py-2 text-sm text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                  <Building2 className="w-4 h-4" />
                  门店管理
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {!isTaskPage && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <StatCard icon={ClipboardList} label="任务总数" value={summary.task_count} />
          <StatCard icon={Clock3} label="进行中" value={summary.in_progress_count} />
          <StatCard icon={TrendingUp} label="已完成" value={summary.completed_count} />
          <StatCard icon={TrendingDown} label="已归档" value={summary.archived_count} />
          <StatCard icon={BarChart3} label="任务门店总览" value={summary.store_count} />
        </div>
        )}

        {!isTaskPage && (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-xs text-slate-500">状态</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm w-36">
                <option value="">全部</option>
                <option value="进行中">进行中</option>
                <option value="已完成">已完成</option>
                <option value="已归档">已归档</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">维度</span>
              <select value={dimension} onChange={(e) => setDimension(e.target.value)} className="mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm w-36">
                <option value="">全部</option>
                <option value="日任务">日任务</option>
                <option value="周任务">周任务</option>
              </select>
            </label>
            <label className="block flex-1 min-w-[220px]">
              <span className="text-xs text-slate-500">搜索</span>
              <div className="mt-1 flex items-center border border-slate-300 rounded-lg px-3 bg-white">
                <Search className="w-4 h-4 text-slate-400" />
                <input value={keyword} onChange={(e) => setKeyword(e.target.value)} className="w-full py-2 px-2 outline-none text-sm" placeholder="任务名 / 任务ID" />
              </div>
            </label>
            <button
              onClick={fetchOverview}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <Filter className="w-4 h-4" />
              筛选
            </button>
          </div>
        </div>
        )}

        <div className={isTaskPage ? 'space-y-6' : 'grid grid-cols-1 gap-6'}>
          {!isTaskPage && (
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary-600" />
              <h2 className="text-base font-semibold text-slate-900">任务列表</h2>
              <span className="text-xs text-slate-400">复用现有任务和历史数据</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">任务</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">维度</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">状态</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">门店数</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">已跟进门店数</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">基准日期</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">创建时间</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                        正在加载任务...
                      </td>
                    </tr>
                  ) : tasks.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-500">暂无可展示的任务</td>
                    </tr>
                  ) : (
                    tasks.map((task) => (
                      <tr
                        key={task.task_id}
                        className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                        onClick={() => openTask(task.task_id)}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{task.task_name}</div>
                          <div className="text-xs text-slate-400">#{task.task_id}</div>
                        </td>
                        <td className="px-4 py-3">{task.dimension}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            task.status === '进行中'
                              ? 'bg-amber-50 text-amber-700'
                              : task.status === '已完成'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
                          }`}>
                            {task.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">{task.store_count}</td>
                        <td className="px-4 py-3">{task.follow_count}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{task.baseline_date || '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{task.created_at || '-'}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              openTask(task.task_id)
                            }}
                            className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-800"
                          >
                            查看
                            <ArrowUpRight className="w-4 h-4" />
                          </button>
                          {canChangeTaskStatus && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                deleteTask(task.task_id, task.task_name)
                              }}
                              disabled={actionLoading}
                              className="ml-3 inline-flex items-center gap-1 text-red-600 hover:text-red-800 disabled:opacity-50"
                            >
                              删除
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
          )}

          {isTaskPage && (
          <section className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              {taskLoading && !taskDetail ? (
                <div className="py-10 text-center text-slate-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                  正在读取任务详情...
                </div>
              ) : taskDetail ? (
                <>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">{taskDetail.task_name}</h2>
                      <p className="text-xs text-slate-500">#{taskDetail.task_id} · {taskDetail.dimension} · {taskDetail.status}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {canChangeTaskStatus && taskDetail.status === '进行中' && (
                        <button onClick={() => updateTaskStatus('complete')} disabled={actionLoading} className="px-2.5 py-1.5 text-xs bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100">完成</button>
                      )}
                      {canChangeTaskStatus && taskDetail.status !== '已归档' && (
                        <button onClick={() => updateTaskStatus('archive')} disabled={actionLoading} className="px-2.5 py-1.5 text-xs bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">归档</button>
                      )}
                      {canChangeTaskStatus && taskDetail.status === '已归档' && (
                        <button onClick={() => updateTaskStatus('restore')} disabled={actionLoading} className="px-2.5 py-1.5 text-xs bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100">恢复</button>
                      )}
                      {canGenerateSummary && (
                        <button onClick={generateSummary} disabled={actionLoading} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100">
                          <FileText className="w-3.5 h-3.5" />
                          总结
                        </button>
                      )}
                      {canChangeTaskStatus && (
                        <button
                          onClick={() => deleteTask(taskDetail.task_id, taskDetail.task_name)}
                          disabled={actionLoading}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs bg-red-50 text-red-700 rounded-lg hover:bg-red-100 disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          删除
                        </button>
                      )}
                      <Link to={`/store_profile`} className="text-xs text-primary-600 hover:text-primary-800">门店档案</Link>
                      <Link to={`/store_management`} className="text-xs text-primary-600 hover:text-primary-800">门店管理</Link>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <InfoTile label="门店数" value={taskDetail.store_count} />
                    <InfoTile label="已跟进门店数" value={followedStoreCount} />
                    <InfoTile label="基准日期" value={taskDetail.baseline_date || '-'} />
                    <InfoTile label="完成/归档" value={taskDetail.completed_at || taskDetail.archived_at || '-'} />
                  </div>

                  <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 p-4 text-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <BarChart3 className="w-4 h-4 text-slate-500" />
                      <span className="font-medium text-slate-700">任务概况</span>
                    </div>
                    <div className="text-slate-600 leading-6">
                      <span className="mr-4">筛选日期：{taskDetail.filter_date || taskDetail.baseline_date || '-'}</span>
                      <span className="mr-4">门店列表：{taskDetail.store_count} 家</span>
                      <span>总结状态：{taskDetail.summary_status || '未生成'}</span>
                    </div>
                  </div>

                  {taskDetail.summary && (
                    <div className="mt-4 rounded-lg border border-primary-100 bg-primary-50/60 p-4">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="text-sm font-medium text-primary-900">
                          {taskDetail.summary.summary_type || '任务总结'} · {taskDetail.summary.confirm_status || '待确认'}
                        </div>
                        {canConfirmSummary && (
                          <button
                            onClick={() => {
                              setSummaryDraft(taskDetail.summary?.content || taskDetail.summary?.draft_content || '')
                              setShowSummaryModal(true)
                            }}
                            className="text-xs text-primary-700 hover:text-primary-900"
                          >
                            编辑确认
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-primary-900 whitespace-pre-line line-clamp-4">{taskDetail.summary.content || taskDetail.summary.draft_content}</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-10 text-center text-slate-500">
                  {isTaskPage ? '未读取到任务详情，请返回任务列表重新进入' : '点击左侧任务查看详情'}
                </div>
              )}
            </div>

            {taskDetail && (
              <>
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">任务门店列表</h3>
                      <p className="text-xs text-slate-500">门店指标实时取自运营日报，默认按到店数、连续上榜天数等字段筛选</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <label className="relative flex items-center">
                        <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-slate-400" />
                        <input
                          value={storeKeyword}
                          onChange={(e) => setStoreKeyword(e.target.value)}
                          className="h-8 w-64 rounded-lg border border-slate-300 pl-7 pr-3 text-xs"
                          placeholder="搜索店编号/店简称/跟进次数"
                        />
                      </label>
                      <label className="flex items-center gap-2">
                        <span className="text-slate-500">到店数&lt;</span>
                        <input value={visitThreshold} onChange={(e) => setVisitThreshold(e.target.value)} className="w-20 border border-slate-300 rounded-lg px-2 py-1" />
                      </label>
                      <label className="flex items-center gap-2">
                        <span className="text-slate-500">连续上榜</span>
                        <input value={continuousThreshold} onChange={(e) => setContinuousThreshold(e.target.value)} className="w-20 border border-slate-300 rounded-lg px-2 py-1" />
                      </label>
                      <select value={storeSort} onChange={(e) => setStoreSort(e.target.value as typeof storeSort)} className="border border-slate-300 rounded-lg px-2 py-1">
                        <option value="continuous_days">连续上榜</option>
                        <option value="visit_count">到店数</option>
                        <option value="wow_visit_rate">环比上周</option>
                        <option value="mom_visit_rate">环比上月</option>
                      </select>
                      <button onClick={() => setStoreSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))} className="px-2 py-1 border border-slate-300 rounded-lg">
                        {storeSortOrder === 'desc' ? '降序' : '升序'}
                      </button>
                      {canEditTaskStores && (
                        <button onClick={openAppendStoresModal} className="px-2 py-1 bg-slate-900 text-white rounded-lg hover:bg-slate-800">
                          增加门店
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-4 py-3 text-left whitespace-nowrap">店编号</th>
                          <th className="px-4 py-3 text-left whitespace-nowrap">店简称</th>
                          <th className="px-4 py-3 text-left whitespace-nowrap">大区</th>
                          <th className="px-4 py-3 text-left whitespace-nowrap">战区</th>
                          <th className="px-4 py-3 text-left whitespace-nowrap">到店数</th>
                          <th className="px-4 py-3 text-left whitespace-nowrap">到店率</th>
                          <th className="px-4 py-3 text-left whitespace-nowrap">环比上周</th>
                          <th className="px-4 py-3 text-left whitespace-nowrap">环比上月</th>
                          <th className="px-4 py-3 text-left whitespace-nowrap">连续上榜</th>
                          <th className="px-4 py-3 text-left whitespace-nowrap">跟进次数</th>
                          <th className="px-4 py-3 text-left whitespace-nowrap">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleStores.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="px-4 py-10 text-center text-slate-500">当前筛选条件下暂无门店</td>
                          </tr>
                        ) : (
                          visibleStores.map((store) => (
                            <tr key={store.store_code} className="border-t border-slate-100 hover:bg-slate-50">
                              <td className="px-4 py-3 font-mono">{store.store_code}</td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-slate-900">{store.store_name}</div>
                                <div className="text-xs text-slate-400">{store.report_date || ''}</div>
                              </td>
                              <td className="px-4 py-3">{store.region || '-'}</td>
                              <td className="px-4 py-3">{store.zone || '-'}</td>
                              <td className="px-4 py-3">{fmtNum(store.visit_count)}</td>
                              <td className="px-4 py-3">{Number(store.visit_rate || 0).toFixed(2)}%</td>
                              <td className="px-4 py-3">
                                <span className={store.wow_visit_rate != null && store.wow_visit_rate < 0 ? 'text-red-600' : 'text-emerald-600'}>
                                  {fmtRate(store.wow_visit_rate)}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={store.mom_visit_rate != null && store.mom_visit_rate < 0 ? 'text-red-600' : 'text-emerald-600'}>
                                  {fmtRate(store.mom_visit_rate)}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                                  连续 {store.continuous_days} 次
                                </span>
                              </td>
                              <td className="px-4 py-3">{store.follow_count}</td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-2">
                                  <Link to={`/store_detail/${encodeURIComponent(store.store_code)}`} className="text-primary-600 hover:text-primary-800 text-xs">档案</Link>
                                  <Link to="/store_management" className="text-primary-600 hover:text-primary-800 text-xs">管理</Link>
                                  {canEditFollowRecord && (
                                    <button
                                      onClick={() => {
                                        setEditingFollowStore(store)
                                        setFollowForm({ reasons: [], remark: '' })
                                      }}
                                      className="text-primary-600 hover:text-primary-800 text-xs"
                                    >
                                      跟进
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-200">
                      <h3 className="text-base font-semibold text-slate-900">跟进记录</h3>
                    </div>
                    <div className="max-h-[360px] overflow-y-auto">
                      {taskDetail.follow_records.length === 0 ? (
                        <div className="p-6 text-center text-slate-500">暂无跟进记录</div>
                      ) : (
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 text-slate-500 sticky top-0">
                            <tr>
                              <th className="px-4 py-3 text-left whitespace-nowrap">门店</th>
                              <th className="px-4 py-3 text-left whitespace-nowrap">原因</th>
                              <th className="px-4 py-3 text-left whitespace-nowrap">跟进人</th>
                              <th className="px-4 py-3 text-left whitespace-nowrap">时间</th>
                            </tr>
                          </thead>
                          <tbody>
                            {taskDetail.follow_records.map((row) => (
                              <tr key={row.record_id} className="border-t border-slate-100">
                                <td className="px-4 py-3">
                                  <div className="font-medium text-slate-900">{row.store_name}</div>
                                  <div className="text-xs text-slate-400">{row.store_code}</div>
                                </td>
                                <td className="px-4 py-3">{row.reason || '-'}</td>
                                <td className="px-4 py-3">{row.operator || '-'}</td>
                                <td className="px-4 py-3 whitespace-nowrap">{row.follow_time || row.created_at || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-200">
                      <h3 className="text-base font-semibold text-slate-900">任务历史</h3>
                    </div>
                    <div className="max-h-[360px] overflow-y-auto">
                      {taskDetail.history.length === 0 ? (
                        <div className="p-6 text-center text-slate-500">暂无历史记录</div>
                      ) : (
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 text-slate-500 sticky top-0">
                            <tr>
                              <th className="px-4 py-3 text-left whitespace-nowrap">操作</th>
                              <th className="px-4 py-3 text-left whitespace-nowrap">结果</th>
                              <th className="px-4 py-3 text-left whitespace-nowrap">操作人</th>
                              <th className="px-4 py-3 text-left whitespace-nowrap">时间</th>
                            </tr>
                          </thead>
                          <tbody>
                            {taskDetail.history.map((row, index) => (
                              <tr key={index} className="border-t border-slate-100">
                                <td className="px-4 py-3">{row.操作类型 || '-'}</td>
                                <td className="px-4 py-3">{row.操作后状态 || '-'}</td>
                                <td className="px-4 py-3">{row.操作人 || '-'}</td>
                                <td className="px-4 py-3 whitespace-nowrap">{row.操作时间 || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>
          )}
        </div>

        {!isTaskPage && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ShortcutCard
            title="门店档案"
            description="查看单店趋势、跟进历史、原因分布"
            href="/store_profile"
            icon={Store}
            accent="bg-blue-500"
          />
          <ShortcutCard
            title="门店管理"
            description="维护治理状态、评级和备注"
            href="/store_management"
            icon={Building2}
            accent="bg-emerald-500"
          />
          <ShortcutCard
            title="跟进次数分布"
            description="查看现有跟进分布入口"
            href="/follow-up/distribution"
            icon={ClipboardList}
            accent="bg-orange-500"
          />
        </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div
            className="bg-white rounded-lg shadow-xl w-[min(96vw,1380px)] max-h-[96vh] overflow-hidden flex flex-col"
            style={{ transform: `translate(${createModalOffset.x}px, ${createModalOffset.y}px)` }}
          >
            <div
              onMouseDown={startCreateModalDrag}
              className="px-5 py-4 border-b border-slate-200 flex cursor-move select-none items-center justify-between"
            >
              <h2 className="text-lg font-semibold text-slate-900">{taskStorePickerMode === 'append' ? '增加任务门店' : '新建异常门店治理任务'}</h2>
              <button onMouseDown={(event) => event.stopPropagation()} onClick={closeCreateModal} className="text-slate-500 hover:text-slate-900">关闭</button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4">
              {taskStorePickerMode === 'create' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-slate-500">任务维度</span>
                  <select value={createForm.dimension} onChange={(e) => setCreateForm({ ...createForm, dimension: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                    <option value="周任务">周任务</option>
                    <option value="日任务">日任务</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-slate-500">任务名称</span>
                  <input value={createForm.task_name} onChange={(e) => setCreateForm({ ...createForm, task_name: e.target.value })} placeholder="留空自动生成" className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </label>
              </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <label className="block">
                  <span className="text-xs text-slate-500">门店关键词</span>
                  <input value={createForm.keyword} onChange={(e) => setCreateForm({ ...createForm, keyword: e.target.value })} placeholder="店编号/店简称" className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </label>
                <label className="block">
                  <span className="text-xs text-slate-500">到店数&lt;</span>
                  <input value={createForm.min_visit_count} onChange={(e) => setCreateForm({ ...createForm, min_visit_count: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </label>
                <label className="block">
                  <span className="text-xs text-slate-500">到店率&lt;%</span>
                  <input value={createForm.max_visit_rate} onChange={(e) => setCreateForm({ ...createForm, max_visit_rate: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </label>
                <label className="block">
                  <span className="text-xs text-slate-500">环比上周</span>
                  <input value={createForm.min_wow_decline_rate} onChange={(e) => setCreateForm({ ...createForm, min_wow_decline_rate: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </label>
                <label className="block">
                  <span className="text-xs text-slate-500">环比上月</span>
                  <input value={createForm.min_mom_decline_rate} onChange={(e) => setCreateForm({ ...createForm, min_mom_decline_rate: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-slate-500">店编号</span>
                  <textarea
                    value={createForm.store_codes_text}
                    onChange={(e) => setCreateForm({ ...createForm, store_codes_text: e.target.value })}
                    rows={3}
                    placeholder="支持输入多个店编号，换行、空格、逗号分隔"
                    className="mt-1 min-h-20 w-full resize rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-slate-500">店简称</span>
                  <textarea
                    value={createForm.store_names_text}
                    onChange={(e) => setCreateForm({ ...createForm, store_names_text: e.target.value })}
                    rows={3}
                    placeholder="支持输入多个店简称，换行、空格、逗号分隔"
                    className="mt-1 min-h-20 w-full resize rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                  />
                </label>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">环比下降默认比较指标为到店数。</p>
                <div className="flex gap-2">
                  <button onClick={previewStores} disabled={actionLoading} className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50">
                    <Search className={`w-4 h-4 ${actionLoading ? 'animate-pulse' : ''}`} />
                    {actionLoading ? '预览中' : '预览'}
                  </button>
                  <button
                    onClick={taskStorePickerMode === 'append' ? appendStoresToTask : createTask}
                    disabled={actionLoading || selectedPreviewStores.size === 0}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {taskStorePickerMode === 'append' ? '保存门店' : '保存任务'}
                  </button>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 text-sm text-slate-600">
                  预览结果：{preview ? `${preview.total} 家门店 · 已选择 ${selectedPreviewStores.size} 家 · 月累计截止日期：${preview.report_date}` : '请先点击预览'}
                </div>
	                <div className="max-h-[58vh] min-h-[360px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white text-slate-500 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left w-12">
                          <input
                            type="checkbox"
                            checked={Boolean(preview?.stores?.length) && selectedPreviewStores.size === preview?.stores?.length}
                            onChange={(e) => {
                              setSelectedPreviewStores(e.target.checked ? new Set((preview?.stores || []).map((store) => store.store_code)) : new Set())
                            }}
                          />
                        </th>
                        <th className="px-4 py-3 text-left">店编号</th>
                        <th className="px-4 py-3 text-left">店简称</th>
                        <th className="px-4 py-3 text-left">到店数</th>
                        <th className="px-4 py-3 text-left">到店率</th>
                        <th className="px-4 py-3 text-left">环比上周</th>
                        <th className="px-4 py-3 text-left">环比上月</th>
                      </tr>
                    </thead>
                    <tbody>
	                      {(preview?.stores || []).map((store) => (
	                        <tr
                            key={store.store_code}
                            onClick={() => togglePreviewStore(store.store_code)}
                            className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${selectedPreviewStores.has(store.store_code) ? 'bg-primary-50/60' : ''}`}
                          >
	                          <td className="px-4 py-3">
	                            <input
	                              type="checkbox"
	                              checked={selectedPreviewStores.has(store.store_code)}
	                              onClick={(event) => event.stopPropagation()}
	                              onChange={() => togglePreviewStore(store.store_code)}
	                            />
	                          </td>
                          <td className="px-4 py-3 font-mono">{store.store_code}</td>
                          <td className="px-4 py-3">{store.store_name}</td>
                          <td className="px-4 py-3">{fmtNum(store.visit_count)}</td>
                          <td className="px-4 py-3">{Number(store.visit_rate || 0).toFixed(2)}%</td>
                          <td className="px-4 py-3">{fmtRate(store.wow_visit_rate)}</td>
                          <td className="px-4 py-3">{fmtRate(store.mom_visit_rate)}</td>
                        </tr>
                      ))}
                      {preview && preview.stores.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-10 text-center text-slate-500">当前条件下暂无门店</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingFollowStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4">
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-slate-600" />
                <h2 className="text-lg font-semibold text-slate-900">填写跟进原因</h2>
              </div>
              <button onClick={() => setEditingFollowStore(null)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="关闭">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
                <div className="rounded-lg bg-slate-50 p-5 text-sm">
                  <div className="grid grid-cols-[68px_minmax(0,1fr)] gap-x-2 gap-y-1">
                    <span className="text-slate-500">店编号</span>
                    <strong className="font-semibold text-slate-900">{editingFollowStore.store_code}</strong>
                    <span className="text-slate-500">店简称</span>
                    <strong className="font-semibold text-slate-900">{editingFollowStore.store_name}</strong>
                    <span className="text-slate-500">大区</span>
                    <strong className="font-semibold text-slate-900">{editingFollowStore.region || '-'}</strong>
                  </div>
                </div>

                <div className="grid grid-cols-3 overflow-hidden rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/20">
                  <MetricBlock label="线索量" value={fmtNum(editingFollowStore.local_lead_count)} />
                  <MetricBlock label="到店数" value={fmtNum(editingFollowStore.visit_count)} />
                  <MetricBlock label="到店率" value={`${Number(editingFollowStore.visit_rate || 0).toFixed(2)}%`} />
                </div>
              </div>

              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">选择跟进原因（可多选）</h3>
                <button type="button" onClick={openReasonModal} className="text-xs font-medium text-primary-600 hover:text-primary-800">配置原因</button>
              </div>

              <div className="space-y-4">
                {groupedFollowReasons.map((group) => (
                  <section key={group.title}>
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary-600">
                      <Folder className="h-4 w-4" />
                      {group.title}
                    </div>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {group.reasons.map((reason) => {
                        const checked = followForm.reasons.includes(reason.name)
                        return (
                          <button
                            key={reason.name}
                            type="button"
                            onClick={() => toggleFollowReason(reason.name)}
                            className={`flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                              checked
                                ? 'border-primary-300 bg-primary-50 text-primary-800'
                                : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white'
                            }`}
                          >
                            <span className={`grid h-4 w-4 flex-none place-items-center rounded border ${checked ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-400 bg-white'}`}>
                              {checked && <Check className="h-3 w-3" />}
                            </span>
                            <span className="font-medium">{reason.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  </section>
                ))}
                {enabledFollowReasons.length === 0 && (
                  <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
                    当前没有启用的跟进原因，请先维护配置。
                  </div>
                )}
              </div>

              <label className="mt-6 block">
                <span className="text-sm font-semibold text-slate-900">备注说明</span>
                <textarea
                  value={followForm.remark}
                  onChange={(e) => setFollowForm({ ...followForm, remark: e.target.value })}
                  rows={5}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                  placeholder="如有额外说明，请在此补充..."
                />
              </label>

              <section className="mt-6">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">跟进历史记录</h3>
                <div className="rounded-lg bg-slate-50 p-5">
                  {currentStoreFollowRecords.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 py-4 text-sm text-slate-500">
                      <ClipboardList className="h-4 w-4" />
                      暂无跟进记录
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {currentStoreFollowRecords.map((record) => (
                        <div key={record.record_id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <strong className="text-slate-900">{record.reason || '未填写原因'}</strong>
                            <span className="text-xs text-slate-500">{record.follow_time || record.created_at || '-'}</span>
                          </div>
                          {record.remark && <p className="mt-2 text-slate-600">{record.remark}</p>}
                          <p className="mt-2 text-xs text-slate-400">跟进人：{record.operator || '-'}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
              <button onClick={() => setEditingFollowStore(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">取消</button>
              <button
                onClick={saveFollowRecord}
                disabled={actionLoading || !canEditFollowRecord || (followForm.reasons.length === 0 && !followForm.remark)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {showReasonModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div
            className="bg-white rounded-lg shadow-xl w-[min(96vw,1380px)] max-h-[96vh] min-h-[72vh] overflow-hidden flex flex-col"
            style={{ transform: `translate(${reasonModalOffset.x}px, ${reasonModalOffset.y}px)` }}
          >
            <div
              className="px-5 py-4 border-b border-slate-200 flex items-center justify-between cursor-move select-none"
              onMouseDown={startReasonModalDrag}
            >
              <div>
                <h2 className="text-lg font-semibold text-slate-900">跟进原因配置</h2>
                <p className="text-xs text-slate-500">启用的原因会出现在跟进记录选择项中</p>
              </div>
              <button
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => setShowReasonModal(false)}
                className="text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                关闭
              </button>
            </div>
            <div className="p-5 grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 overflow-hidden">
              <div className="border border-slate-200 rounded-lg overflow-auto min-h-[56vh] max-h-[76vh]">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">类型</th>
                      <th className="px-4 py-3 text-left">一级/二级原因</th>
                      <th className="px-4 py-3 text-left">所属一级原因</th>
                      <th className="px-4 py-3 text-left">状态</th>
                      <th className="px-4 py-3 text-left">排序</th>
                      <th className="px-4 py-3 text-left">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {followReasons.map((reason) => (
                      <tr key={reason.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${reason.parent_id === 0 ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                            {reason.parent_id === 0 ? '一级原因' : '二级原因'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-900">{reason.name}</td>
                        <td className="px-4 py-3 text-slate-500">{reason.parent_id === 0 ? '-' : reason.parent_name || '未设置'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${(reason.status || '启用') === '启用' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {reason.status || '启用'}
                          </span>
                        </td>
                        <td className="px-4 py-3">{reason.sort_order ?? '-'}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => openEditReason(reason)} className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-800">
                              <Pencil className="w-3.5 h-3.5" />
                              编辑
                            </button>
                            {canManageFollowReasons && (
                              <button onClick={() => deleteFollowReason(reason)} className="inline-flex items-center gap-1 text-red-600 hover:text-red-700">
                                <Trash2 className="w-3.5 h-3.5" />
                                删除
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {followReasons.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-slate-500">暂无跟进原因配置</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="border border-slate-200 rounded-lg p-4 h-fit max-h-[76vh] overflow-y-auto">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">{editingReason ? '编辑配置' : '新增配置'}</h3>
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs text-slate-500">配置类型</span>
                    <select
                      value={reasonForm.is_group ? 'group' : 'reason'}
                      onChange={(e) => setReasonForm({ ...reasonForm, is_group: e.target.value === 'group', parent_id: e.target.value === 'group' ? '' : String(configuredReasonGroups[0]?.id || '') })}
                      className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                      disabled={!canManageFollowReasons || Boolean(editingReason)}
                    >
                      <option value="reason">二级原因</option>
                      <option value="group">一级原因</option>
                    </select>
                  </label>
                  {!reasonForm.is_group && (
                    <label className="block">
                      <span className="text-xs text-slate-500">所属一级原因</span>
                      <select
                        value={reasonForm.parent_id}
                        onChange={(e) => setReasonForm({ ...reasonForm, parent_id: e.target.value })}
                        className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                        disabled={!canManageFollowReasons}
                      >
                        <option value="">未设置</option>
                        {configuredReasonGroups.map((group) => (
                          <option key={group.id} value={group.id}>{group.name}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="block">
                    <span className="text-xs text-slate-500">{reasonForm.is_group ? '一级原因名称' : '二级原因名称'}</span>
                    <input value={reasonForm.name} onChange={(e) => setReasonForm({ ...reasonForm, name: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder={reasonForm.is_group ? '例如：客流承接问题' : '例如：到店率偏低，已提醒门店'} disabled={!canManageFollowReasons} />
                  </label>
                  <label className="block">
                    <span className="text-xs text-slate-500">状态</span>
                    <select value={reasonForm.status} onChange={(e) => setReasonForm({ ...reasonForm, status: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" disabled={!canManageFollowReasons}>
                      <option value="启用">启用</option>
                      <option value="停用">停用</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs text-slate-500">排序</span>
                    <input value={reasonForm.sort_order} onChange={(e) => setReasonForm({ ...reasonForm, sort_order: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="留空自动追加" disabled={!canManageFollowReasons} />
                  </label>
                  {!canManageFollowReasons && (
                    <p className="text-xs text-slate-500">当前账号只能查看原因配置。</p>
                  )}
                  <div className="flex justify-end gap-2 pt-1">
                    {editingReason && (
                      <button onClick={() => { setEditingReason(null); setReasonForm({ name: '', status: '启用', sort_order: '', parent_id: String(configuredReasonGroups[0]?.id || ''), is_group: false }) }} className="px-3 py-2 text-sm border border-slate-300 rounded-lg">取消编辑</button>
                    )}
                    <button onClick={saveFollowReason} disabled={actionLoading || !canManageFollowReasons || !reasonForm.name.trim()} className="px-3 py-2 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50">
                      {editingReason ? '保存修改' : '新增配置'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSummaryModal && taskDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">确认任务总结</h2>
              <button onClick={() => setShowSummaryModal(false)} className="text-slate-500 hover:text-slate-900">关闭</button>
            </div>
            <div className="p-5 space-y-4">
              <textarea value={summaryDraft} onChange={(e) => setSummaryDraft(e.target.value)} rows={12} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">总结需人工确认后才会入库。</p>
                <button onClick={confirmSummary} disabled={actionLoading || !canConfirmSummary || !summaryDraft.trim()} className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">确认保存</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <Icon className="w-5 h-5 text-slate-500 mb-3" />
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-2xl font-semibold text-slate-900 mt-1">{value}</div>
    </div>
  )
}

function InfoTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-medium text-slate-900 mt-1">{value}</div>
    </div>
  )
}

function ShortcutCard({
  title,
  description,
  href,
  icon: Icon,
  accent,
}: {
  title: string
  description: string
  href: string
  icon: LucideIcon
  accent: string
}) {
  return (
    <Link to={href} className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${accent} flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <div className="font-medium text-slate-900">{title}</div>
          <div className="text-xs text-slate-500 mt-0.5">{description}</div>
        </div>
        <ArrowUpRight className="w-4 h-4 text-slate-400" />
      </div>
    </Link>
  )
}

export default FollowUp
