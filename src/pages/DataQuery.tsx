import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Search,
  Table2,
  BarChart3,
  Download,
  Filter,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Clock,
  X,
  ArrowLeft,
  Sparkles,
  SlidersHorizontal,
  SearchIcon,
  Calendar,
  MapPin,
  Hash,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'

const API_BASE = '/api'

interface ColumnMeta {
  name: string
  type: string
  display_name: string
  searchable: boolean
  filterable: boolean
  groupable: boolean
  aggregatable: boolean
  sensitive: boolean
}

interface TableInfo {
  name: string
  display_name: string
  category: string
  column_count: number
}

interface FilterCondition {
  id: string
  field: string
  operator: string
  value: string
  value2: string
}

interface AggregationItem {
  id: string
  field: string
  func: string
  alias: string
}

type QueryMode = 'detail' | 'aggregate'

const OPERATORS = [
  { label: '等于', value: '=' },
  { label: '不等于', value: '!=' },
  { label: '大于', value: '>' },
  { label: '大于等于', value: '>=' },
  { label: '小于', value: '<' },
  { label: '小于等于', value: '<=' },
  { label: '包含', value: 'LIKE' },
  { label: '不包含', value: 'NOT LIKE' },
  { label: '在列表中', value: 'IN' },
  { label: '不在列表中', value: 'NOT IN' },
  { label: '介于', value: 'BETWEEN' },
  { label: '为空', value: 'IS NULL' },
  { label: '不为空', value: 'IS NOT NULL' },
]

const AGGREGATION_FUNCS = [
  { label: '计数', value: 'COUNT' },
  { label: '求和', value: 'SUM' },
  { label: '平均', value: 'AVG' },
  { label: '最小值', value: 'MIN' },
  { label: '最大值', value: 'MAX' },
]

const DataQuery = () => {
  const { hasPermission } = useAuth()
  const canExecuteDetail = hasPermission('data_query.detail.execute')
  const canExecuteAggregate = hasPermission('data_query.aggregate.execute')
  const canUseAdvancedFilter = hasPermission('data_query.advanced_filter')
  const canViewHistory = hasPermission('data_query.history.view')
  const canExport = hasPermission('data_query.export')
  const [queryMode, setQueryMode] = useState<QueryMode>('detail')
  const [tables, setTables] = useState<TableInfo[]>([])
  const [selectedTable, setSelectedTable] = useState('')
  const [columns, setColumns] = useState<ColumnMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [queryResult, setQueryResult] = useState<any[]>([])
  const [pagination, setPagination] = useState({ page: 1, page_size: 20, total: 0, total_pages: 0 })
  const [filters, setFilters] = useState<FilterCondition[]>([])
  const [groupBy, setGroupBy] = useState<string[]>([])
  const [aggregations, setAggregations] = useState<AggregationItem[]>([])
  const [orderBy, setOrderBy] = useState<{ field: string; desc: boolean }>({ field: '', desc: false })
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])
  const [queryHistory, setQueryHistory] = useState<any[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchField, setSearchField] = useState('')

  useEffect(() => {
    fetchTables()
    if (canViewHistory) {
      loadQueryHistory()
    }
  }, [canViewHistory])

  useEffect(() => {
    if (queryMode === 'detail' && !canExecuteDetail && canExecuteAggregate) {
      setQueryMode('aggregate')
      setShowAdvanced(false)
    }
    if (queryMode === 'aggregate' && !canExecuteAggregate && canExecuteDetail) {
      setQueryMode('detail')
    }
  }, [canExecuteAggregate, canExecuteDetail, queryMode])

  const fetchTables = async () => {
    try {
      const res = await fetch(`${API_BASE}/query/tables`)
      const result = await res.json()
      if (result.success) {
        setTables(result.data)
      }
    } catch (e) {
      console.error('Failed to fetch tables:', e)
    }
  }

  const fetchTableSchema = async (tableName: string) => {
    try {
      const res = await fetch(`${API_BASE}/query/table/${tableName}/schema`)
      const result = await res.json()
      if (result.success) {
        setColumns(result.data.columns)
        setSelectedColumns(result.data.columns.map((c: ColumnMeta) => c.name))
        const searchableCols = result.data.columns.filter((c: ColumnMeta) => c.searchable)
        if (searchableCols.length > 0) {
          setSearchField(searchableCols[0].name)
        }
      }
    } catch (e) {
      console.error('Failed to fetch schema:', e)
    }
  }

  const handleTableChange = (tableName: string) => {
    setSelectedTable(tableName)
    fetchTableSchema(tableName)
    setFilters([])
    setGroupBy([])
    setAggregations([])
    setOrderBy({ field: '', desc: false })
    setQueryResult([])
    setSearchKeyword('')
    setShowAdvanced(false)
  }

  const addFilter = () => {
    setFilters([
      ...filters,
      {
        id: Date.now().toString(),
        field: '',
        operator: '=',
        value: '',
        value2: '',
      },
    ])
  }

  const removeFilter = (id: string) => {
    setFilters(filters.filter((f) => f.id !== id))
  }

  const updateFilter = (id: string, field: string, value: string) => {
    setFilters(filters.map((f) => (f.id === id ? { ...f, [field]: value } : f)))
  }

  const addAggregation = () => {
    setAggregations([
      ...aggregations,
      {
        id: Date.now().toString(),
        field: '*',
        func: 'COUNT',
        alias: '',
      },
    ])
  }

  const removeAggregation = (id: string) => {
    setAggregations(aggregations.filter((a) => a.id !== id))
  }

  const updateAggregation = (id: string, field: string, value: string) => {
    setAggregations(aggregations.map((a) => (a.id === id ? { ...a, [field]: value } : a)))
  }

  const executeQuery = useCallback(async () => {
    if (queryMode === 'detail' && !canExecuteDetail) {
      setError('当前账号没有执行明细查询权限')
      return
    }
    if (queryMode === 'aggregate' && !canExecuteAggregate) {
      setError('当前账号没有执行聚合查询权限')
      return
    }
    if (!selectedTable) {
      setError('请选择查询表')
      return
    }

    setLoading(true)
    setError('')

    try {
      let builtFilters: any[] = []

      if (queryMode === 'detail' && !showAdvanced && searchKeyword.trim()) {
        if (searchField) {
          builtFilters = [{ field: searchField, operator: 'LIKE', value: `%${searchKeyword.trim()}%` }]
        } else {
          const searchableCols = columns.filter((c) => c.searchable && c.type.includes('VARCHAR'))
          if (searchableCols.length > 0) {
            builtFilters = searchableCols.slice(0, 5).map((c) => ({
              field: c.name,
              operator: 'LIKE',
              value: `%${searchKeyword.trim()}%`,
            }))
          }
        }
      } else {
        const validFilters = filters.filter((f) => f.field && f.operator)
        builtFilters = validFilters.map((f) => {
          if (f.operator === 'IS NULL' || f.operator === 'IS NOT NULL') {
            return { field: f.field, operator: f.operator }
          }
          if (f.operator === 'IN' || f.operator === 'NOT IN') {
            const values = f.value.split(',').map((v) => v.trim())
            return { field: f.field, operator: f.operator, value: values }
          }
          if (f.operator === 'BETWEEN' || f.operator === 'NOT BETWEEN') {
            return { field: f.field, operator: f.operator, value: f.value, value2: f.value2 }
          }
          if (f.operator === 'LIKE' || f.operator === 'NOT LIKE') {
            return { field: f.field, operator: f.operator, value: f.value }
          }
          return { field: f.field, operator: f.operator, value: f.value }
        })
      }

      let url: string
      let body: any

      if (queryMode === 'detail') {
        url = `${API_BASE}/query/detail`
        body = {
          table: selectedTable,
          columns: selectedColumns.length > 0 ? selectedColumns : ['*'],
          filters: builtFilters,
          order_by: orderBy.field ? [orderBy] : [],
          page: pagination.page,
          page_size: pagination.page_size,
        }
      } else {
        url = `${API_BASE}/query/aggregate`
        body = {
          table: selectedTable,
          group_by: groupBy,
          aggregations: aggregations.map((a) => ({
            field: a.field,
            func: a.func,
            alias: a.alias || `${a.func.toLowerCase()}_${a.field}`,
          })),
          filters: builtFilters,
          order_by: orderBy.field ? [orderBy] : [],
          page: pagination.page,
          page_size: pagination.page_size,
        }
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const result = await res.json()

      if (result.success) {
        setQueryResult(result.data.list)
        setPagination(result.data.pagination)
        if (canViewHistory) {
          saveToHistory({ mode: queryMode, table: selectedTable, filters: builtFilters, time: new Date().toISOString() })
        }
      } else {
        setError(result.message || '查询失败')
      }
    } catch (e: any) {
      setError(e.message || '查询失败')
    } finally {
      setLoading(false)
    }
  }, [canExecuteAggregate, canExecuteDetail, canViewHistory, selectedTable, queryMode, filters, groupBy, aggregations, orderBy, selectedColumns, pagination.page, pagination.page_size, searchKeyword, searchField, columns, showAdvanced])

  const handleExport = async () => {
    if (!canExport) {
      setError('当前账号没有导出查询结果权限')
      return
    }
    if (!selectedTable) {
      setError('请先执行查询')
      return
    }

    try {
      let builtFilters: any[] = []
      if (queryMode === 'detail' && !showAdvanced && searchKeyword.trim()) {
        if (searchField) {
          builtFilters = [{ field: searchField, operator: 'LIKE', value: `%${searchKeyword.trim()}%` }]
        }
      } else {
        const validFilters = filters.filter((f) => f.field && f.operator)
        builtFilters = validFilters.map((f) => {
          if (f.operator === 'IS NULL' || f.operator === 'IS NOT NULL') {
            return { field: f.field, operator: f.operator }
          }
          if (f.operator === 'IN' || f.operator === 'NOT IN') {
            const values = f.value.split(',').map((v) => v.trim())
            return { field: f.field, operator: f.operator, value: values }
          }
          if (f.operator === 'BETWEEN' || f.operator === 'NOT BETWEEN') {
            return { field: f.field, operator: f.operator, value: f.value, value2: f.value2 }
          }
          if (f.operator === 'LIKE' || f.operator === 'NOT LIKE') {
            return { field: f.field, operator: f.operator, value: `%${f.value}%` }
          }
          return { field: f.field, operator: f.operator, value: f.value }
        })
      }

      const res = await fetch(`${API_BASE}/query/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query_type: queryMode,
          table: selectedTable,
          columns: queryMode === 'detail' ? (selectedColumns.length > 0 ? selectedColumns : ['*']) : undefined,
          group_by: queryMode === 'aggregate' ? groupBy : undefined,
          aggregations:
            queryMode === 'aggregate'
              ? aggregations.map((a) => ({
                  field: a.field,
                  func: a.func,
                  alias: a.alias || `${a.func.toLowerCase()}_${a.field}`,
                }))
              : undefined,
          filters: builtFilters,
          order_by: orderBy.field ? [orderBy] : [],
        }),
      })

      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `query_export_${Date.now()}.xlsx`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        const result = await res.json()
        setError(result.message || '导出失败')
      }
    } catch (e: any) {
      setError(e.message || '导出失败')
    }
  }

  const saveToHistory = (item: any) => {
    if (!canViewHistory) return
    const history = JSON.parse(localStorage.getItem('queryHistory') || '[]')
    const newHistory = [item, ...history.slice(0, 19)]
    localStorage.setItem('queryHistory', JSON.stringify(newHistory))
    setQueryHistory(newHistory)
  }

  const loadQueryHistory = () => {
    if (!canViewHistory) return
    const history = JSON.parse(localStorage.getItem('queryHistory') || '[]')
    setQueryHistory(history)
  }

  const clearHistory = () => {
    if (!canViewHistory) return
    localStorage.removeItem('queryHistory')
    setQueryHistory([])
  }

  const searchableColumns = columns.filter((c) => c.searchable && c.type.includes('VARCHAR'))
  const filterableColumns = columns.filter((c) => c.filterable)
  const groupableColumns = columns.filter((c) => c.groupable)
  const aggregatableColumns = columns.filter((c) => c.aggregatable || ['INTEGER', 'BIGINT', 'DOUBLE', 'FLOAT', 'DECIMAL'].includes(c.type))

  const getColumnDisplayName = (name: string) => {
    const col = columns.find((c) => c.name === name)
    return col ? col.display_name : name
  }

  const formatCellValue = (value: any, colName: string) => {
    if (value === null || value === undefined) return '-'
    const col = columns.find((c) => c.name === colName)
    if (col?.type.includes('DATE') || col?.type.includes('TIMESTAMP')) {
      return String(value).replace('T', ' ').split('.')[0]
    }
    if (col?.type.includes('BOOL')) {
      return value ? '是' : '否'
    }
    return String(value)
  }

  const handleQuickSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canExecuteDetail) return
    if (searchKeyword.trim() || showAdvanced) {
      setPagination({ ...pagination, page: 1 })
      executeQuery()
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm shadow-sm border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <Link
                to="/"
                className="flex items-center gap-1 px-3 py-2 text-sm text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                返回首页
              </Link>
              <div className="w-px h-6 bg-slate-200" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">数据查询</h1>
                  <p className="text-xs text-slate-500">Universal Data Query</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center justify-between shadow-sm">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-500 mr-3" />
              <span className="text-red-700">{error}</span>
            </div>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Mode Switch */}
        <div className="flex justify-center mb-8">
          <div className="bg-white p-1.5 rounded-xl shadow-sm border border-slate-200 inline-flex gap-1">
            {canExecuteDetail && (
              <button
                onClick={() => { setQueryMode('detail'); setShowAdvanced(false) }}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-all ${
                  queryMode === 'detail'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <SearchIcon className="w-4 h-4" />
                精确查询
              </button>
            )}
            {canExecuteAggregate && (
              <button
                onClick={() => setQueryMode('aggregate')}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-all ${
                  queryMode === 'aggregate'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                聚合统计
              </button>
            )}
          </div>
        </div>

        {/* Table Selection */}
        <div className="max-w-md mx-auto mb-8">
          <label className="block text-sm font-medium text-slate-700 mb-2 text-center">选择数据表</label>
          <div className="relative">
            <Table2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <select
              value={selectedTable}
              onChange={(e) => handleTableChange(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm text-slate-900 appearance-none cursor-pointer"
            >
              <option value="">-- 请选择数据表 --</option>
              {tables.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.display_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedTable && (
          <>
            {/* Detail Mode - Search Interface */}
            {canExecuteDetail && queryMode === 'detail' && !showAdvanced && (
              <div className="max-w-3xl mx-auto mb-8">
                <form onSubmit={handleQuickSearch}>
                  <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
                    {/* Search Field Selector */}
                    <div className="border-b border-slate-100 px-4 py-3 flex items-center gap-3 bg-gradient-to-r from-slate-50 to-white">
                      <span className="text-sm text-slate-500 whitespace-nowrap">搜索字段：</span>
                      <select
                        value={searchField}
                        onChange={(e) => setSearchField(e.target.value)}
                        className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                      >
                        <option value="">自动搜索所有字段</option>
                        {searchableColumns.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.display_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Big Search Input */}
                    <div className="p-6">
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-400" />
                        <input
                          type="text"
                          value={searchKeyword}
                          onChange={(e) => setSearchKeyword(e.target.value)}
                          placeholder={`输入关键词搜索${selectedTable ? tables.find(t => t.name === selectedTable)?.display_name : ''}...`}
                          className="w-full pl-14 pr-32 py-4 text-lg bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-all placeholder:text-slate-400"
                        />
                        <button
                          type="submit"
                          disabled={loading || (!searchKeyword.trim() && !showAdvanced)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
                        >
                          {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            '搜索'
                          )}
                        </button>
                      </div>

                      {/* Quick Filter Tags */}
                      {searchableColumns.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <span className="text-xs text-slate-500 py-1">快捷搜索：</span>
                          {searchableColumns.slice(0, 6).map((col) => (
                            <button
                              key={col.name}
                              type="button"
                              onClick={() => {
                                setSearchField(col.name)
                                setSearchKeyword('')
                              }}
                              className={`px-3 py-1.5 text-xs rounded-full transition-all ${
                                searchField === col.name
                                  ? 'bg-blue-100 text-blue-700 border border-blue-200'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-transparent'
                              }`}
                            >
                              {col.display_name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </form>

                {/* Advanced Filter Toggle */}
                {canUseAdvancedFilter && (
                  <div className="mt-4 text-center">
                    <button
                      onClick={() => setShowAdvanced(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                    >
                      <SlidersHorizontal className="w-4 h-4" />
                      高级筛选（多条件组合查询）
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Advanced Filter Mode */}
            {canExecuteDetail && canUseAdvancedFilter && queryMode === 'detail' && showAdvanced && (
              <div className="max-w-3xl mx-auto mb-8">
                <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                      <Filter className="w-5 h-5 text-blue-600" />
                      高级筛选
                    </h3>
                    <button
                      onClick={() => setShowAdvanced(false)}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      返回快速搜索
                    </button>
                  </div>

                  <div className="space-y-4 mb-6">
                    {filters.map((filter) => (
                      <div key={filter.id} className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
                        <select
                          value={filter.field}
                          onChange={(e) => updateFilter(filter.id, 'field', e.target.value)}
                          className="flex-1 px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                        >
                          <option value="">选择字段</option>
                          {filterableColumns.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.display_name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={filter.operator}
                          onChange={(e) => updateFilter(filter.id, 'operator', e.target.value)}
                          className="w-32 px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                        >
                          {OPERATORS.map((op) => (
                            <option key={op.value} value={op.value}>
                              {op.label}
                            </option>
                          ))}
                        </select>
                        {!['IS NULL', 'IS NOT NULL'].includes(filter.operator) && (
                          <input
                            type="text"
                            value={filter.value}
                            onChange={(e) => updateFilter(filter.id, 'value', e.target.value)}
                            placeholder="输入值"
                            className="flex-1 px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                          />
                        )}
                        {['BETWEEN', 'NOT BETWEEN'].includes(filter.operator) && (
                          <input
                            type="text"
                            value={filter.value2}
                            onChange={(e) => updateFilter(filter.id, 'value2', e.target.value)}
                            placeholder="结束值"
                            className="flex-1 px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                          />
                        )}
                        <button
                          onClick={() => removeFilter(filter.id)}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={addFilter}
                      className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      添加条件
                    </button>
                  </div>

                  <button
                    onClick={executeQuery}
                    disabled={loading || filters.length === 0}
                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> : <Search className="w-5 h-5 inline mr-2" />}
                    执行查询
                  </button>
                </div>
              </div>
            )}

            {/* Aggregate Mode */}
            {canExecuteAggregate && queryMode === 'aggregate' && (
              <div className="max-w-3xl mx-auto mb-8">
                <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-blue-600" />
                    聚合配置
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-3">分组维度</label>
                      <div className="space-y-2 max-h-48 overflow-y-auto p-3 bg-slate-50 rounded-xl">
                        {groupableColumns.map((c) => (
                          <label key={c.name} className="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer transition-colors">
                            <input
                              type="checkbox"
                              checked={groupBy.includes(c.name)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setGroupBy([...groupBy, c.name])
                                } else {
                                  setGroupBy(groupBy.filter((g) => g !== c.name))
                                }
                              }}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-slate-700">{c.display_name}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <label className="block text-sm font-medium text-slate-700">聚合指标</label>
                        <button
                          onClick={addAggregation}
                          className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                        >
                          <Plus className="w-4 h-4 inline mr-1" />
                          添加
                        </button>
                      </div>
                      <div className="space-y-2 max-h-48 overflow-y-auto p-3 bg-slate-50 rounded-xl">
                        {aggregations.map((agg) => (
                          <div key={agg.id} className="flex items-center gap-2 p-2 bg-white rounded-lg">
                            <select
                              value={agg.field}
                              onChange={(e) => updateAggregation(agg.id, 'field', e.target.value)}
                              className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded"
                            >
                              <option value="*">所有记录</option>
                              {aggregatableColumns.map((c) => (
                                <option key={c.name} value={c.name}>
                                  {c.display_name}
                                </option>
                              ))}
                            </select>
                            <select
                              value={agg.func}
                              onChange={(e) => updateAggregation(agg.id, 'func', e.target.value)}
                              className="w-20 px-2 py-1.5 text-xs border border-slate-200 rounded"
                            >
                              {AGGREGATION_FUNCS.map((f) => (
                                <option key={f.value} value={f.value}>
                                  {f.label}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => removeAggregation(agg.id)}
                              className="p-1 text-red-400 hover:text-red-600"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        {aggregations.length === 0 && (
                          <p className="text-sm text-slate-400 text-center py-4">点击"添加"配置聚合指标</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={executeQuery}
                    disabled={loading}
                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> : <BarChart3 className="w-5 h-5 inline mr-2" />}
                    执行统计
                  </button>
                </div>
              </div>
            )}

            {/* Results Panel */}
            {queryResult.length > 0 ? (
              <div className="mb-6">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white rounded-t-xl">
                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                      <Table2 className="w-5 h-5 text-slate-400" />
                      查询结果
                      <span className="text-sm font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        {pagination.total} 条
                      </span>
                    </h3>
                    {canExport && (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleExport}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-all"
                        >
                          <Download className="w-4 h-4" />
                          导出 Excel
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 380px)' }}>
                    <div className="min-w-max">
                      <table className="w-full">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-slate-50">
                            {queryResult[0] &&
                              Object.keys(queryResult[0]).map((key) => (
                                <th
                                  key={key}
                                  className="px-4 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200 bg-slate-50 shadow-sm"
                                >
                                  {getColumnDisplayName(key)}
                                </th>
                              ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {queryResult.map((row, idx) => (
                            <tr key={idx} className="hover:bg-blue-50/50 transition-colors">
                              {Object.entries(row).map(([key, value]) => (
                                <td key={key} className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                                  {formatCellValue(value, key)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {pagination.total_pages > 1 && (
                    <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-b-xl">
                      <div className="text-sm text-slate-600">
                        第 <span className="font-medium text-slate-900">{pagination.page}</span> / {pagination.total_pages} 页
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setPagination({ ...pagination, page: pagination.page - 1 })
                            setTimeout(executeQuery, 0)
                          }}
                          disabled={pagination.page <= 1}
                          className="p-2 border border-slate-200 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-all bg-white"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium">
                          {pagination.page}
                        </span>
                        <button
                          onClick={() => {
                            setPagination({ ...pagination, page: pagination.page + 1 })
                            setTimeout(executeQuery, 0)
                          }}
                          disabled={pagination.page >= pagination.total_pages}
                          className="p-2 border border-slate-200 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-all bg-white"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* When no results yet - show sidebar + empty state */}
            {queryResult.length === 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Sidebar */}
                <div className="lg:col-span-1 space-y-4">
                  {canExecuteDetail && queryMode === 'detail' && !showAdvanced && (
                    <>
                      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                        <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2 text-sm">
                          <Table2 className="w-4 h-4 text-slate-500" />
                          显示字段
                        </h3>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          <label className="flex items-center gap-2 text-sm p-1.5 hover:bg-slate-50 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedColumns.length === columns.length}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedColumns(columns.map((c) => c.name))
                                } else {
                                  setSelectedColumns([])
                                }
                              }}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600"
                            />
                            <span className="text-slate-700">全选</span>
                          </label>
                          {columns.map((c) => (
                            <label key={c.name} className="flex items-center gap-2 text-sm p-1.5 hover:bg-slate-50 rounded cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedColumns.includes(c.name)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedColumns([...selectedColumns, c.name])
                                  } else {
                                    setSelectedColumns(selectedColumns.filter((s) => s !== c.name))
                                  }
                                }}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600"
                              />
                              <span className="text-slate-700">{c.display_name}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {canUseAdvancedFilter && (
                      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                        <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2 text-sm">
                          <SlidersHorizontal className="w-4 h-4 text-slate-500" />
                          排序
                        </h3>
                        <select
                          value={orderBy.field}
                          onChange={(e) => setOrderBy({ ...orderBy, field: e.target.value })}
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg mb-2 focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                          <option value="">不排序</option>
                          {columns.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.display_name}
                            </option>
                          ))}
                        </select>
                        {orderBy.field && (
                          <button
                            onClick={() => setOrderBy({ ...orderBy, desc: !orderBy.desc })}
                            className="w-full px-3 py-2 text-sm bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                          >
                            {orderBy.desc ? '↓ 降序' : '↑ 升序'}
                          </button>
                        )}
                      </div>
                      )}
                    </>
                  )}

                  {canExecuteDetail && queryMode === 'detail' && !showAdvanced && (
                    <div className="space-y-3">
                      <button
                        onClick={executeQuery}
                        disabled={loading || !searchKeyword.trim()}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
                      >
                        {loading ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <>
                            <Search className="w-5 h-5" />
                            搜索
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {canExecuteDetail && canUseAdvancedFilter && queryMode === 'detail' && showAdvanced && (
                    <button
                      onClick={executeQuery}
                      disabled={loading || filters.length === 0}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
                    >
                      {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <Search className="w-5 h-5" />
                          执行查询
                        </>
                      )}
                    </button>
                  )}

                  {canExecuteAggregate && queryMode === 'aggregate' && (
                    <button
                      onClick={executeQuery}
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
                    >
                      {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <BarChart3 className="w-5 h-5" />
                          执行统计
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Empty Results */}
                <div className="lg:col-span-3">
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                    <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white rounded-t-xl">
                      <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                        <Table2 className="w-5 h-5 text-slate-400" />
                        查询结果
                      </h3>
                    </div>
                    <div className="p-16 text-center">
                      <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Search className="w-10 h-10 text-slate-300" />
                      </div>
                      <p className="text-slate-500 text-lg">输入关键词开始搜索</p>
                      <p className="text-slate-400 text-sm mt-1">支持模糊匹配、精确查询等多种搜索方式</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Query History */}
            {canViewHistory && queryHistory.length > 0 && (
              <div className="mt-8">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                      <Clock className="w-5 h-5 text-slate-400" />
                      查询历史
                    </h3>
                    <button
                      onClick={clearHistory}
                      className="text-sm text-red-500 hover:text-red-600 font-medium"
                    >
                      清空
                    </button>
                  </div>
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-56 overflow-y-auto">
                    {queryHistory.slice(0, 6).map((item, idx) => (
                      <div
                        key={idx}
                        className="p-4 bg-slate-50 rounded-xl hover:bg-blue-50 cursor-pointer transition-all border border-transparent hover:border-blue-200"
                        onClick={() => {
                          setSelectedTable(item.table)
                          setQueryMode(item.mode)
                          fetchTableSchema(item.table)
                        }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                              item.mode === 'detail' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                            }`}
                          >
                            {item.mode === 'detail' ? '精确查询' : '聚合统计'}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-slate-900">
                          {tables.find((t) => t.name === item.table)?.display_name || item.table}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {new Date(item.time).toLocaleString('zh-CN')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Empty State */}
        {!selectedTable && (
          <div className="text-center py-20">
            <div className="w-24 h-24 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
              <Table2 className="w-12 h-12 text-blue-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-2">选择数据表开始查询</h3>
            <p className="text-slate-500 max-w-md mx-auto">
              支持线索表、门店表、客流表等多个业务表的精确查询和聚合统计分析
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

export default DataQuery
