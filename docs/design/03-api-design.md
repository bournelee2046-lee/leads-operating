# API 设计文档

## 概述

本文档描述线索运营监控系统的 API 接口设计。

---

## API 基础

### 通用响应格式

成功响应：
```json
{
  "success": true,
  "data": { ... },
  "meta": { ... }
}
```

错误响应：
```json
{
  "success": false,
  "message": "错误信息",
  "error_code": "ERROR_CODE"
}
```

---

## 系统状态 API

### GET /api/health
检查系统健康状态。

响应：
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "version": "1.0.0",
    "layers": {
      "raw": "connected",
      "mart": "connected",
      "metric": "connected"
    },
    "last_refresh": "2026-05-05T10:00:00Z"
  }
}
```

---

## 仪表盘 API

### GET /api/dashboard
获取仪表盘数据（主接口。

参数：
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| date | string | 否 | 统计日期，默认今天 |
| period | string | 否 | 统计周期，默认 'daily' |

响应：
```json
{
  "success": true,
  "data": {
    "kpis": [
      {
        "name": "today_leads",
        "value": "1,234",
        "change": "+12.5",
        "trend": "up"
      },
      {
        "name": "pending_follow",
        "value": "342",
        "change": "-5.2",
        "trend": "down"
      }
    ],
    "source_distribution": [
      {
        "name": "线上",
        "value": 45
      }
    ],
    "trend_data": [
      {
        "date": "2026-01-05",
        "leads": 1234,
        "conversions": 123
      }
    ],
    "dealer_ranking": [
      {
        "rank": 1,
        "dealer_id": "GDB0100",
        "dealer_name": "深圳龙华",
        "conversion_count": 100,
        "conversion_rate": 25.3
      }
    ]
  }
}
```

---

## 指标 API

### GET /api/metrics
获取指标列表。

响应：
```json
{
  "success": true,
  "data": [
    {
      "name": "lead_count",
      "display_name": "线索数量",
      "category": "kpi",
      "description": "统计周期内的线索总数"
    }
  ]
}
```

### GET /api/metrics/:metric_name
获取单个指标的详细数据。

参数：
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| metric_name | string | 是 | 指标名称 |
| granularity | string | 否 | 粒度 daily/weekly/monthly |
| start_date | string | 否 | 开始日期 |
| end_date | string | 否 | 结束日期 |
| dealer_id | string | 否 | 经销商 ID |
| region | string | 否 | 大区 |
| channel | string | 否 | 渠道 |

响应：
```json
{
  "success": true,
  "data": {
    "metric_name": "lead_count",
    "values": [
      {
        "date": "2026-05-01",
        "value": 1234
      }
    ],
    "summary": {
      "total": 1234,
      "average": 123,
      "max": 456
    }
  }
}
```

---

## 数据探索 API

### GET /api/explore/leads
查询线索数据（灵活查询）。

参数：
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| start_date | string | 否 | 开始日期 |
| end_date | string | 否 | 结束日期 |
| dealer_id | string | 否 | 经销商 ID |
| region | string | 否 | 大区 |
| channel_1 | string | 否 | 一级渠道 |
| channel_1 | string | 否 | 一级渠道 |
| channel_2 | string | 否 | 二级渠道 |
| lead_status | string | 否 | 线索状态 |
| is_converted | boolean | 否 | 是否转化 |
| page | integer | 否 | 页码 |
| page_size | integer | 否 | 每页数量 |
| sort_by | string | 否 | 排序字段 |
| sort_order | string | 否 | 排序方式 |

响应：
```json
{
  "success": true,
  "data": {
    "list": [
      {
        "lead_id": "xxx",
        "dealer_id": "xxx",
        "assign_date": "2026-05-01",
        "conversion_date": null
      }
    ],
    "pagination": {
      "page": 1,
      "page_size": 20,
      "total": 1000
    }
  }
}
```

### POST /api/explore/aggregate
数据聚合查询。

请求体：
```json
{
  "group_by": ["channel_1", "dealer_id"],
  "metrics": ["lead_count", "conversion_rate"],
  "filters": {
    "start_date": "2026-01-01",
    "end_date": "2026-05-31"
  }
}
```

响应：
```json
{
  "success": true,
  "data": [
    {
      "channel_1": "线上",
      "dealer_id": "xxx",
      "lead_count": 100,
      "conversion_rate": 25.3
    }
  ]
}
```

---

## 经销商 API

### GET /api/dealers
获取经销商列表。

响应：
```json
{
  "success": true,
  "data": [
    {
      "dealer_id": "GDB0100",
      "dealer_name": "深圳龙华",
      "region": "华南二区"
    }
  ]
}
```

### GET /api/dealers/:dealer_id
获取单个经销商详情。

响应：
```json
{
  "success": true,
  "data": {
    "dealer_id": "GDB0100",
    "dealer_name": "深圳龙华",
    "region": "华南二区",
    "metrics": {
      "lead_count": 1234,
      "conversion_count": 100,
      "conversion_rate": 25.3
    }
  }
}
```

---

## 数据刷新 API

### POST /api/refresh/trigger
手动触发数据刷新。

请求体：
```json
{
  "mode": "incremental", // or "full"
  "start_date": "2026-05-01",
  "end_date": "2026-05-31"
}
```

响应：
```json
{
  "success": true,
  "data": {
    "task_id": "task-123",
    "status": "running"
  }
}
```

### GET /api/refresh/status/:task_id
获取刷新任务状态。

响应：
```json
{
  "success": true,
  "data": {
    "task_id": "task-123",
    "status": "completed", // running/failed
    "progress": 100,
    "started_at": "2026-05-05T10:00:00Z",
    "completed_at": "2026-05-05T10:30:00Z"
  }
}
```
