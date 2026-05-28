export interface StoreRow {
  store_code: string
  store_name: string
  region: string
  zone: string
  region_supervisor?: string
  region_manager?: string
  region_deputy_manager?: string
  zone_manager?: string
  inspector?: string
  source_store_status: string
  store_status: string
  governance_status: string
  store_rating: string
  status_note: string
  admin_note: string
  updated_at: string
  follow_count: number
  first_follow_time: string
  latest_follow_time: string
  reason_summary: string
  avg_local_lead_count: number
  avg_visit_count: number
  avg_visit_rate: number
  monthly_summary?: {
    report_date: string
    month_start: string
    lead_count: number
    visit_count: number
    visit_rate: number
  }
}

export interface StatusOption {
  id: number
  name: string
  color: string
  sort_order: number
  config_type: string
  enabled?: number
  description?: string
}

export interface StoreFilters {
  regions: string[]
  zones: string[]
  region_zones?: Record<string, string[]>
  source_store_statuses: string[]
  store_statuses: StatusOption[]
  governance_statuses: StatusOption[]
  ratings: StatusOption[]
}

export interface Pagination {
  total: number
  page: number
  page_size: number
  total_pages: number
}

export const fmt = (value: number | null | undefined, digits = 1) => {
  if (value == null || Number.isNaN(Number(value))) return '-'
  return Number(value).toFixed(digits)
}

export const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const daysAgo = (days: number) => {
  const d = new Date(Date.now() - days * 86400000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
