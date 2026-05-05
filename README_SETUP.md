
# 线索运营监控系统 - 数据库连接配置

## 📊 数据库信息

数据库文件位置：`../leads.db`（相对于项目目录）

包含两个主要数据表：
- **门店表**：494条经销商信息
- **线索表**：780,942条销售线索记录

## 🚀 快速启动

### 方式一：双击启动（macOS 推荐 ⭐）

直接在 Finder 中双击以下文件：

- **`启动服务.command`** - 一键启动所有服务并自动打开浏览器
- **`停止服务.command`** - 停止所有服务（可选清理日志）

### 方式二：命令行启动

```bash
./start.sh
```

### 方式三：分别启动

**启动后端服务：**
```bash
# 安装依赖
pip3 install -r requirements.txt

# 启动API服务
python3 backend.py
```

**启动前端服务：**
```bash
npm run dev
```

## 🌐 访问地址

- **前端页面**：http://localhost:5173
- **后端API**：http://localhost:5001

## 🔌 API接口

### 获取仪表盘数据
```
GET /api/dashboard
```
返回所有首页需要的KPI、图表和排行榜数据

### 获取线索列表
```
GET /api/leads?page=1&pageSize=20&search=关键词&status=状态
```

### 获取经销商列表
```
GET /api/dealers
```

## 📁 项目结构

```
线索运营监控系统/
├── 启动服务.command       # ⭐ 双击启动所有服务（macOS）
├── 停止服务.command       # ⭐ 双击停止所有服务（macOS）
├── backend.py              # Flask后端API服务
├── requirements.txt        # Python依赖
├── start.sh               # 命令行启动脚本
├── check_leads_db.py      # 数据库检查工具
├── src/
│   ├── pages/
│   │   └── Home.tsx       # 主页组件（已连接真实数据）
│   └── hooks/
│       └── useApi.ts      # API数据获取Hook
└── .trae/documents/
    ├── prd.md            # 产品需求文档
    └── arch.md           # 技术架构文档
```

## 📈 数据说明

从数据库中计算和提取的数据包括：

1. **KPI指标**：
   - 今日新增线索
   - 待跟进线索
   - 本月转化量
   - 转化率

2. **线索来源分布**：按一级渠道统计的线索数量

3. **趋势数据**：最近6周的线索量和转化量

4. **经销商排行榜**：按转化量排序的TOP 10经销商

## 🔧 技术栈

- **前端**：React 18 + TypeScript + Tailwind CSS + Vite
- **后端**：Flask + SQLite
- **图表**：Recharts
- **图标**：Lucide React

## 💡 注意事项

- 如果后端服务未启动，前端会显示模拟数据作为后备方案
- 页面有刷新按钮，可以随时重新获取最新数据
- 数据加载时会显示loading状态
- 如有错误会显示错误提示和重试按钮
