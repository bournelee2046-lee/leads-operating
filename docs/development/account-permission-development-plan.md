# 账号权限体系分步开发计划

> 目标：把 PRD P0 拆成可恢复、可验证的小阶段。任何阶段中断后，先查看本文件和 `git status --short`，再从最近一个未完成检查点继续。

## 阶段 0：现状摸底

- 状态：已完成
- 代码形态：Flask 后端 `backend/app_v2.py` + Vite React 前端 `src/App.tsx`
- 主业务库：`../leads.db`，由 `backend/core/db_manager.py` 连接
- 业务分析库：`data/leads_analytics.db`，由 DuckDB 管理

## 阶段 1：后端认证与权限地基

- 状态：已完成
- 目标：
  - 新增 SQLite 系统表初始化
  - 初始化内置角色、权限点和默认管理员
  - 新增登录、退出、当前用户接口
  - 提供接口权限校验装饰器
  - 新增账号、角色、权限、日志基础 API
- 检查点：
  - `python -m py_compile backend/app_v2.py backend/auth/*.py`
  - 启动后端后访问 `/api/health` 正常
  - 使用默认账号 `admin / Admin@123456` 可登录

## 阶段 2：现有业务接口鉴权与审计

- 状态：已完成
- 目标：
  - 按 PRD 权限点映射保护现有业务接口
  - 查询、导出、同步等关键操作写入操作日志
  - 保持 `/api/health` 与 `/api/auth/login` 不要求登录
- 检查点：
  - 未登录访问业务接口返回 401
  - 无权限访问返回 403
  - 管理员访问原业务接口成功

## 阶段 3：前端登录态与路由守卫

- 状态：已完成
- 目标：
  - 新增登录页
  - 新增 AuthProvider 与 `/api/auth/me`
  - 未登录访问业务路由跳转登录页
  - 顶部用户信息和退出登录接入真实用户
- 检查点：
  - 未登录访问 `/` 跳转 `/login`
  - 登录成功进入首页
  - 退出后无法继续访问业务页面

## 阶段 4：前端页面、导航和按钮权限

- 状态：部分完成
- 目标：
  - 根据权限控制首页导航卡片
  - 根据页面权限控制入口页卡片
  - 根据按钮权限隐藏刷新、同步、查询、筛选、排序、下钻、导出等操作
  - 无页面权限时展示无权限页
- 检查点：
  - 总部运营人员看不到账号权限模块入口
  - 直接访问无权限 URL 有明确无权限提示

## 阶段 5：账号权限管理页面

- 状态：部分完成
- 目标：
  - 账号管理：列表、新建、编辑、启停、重置密码
  - 角色管理：列表、新建、编辑、删除、权限树保存
  - 操作日志和登录日志：筛选、列表、详情
- 检查点：
  - 管理员可完整维护账号和角色
  - 内置角色不可删除
  - 用户不能停用自己
  - 管理操作产生审计日志

## 阶段 6：完整验证

- 状态：部分完成
- 目标：
  - 后端编译检查
  - 前端类型检查和构建
  - 本地启动回归主要页面
- 检查点：
  - `python -m py_compile backend/app_v2.py backend/auth/*.py`
  - `npm run check`
  - `npm run build`

## 本轮完成记录

- 新增后端认证服务：`backend/auth/service.py`
- 新增权限资源清单：`backend/auth/permissions.py`
- `backend/app_v2.py` 已接入：
  - 系统表初始化
  - 默认管理员 `admin / Admin@123456`
  - 登录、退出、当前用户接口
  - 账号、角色、权限树、日志接口
  - API 登录校验、接口权限校验和业务接口审计日志
- 新增前端登录态：
  - `src/lib/auth.tsx`
  - `src/components/ProtectedRoute.tsx`
  - 登录页、无权限页
- 新增账号权限页面：
  - 账号管理
  - 角色管理
  - 操作日志/登录日志
- 首页已接入真实用户信息、退出登录和账号权限入口。

## 本轮验证记录

- `python -m py_compile backend/app_v2.py backend/auth/*.py`：通过
- 临时 SQLite 库认证冒烟：通过
- `npm run check`：通过
- `npm run build`：通过

## 当前注意事项

- 沙箱内真实 `../leads.db` 当前显示为只读，直接初始化系统表会报 `sqlite3.OperationalError: attempt to write a readonly database`。
- 正式启动前需要确保 `/Users/bournelll/Desktop/线索运营/leads.db` 对当前运行用户可写。
- 阶段 4 仍需继续细化：各业务页面内的按钮权限隐藏还没有逐页完全接入。
- 阶段 5 仍需继续细化：账号编辑弹窗、角色编辑基础信息、日志筛选/详情弹窗还可以增强。

## 剩余任务精细执行清单

> 执行规则：每个小节都可以独立开发、独立验证。中断恢复时优先查看本清单，找到第一个未完成项继续。

### A. 二级入口权限控制

- 状态：已完成
- 目标：页面入口卡片和导航入口与当前用户权限一致。

#### A1. 跟进记录入口页

- 状态：已完成
- 文件：`src/pages/FollowUp.tsx`
- 权限点：
  - `follow.distribution.entry`
  - `follow.data.refresh`
- 开发任务：
  - 根据 `follow.distribution.entry` 控制「跟进次数分布」入口卡片展示。
  - 根据 `follow.data.refresh` 控制刷新入口数据能力。
  - 无可见入口时展示空状态。
- 验证：
  - 无 `follow.distribution.entry` 权限时，看不到「跟进次数分布」入口。
  - 直接访问 `/follow-up/distribution` 仍由路由守卫按 `follow.distribution.view` 控制。

#### A2. 运营数据入口页

- 状态：已完成
- 文件：`src/pages/OperationsData.tsx`
- 权限点：
  - `operations.customer_visit.entry`
  - `operations.visit_stats.entry`
- 开发任务：
  - 根据权限分别控制「客流明细」「客流统计」入口卡片。
  - 保留预留卡片为不可点击状态。
  - 无可见业务入口时展示空状态。
- 验证：
  - 无 `operations.customer_visit.entry` 时，看不到客流明细入口。
  - 无 `operations.visit_stats.entry` 时，看不到客流统计入口。

#### A3. 经销商管理入口页

- 状态：已完成
- 文件：`src/pages/DealerManagement.tsx`
- 权限点：
  - `dealer_daily_report.entry`
- 开发任务：
  - 根据权限控制「运营日报」入口。
  - 无可见入口时展示空状态。
- 验证：
  - 无 `dealer_daily_report.entry` 时，看不到运营日报入口。

#### A4. 首页功能导航补齐

- 状态：已完成
- 文件：`src/pages/Home.tsx`
- 权限点：
  - `follow.view`
  - `operations.view`
  - `data_query.view`
  - `dealer_management.view`
  - `admin.module`
- 开发任务：
  - 当前仅控制了账号权限入口，需要继续按页面权限过滤跟进记录、运营数据、数据查询、经销商管理。
  - 首页未实现独立页面的卡片继续保持不可点击或隐藏策略一致。
- 验证：
  - 用户无某模块页面权限时，首页不展示对应可点击入口。

### B. 业务页面按钮权限控制

- 状态：已完成
- 目标：所有刷新、同步、筛选、查询、排序、下钻、导出等按钮根据权限展示。

#### B1. 首页按钮权限

- 状态：已完成
- 文件：`src/pages/Home.tsx`
- 权限点：
  - `home.data.refresh`
  - `home.data.sync`
- 开发任务：
  - 根据 `home.data.refresh` 控制「刷新数据」按钮。
  - 根据 `home.data.sync` 控制「同步新数据」按钮。
- 验证：
  - 无权限时按钮不展示。
  - 后端仍按接口权限返回 403，前后端一致。

#### B2. 跟进次数分布按钮权限

- 状态：已完成
- 文件：`src/pages/FollowUpDistribution.tsx`
- 权限点：
  - `follow.distribution.search`
  - `follow.distribution.export`
- 开发任务：
  - 根据搜索权限控制门店搜索框或搜索动作。
  - 根据导出权限控制导出按钮。
- 验证：
  - 无搜索权限时不可执行搜索。
  - 无导出权限时看不到导出按钮。

#### B3. 客流明细按钮权限

- 状态：已完成
- 文件：`src/pages/CustomerVisit.tsx`
- 权限点：
  - `customer_visit.filter`
  - `customer_visit.export`
- 开发任务：
  - 根据筛选权限控制筛选展开、查询、重置。
  - 根据导出权限控制导出按钮。
- 验证：
  - 无筛选权限时无法提交筛选。
  - 无导出权限时看不到导出按钮。

#### B4. 客流统计按钮权限

- 状态：已完成
- 文件：`src/pages/VisitStats.tsx`
- 权限点：
  - `visit_stats.filter`
  - `visit_stats.drilldown`
  - `visit_stats.export`
- 开发任务：
  - 根据筛选权限控制筛选区操作。
  - 根据下钻权限控制统计数字点击跳转。
  - 根据导出权限控制导出按钮。
- 验证：
  - 无下钻权限时统计数字不可点击。
  - 无导出权限时看不到导出按钮。

#### B5. 数据查询按钮权限

- 状态：已完成
- 文件：`src/pages/DataQuery.tsx`
- 权限点：
  - `data_query.detail.execute`
  - `data_query.aggregate.execute`
  - `data_query.advanced_filter`
  - `data_query.history.view`
  - `data_query.export`
- 开发任务：
  - 明细查询按钮按 `data_query.detail.execute` 控制。
  - 聚合查询按钮按 `data_query.aggregate.execute` 控制。
  - 高级筛选、排序、输出字段选择按 `data_query.advanced_filter` 控制。
  - 查询历史按 `data_query.history.view` 控制。
  - 导出按 `data_query.export` 控制。
- 验证：
  - 无对应权限时按钮/功能区不展示。
  - 直接调用接口仍返回 403。

#### B6. 运营日报按钮权限

- 状态：已完成
- 文件：
  - `src/pages/DealerDailyReport.tsx`
  - `src/components/ExportModal.tsx`
- 权限点：
  - `dealer_daily_report.filter`
  - `dealer_daily_report.sort`
  - `dealer_daily_report.export`
  - `dealer_daily_report.export_template`
  - `dealer_daily_report.export_custom_range`
- 开发任务：
  - 日期模式、门店筛选、重置按筛选权限控制。
  - 表格排序按排序权限控制。
  - 普通导出、模板导出、自定义周期导出分别按权限控制。
- 验证：
  - 无模板导出权限时看不到模板导出入口。
  - 无自定义周期导出权限时看不到自定义周期导出入口。

#### B7. 重点店风向监测按钮权限

- 状态：已完成
- 文件：`src/pages/KeyStoreWind.tsx`
- 权限点：
  - `key_store_wind.metric_window.switch`
  - `key_store_wind.trend.view`
  - `key_store_wind.absolute.view`
  - `key_store_wind.store_detail.view`
  - `key_store_wind.sort`
- 开发任务：
  - 观察窗口切换按权限控制。
  - 趋势镜面、绝对值镜面按权限控制展示。
  - 重点店明细、单店展开、排序按权限控制。
- 验证：
  - 无趋势权限时趋势镜面不展示。
  - 无明细权限时重点店明细不展示。

### C. 账号管理补全

- 状态：已完成
- 文件：`src/pages/admin/AdminUsers.tsx`
- 目标：达到 PRD 中账号管理页 P0 验收要求。

#### C1. 账号筛选区

- 状态：已完成
- 权限点：`admin.users.view`
- 开发任务：
  - 新增关键词筛选。
  - 新增角色筛选。
  - 新增状态筛选。
  - 接入 `/api/admin/users?keyword=&role_id=&status=`。
- 验证：
  - 可按账号/姓名模糊查询。
  - 可按角色、状态筛选。

#### C2. 编辑账号弹窗

- 状态：已完成
- 权限点：`admin.users.edit`
- 开发任务：
  - 新增编辑弹窗。
  - 支持修改姓名、手机号、邮箱、角色。
  - 保存调用 `PUT /api/admin/users/:id`。
- 验证：
  - 修改后列表刷新。
  - 操作日志记录编辑账号。

#### C3. 新建账号体验补齐

- 状态：已完成
- 权限点：`admin.users.create`
- 开发任务：
  - 新建表单增加状态选择。
  - 角色选择改为更清晰的多选控件。
  - 创建成功展示初始密码提示，但不写入日志。
- 验证：
  - 登录账号重复时提示明确。
  - 日志不包含明文密码。

#### C4. 启停与重置确认

- 状态：已完成
- 权限点：
  - `admin.users.status`
  - `admin.users.reset_password`
- 开发任务：
  - 启停账号增加确认弹窗。
  - 重置密码增加确认弹窗。
  - 对内置管理员账号停用给出前端提示。
- 验证：
  - 当前登录用户不能停用自己。
  - 内置管理员不能停用。

### D. 角色管理补全

- 状态：已完成
- 文件：`src/pages/admin/AdminRoles.tsx`
- 目标：角色基础信息和权限配置达到 P0 可用状态。

#### D1. 编辑角色基础信息

- 状态：已完成
- 权限点：`admin.roles.edit`
- 开发任务：
  - 增加角色编辑弹窗。
  - 支持修改角色名称、说明、数据范围类型。
  - 保存调用 `PUT /api/admin/roles/:id`。
- 验证：
  - 修改后角色列表刷新。
  - 操作日志记录编辑角色。

#### D2. 权限树父子联动

- 状态：已完成
- 权限点：`admin.roles.permissions.edit`
- 开发任务：
  - 勾选父节点时自动勾选子节点。
  - 取消父节点时自动取消子节点。
  - 子节点部分勾选时父节点展示半选状态。
- 验证：
  - 保存后重新打开角色，权限状态一致。

#### D3. 内置角色保护提示

- 状态：已完成
- 权限点：`admin.roles.delete`
- 开发任务：
  - 内置角色不展示删除按钮或展示禁用态。
  - 已绑定账号角色删除失败时展示后端错误。
- 验证：
  - 内置角色不可删除。
  - 已被账号引用的角色不可删除。

### E. 日志管理补全

- 状态：已完成
- 文件：`src/pages/admin/AdminLogs.tsx`
- 目标：支持 PRD 要求的日志筛选和详情查看。

#### E1. 操作日志筛选

- 状态：已完成
- 权限点：`admin.audit_logs.view`
- 开发任务：
  - 增加操作时间范围筛选。
  - 增加操作人、模块、操作类型、结果筛选。
  - 后端 `/api/admin/audit-logs` 增加对应查询参数支持。
- 验证：
  - 筛选条件组合生效。

#### E2. 登录日志筛选

- 状态：已完成
- 权限点：`admin.login_logs.view`
- 开发任务：
  - 增加登录时间范围、账号、结果筛选。
  - 后端 `/api/admin/login-logs` 增加对应查询参数支持。
- 验证：
  - 可筛选成功/失败登录记录。

#### E3. 日志详情弹窗

- 状态：已完成
- 权限点：
  - `admin.audit_logs.view`
  - `admin.login_logs.view`
- 开发任务：
  - 操作日志支持查看详情。
  - 展示 before_data、after_data、错误摘要、IP。
  - 登录日志展示 User-Agent。
- 验证：
  - 详情内容不包含明文密码、Token、密钥。

### F. 后端管理接口增强

- 状态：部分完成
- 文件：`backend/auth/service.py`、`backend/app_v2.py`
- 目标：补齐前端增强需要的筛选、详情和错误处理。

#### F1. 账号详情查询优化

- 状态：已完成
- 开发任务：
  - 新增按 ID 查询账号的服务函数，替代当前列表中过滤。
  - 账号详情返回角色 ID 列表，方便编辑表单回显。
- 验证：
  - `GET /api/admin/users/:id` 返回稳定结构。

#### F2. 日志筛选参数

- 状态：已完成
- 开发任务：
  - `list_audit_logs` 支持时间、操作人、模块、动作、结果筛选。
  - `list_login_logs` 支持时间、账号、结果筛选。
- 验证：
  - SQL 使用参数绑定，不拼接用户输入。

#### F3. 数据库初始化幂等性回归

- 状态：已完成
- 开发任务：
  - 多次启动不重复创建角色、权限、默认管理员。
  - 不覆盖已人工调整过的运营人员角色权限。
- 验证：
  - 连续启动两次后系统表数据稳定。

### G. 验收回归清单

- 状态：已完成自动化冒烟验收
- 目标：按 PRD P0 做完整验收。

#### G1. 登录认证

- 状态：已完成自动化冒烟验收
- 未登录访问业务页面跳转登录页。
- 正确账号密码可登录。
- 错误账号密码不可登录。
- 停用账号不可登录。
- 退出登录后不能继续访问业务页面。
- 登录成功和失败均有登录日志。

#### G2. 账号管理

- 状态：已完成自动化冒烟验收
- 总部管理员可新建账号。
- 总部管理员可编辑账号。
- 总部管理员可调整角色。
- 总部管理员可启用/停用账号。
- 用户不能停用自己。
- 登录账号不能重复。
- 账号变更记录操作日志。

#### G3. 角色管理

- 状态：已完成自动化冒烟验收
- 总部管理员可新建角色。
- 总部管理员可编辑角色。
- 总部管理员可配置权限。
- 内置角色不能删除。
- 被账号引用角色不能删除。
- 角色权限变更后刷新或重新登录生效。
- 角色变更记录操作日志。

#### G4. 权限控制

- 状态：已完成自动化冒烟验收
- 没有页面权限时看不到对应导航、入口卡片或页面入口。
- 直接访问无页面权限 URL 时展示无权限页。
- 没有按钮权限时看不到对应按钮。
- 直接调用无权限接口时后端返回 403。
- 未登录或登录过期时后端返回 401。
- 前后端权限结果一致。

#### G5. 日志审计与安全

- 状态：已完成自动化冒烟验收
- 查询、导出、同步、账号、角色、权限等关键操作记录操作日志。
- 日志包含操作人、时间、IP、模块、动作、对象和结果。
- 日志不包含明文密码、Token、密钥。
- 密码哈希存储。
- 登录接口不返回密码哈希。

### H. 推荐执行顺序

1. A1-A4：先补入口权限，用户马上能感知权限效果。
2. B1-B7：逐页补按钮权限，每完成一页就验证一页。
3. C1-C4：补账号管理体验。
4. D1-D3：补角色管理体验。
5. E1-E3 + F1-F2：补日志筛选和后端支持。
6. F3：做初始化幂等性回归。
7. G1-G5：完整验收。

## A1-A4 完成记录

- 完成时间：2026-05-16
- 已完成文件：
  - `src/pages/FollowUp.tsx`
  - `src/pages/OperationsData.tsx`
  - `src/pages/DealerManagement.tsx`
  - `src/pages/Home.tsx`
- 完成内容：
  - 跟进记录入口页按 `follow.distribution.entry` 控制「跟进次数分布」入口。
  - 跟进记录入口页按 `follow.data.refresh` 控制刷新按钮。
  - 跟进记录入口页避免无 `follow.distribution.query` 权限时主动请求分布接口。
  - 运营数据入口页按 `operations.customer_visit.entry`、`operations.visit_stats.entry` 控制入口。
  - 经销商管理入口页按 `dealer_daily_report.entry` 控制入口。
  - 首页按 `follow.view`、`operations.view`、`data_query.view`、`dealer_management.view`、`admin.module` 控制功能导航入口。
  - 入口页无可访问业务入口时展示空状态。
- 验证：
  - `npm run check`：通过
  - `npm run build`：通过

## B1-B7 完成记录

- 完成时间：2026-05-16
- 已完成文件：
  - `src/pages/Home.tsx`
  - `src/pages/FollowUpDistribution.tsx`
  - `src/pages/CustomerVisit.tsx`
  - `src/pages/VisitStats.tsx`
  - `src/pages/DataQuery.tsx`
  - `src/pages/DealerDailyReport.tsx`
  - `src/pages/KeyStoreWind.tsx`
  - `src/components/ExportModal.tsx`
- 完成内容：
  - 首页按 `home.data.refresh`、`home.data.sync` 控制刷新和同步按钮。
  - 跟进次数分布按 `follow.distribution.search`、`follow.distribution.export` 控制搜索和导出。
  - 客流明细按 `customer_visit.filter`、`customer_visit.export` 控制筛选/查询/重置和导出。
  - 客流统计按 `visit_stats.filter`、`visit_stats.drilldown`、`visit_stats.export` 控制筛选、下钻和导出。
  - 数据查询按 `data_query.detail.execute`、`data_query.aggregate.execute`、`data_query.advanced_filter`、`data_query.history.view`、`data_query.export` 控制执行、聚合、高级筛选、历史和导出。
  - 运营日报按 `dealer_daily_report.filter`、`dealer_daily_report.sort`、`dealer_daily_report.export`、`dealer_daily_report.export_template`、`dealer_daily_report.export_custom_range` 控制筛选、排序和导出入口。
  - 重点店风向监测按 `key_store_wind.metric_window.switch`、`key_store_wind.trend.view`、`key_store_wind.absolute.view`、`key_store_wind.store_detail.view`、`key_store_wind.sort` 控制窗口切换、镜面展示、明细和排序。
- 验证：
  - `npm run check`：通过
  - `npm run build`：通过

## C1-D3 完成记录

- 完成时间：2026-05-16
- 已完成文件：
  - `backend/auth/service.py`
  - `backend/app_v2.py`
  - `src/pages/admin/AdminUsers.tsx`
  - `src/pages/admin/AdminRoles.tsx`
- 完成内容：
  - 后端新增按 ID 查询账号详情服务，返回 `role_ids` 供编辑表单回显。
  - 账号管理新增关键词、角色、状态筛选。
  - 账号管理新增编辑弹窗，支持姓名、手机号、邮箱、角色调整。
  - 账号新建补齐状态选择、初始密码提示和角色复选体验。
  - 启停账号、重置密码增加确认。
  - 角色管理新增编辑弹窗，支持角色名称、说明、数据范围类型。
  - 权限树支持父子联动；父节点勾选/取消会带动子节点，部分选中时展示半选状态。
  - 内置角色展示不可删除提示；已绑定账号角色前端阻止删除并提示。
- 验证：
  - `python -m py_compile backend/app_v2.py backend/auth/*.py`：通过
  - 临时 SQLite 库账号详情冒烟：通过
  - `npm run check`：通过
  - `npm run build`：通过

## E1-F3 完成记录

- 完成时间：2026-05-16
- 已完成文件：
  - `backend/auth/service.py`
  - `backend/app_v2.py`
  - `src/pages/admin/AdminLogs.tsx`
- 完成内容：
  - 操作日志支持按时间范围、操作人、模块、动作、结果筛选。
  - 登录日志支持按时间范围、登录账号、结果筛选。
  - 操作日志新增详情接口，前端详情弹窗展示操作前/后 JSON、错误摘要、IP。
  - 登录日志新增详情接口，前端详情弹窗展示 User-Agent。
  - 日志查询 SQL 使用参数绑定。
  - 临时库连续执行系统初始化，验证内置数据初始化具备幂等性。
- 验证：
  - `python -m py_compile backend/app_v2.py backend/auth/*.py`：通过
  - 临时 SQLite 库日志筛选和初始化幂等冒烟：通过
  - `npm run check`：通过
  - `npm run build`：通过

## G1-G5 验收回归记录

- 完成时间：2026-05-16
- 新增验收脚本：
  - `tests/auth_prd_acceptance.py`
- 自动化冒烟覆盖：
  - `/api/health` 未登录可访问。
  - 未登录访问业务接口返回 401。
  - 默认管理员可登录并获取权限。
  - 错误密码不可登录并记录登录日志。
  - 总部管理员可新建账号。
  - 总部运营人员不能访问账号管理接口，返回 403。
  - 用户不能停用自己。
  - 停用账号不可登录。
  - 内置角色不可删除。
  - 已被账号引用的角色不可删除。
  - 角色权限变更后重新登录生效。
  - 操作日志、登录日志筛选可用。
  - 初始化脚本连续执行具备幂等性。
- 验证命令：
  - `python tests/auth_prd_acceptance.py`：通过
  - `python -m py_compile backend/app_v2.py backend/auth/*.py tests/auth_prd_acceptance.py`：通过
  - `npm run check`：通过
  - `npm run build`：通过
- 说明：
  - 当前验收脚本使用 `/private/tmp` 临时 SQLite 数据库，不污染真实 `leads.db`。
  - 建议上线前再用真实 `leads.db` 做一次人工页面流程确认，重点检查不同角色下页面入口和按钮隐藏效果。
