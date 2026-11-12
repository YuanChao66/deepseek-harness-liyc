# DSH 企业级风险监控 Agent V1 Tool 接口契约规格

| 文档属性 | 内容 |
| -------------- | ------------------------------------------ |
| 文档编号 | DSH-RISK-TOOL-V1 |
| 文档名称 | DSH 企业级风险监控 Agent V1 Tool 接口契约规格 |
| 版本 | V1.0-Baseline |
| 文档状态 | 已冻结（Frozen） |
| 前置输入 | DOC-01（DSH-RISK-SRS-V1，V1.3-Review §6）；DOC-02（总体架构与模块设计 §3.3/§4）；DOC-04（采集与编排设计）；DOC-06（DTO 与数据模型规格 §10）；DOC-07（Ports 与 Repository 契约） |
| 下一环节 | DOC-11（错误/事务/幂等/恢复）、DOC-14（配置文件规格）、DOC-15（测试） |
| 适用范围 | DSH 风险监控 Agent V1 插件工程 |
| 技术基线 | DeepSeek Harness 工作树 live 源码（以源码核验为准） |

## 1. 文档概述

### 1.1 编写目的

本文档定义 DSH 企业级风险监控 Agent V1 九个模型工具（TOOL-001～009）的接口契约：请求/响应 Schema、必填与校验、幂等语义、错误语义与渲染（Host presenter / Web card）契约，作为模型调用、前后端展示与 DOC-15 测试的接口依据。

### 1.2 边界声明

| 主题 | 归属 |
| ---- | ---- |
| 工具请求/响应字段级 DTO | DOC-06 §10（字段定义），本文档 §3/§4 补 Schema 必填/校验/幂等/错误/渲染 |
| Repository / Port 方法签名与查询语义 | DOC-07 |
| 错误分类、事务、幂等与恢复边界 | DOC-11 |
| 配置 Schema（YAML） | DOC-14 |
| 采集/任务/工作流编排细节 | DOC-04 |

本文档只订「工具接口契约」，不进入 Adapter 实现、编排算法与错误恢复算法。

### 1.3 前置输入与依据

DOC-01 §6（九工具清单与能力）、§12（多租户可信边界）、§15.3（错误/部分成功语义）；DOC-06 §10（九工具 Request/Result DTO + 通用分页/排序/错误承载 DTO）；DOC-07 §2.2（租户约束）、§2.7（异常语义）。

### 1.4 记法约定

- 每个工具：元数据表 + 请求 Schema + 响应 Schema + 幂等语义 + 错误语义 + 渲染契约。
- Schema 用 TS `interface` 为主体，配字段/约束表（字段/类型/必填/约束）。
- 渲染契约遵循 DOC-02 §3.3 与 AGENTS「Host presenter 纯函数、Web card 派生自原始事件 + 结果元数据」原则。

## 2. Tool 通用契约

### 2.1 Tool 注册与元数据

每个工具注册元数据：

| 元数据 | 含义 | 约定 |
| ---- | ---- | ---- |
| id | 工具唯一标识 | `TOOL-00N` 对应 `collect_business_data` 等方法名 |
| name / desc | 模型可见名称与描述 | 遵循英文 sentence case；模型可见文案须可从 Session 日志重建 |
| category | 工具分类 | collect / compute / query / manage / report / health |
| modelVisible | 是否暴露给模型 | 九个工具均可见 |
| face | 渲染面 | HOST / WEB（见 §2.5） |

工具注册是副作用，经 `ctx.effect()` 完成（DOC-02 §5）；工具名与描述需路由到本地化字典（AGENTS「Client UI copy is locale-owned」）。

### 2.2 调用约定

1. 工具入参在模型工具 JSON 边界校验：字段类型、必填、值域；未知字段拒绝或显式忽略（fail-closed）。
2. `tenantId` 在所有工具中仅作范围提示，最终以可信 `TenantContext` 为准（DOC-06 §10、DOC-01 §12.2）。
3. 协作式取消：长任务（采集/评估/报告）响应 `AbortSignal`，取消抛 `Cancellation` 且不留下半提交状态。
4. 超时：采集/SSH/日志/外部依赖均有独立超时上界（见各工具），超时不计成功。

### 2.3 幂等语义（通用）

| 级别 | 适用工具 | 语义 |
| ---- | ---- | ---- |
| 只读 | query_risks / get_monitor_health | 天然幂等，无副作用 |
| 按窗口幂等 | calculate_metrics / evaluate_risk_rules | 同租户+同窗口+同输入版本返回同一结果引用 |
| 按采集幂等 | collect_* | 同 IdempotencyKey 返回原任务；不同 Hash 冲突；处理中返回引用；UNKNOWN 协调 |
| 有状态转换 | manage_action_proposals | 状态机驱动，同一操作重复调用幂等（终态/已生效不再重复变更） |
| 按参数幂等 | generate_risk_reports | 同参数重复生成返回新 ReportId，不覆盖历史 |

### 2.4 错误语义（通用）

工具层错误统一映射 DOC-11 结构化失败类型：

| 类别 | 触发 | 工具返回形态 |
| ---- | ---- | ---- |
| Validation | 入参校验失败 | 结构化错误，含字段级信息 |
| Authorization | 跨租户/未授权 | 结构化错误 |
| NotFound | 目标对象缺失 | 结构化错误 |
| Conflict | 幂等冲突/版本冲突/状态非法转换 | 结构化错误 |
| Timeout / Cancellation | 超时/取消 | 结构化错误，明确无半提交 |
| Persistence / ExternalDependency / Internal | 持久化/外部/内部失败 | 结构化错误 |

业务「部分成功/未命中」属结果数据，不抛异常（DOC-01 §15.3）：采集 `PARTIAL`、规则未命中、健康 `DEGRADED` 等以结果字段表达。

### 2.5 渲染契约

- **Host presenter**：纯函数，仅由工具结果生成展示；不访问跨文件事实源，不产生副作用。
- **Web card**：由原始事件 + 持久化的结果元数据派生，不依赖 presenter 运行时对象；渲染失败不影响结果持久化。
- 每个工具声明 `presenter`（Host）与 `card`（Web，从 `raw event` / `result metadata` 派生）所需的最小结果字段；缺字段时展示降级，不阻断。
- 渲染消息文案走本地化字典，模型可见结果内容与落盘日志一致（AGENTS「Model-visible ⟺ logged」）。

## 3. 九工具 Tool 契约

### 3.1 collect_business_data（TOOL-001）

| 元数据 | 值 |
| ---- | ---- |
| id / name | `TOOL-001` / `collect_business_data` |
| category | collect |
| modelVisible / face | true / HOST、WEB |
| 幂等级别 | 按采集幂等；长任务（可取消/超时） |

请求 Schema：

```ts
interface CollectBusinessDataRequest {
  dataSources: string[];          // 必填，非空；白名单校验
  tenantId?: string;              // 范围提示，最终取可信 TenantContext
  collectionRange?: TimeWindow;   // [start, end)
}
```

| 字段 | 类型 | 必填 | 约束 |
| ---- | ---- | ---- | ---- |
| dataSources | string[] | Y | 非空；数据源白名单 |
| tenantId | string? | N | 仅提示，不用于授权 |
| collectionRange | TimeWindow? | N | 左闭右开，`end > start` |

响应 Schema：

```ts
interface CollectBusinessDataResult {
  taskId: TaskId;         // 采集任务引用
  status: TaskStatus;     // PENDING/QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED/TIMED_OUT
}
```

幂等语义：同 IdempotencyKey 返回原 taskId；不同 Hash 抛 Conflict；处理中返回引用；UNKNOWN 进入协调（DOC-11）。

错误语义：白名单外数据源 → ValidationError；权限不足 → AuthorizationError；超时/取消 → Timeout/Cancellation；采集 `PARTIAL` 属结果非异常。

渲染契约：Host presenter 展示 taskId + 目标数据源 + 触发时间；Web card 从采集原始事件 + Task 结果元数据派生（数据源列表、状态、进度）。

### 3.2 collect_system_metrics（TOOL-002）

| 元数据 | 值 |
| ---- | ---- |
| id / name | `TOOL-002` / `collect_system_metrics` |
| category | collect |
| modelVisible / face | true / HOST、WEB |
| 幂等级别 | 按采集幂等；长任务 |

请求 Schema：

```ts
interface CollectSystemMetricsRequest {
  hosts: string[];            // 主机清单，白名单校验
  components: string[];       // SYS-MON-001～008 覆盖范围
  metricScope?: string[];     // 指标子集
}
```

| 字段 | 类型 | 必填 | 约束 |
| ---- | ---- | ---- | ---- |
| hosts | string[] | Y | 非空；主机白名单 |
| components | string[] | Y | SYS-MON-001～008 之一 |
| metricScope | string[]? | N | 指标子集（可空=全部） |

响应 Schema：

```ts
interface CollectSystemMetricsResult {
  taskId: TaskId;
  status: TaskStatus;
}
```

幂等/错误语义：同 TOOL-001；components 非法值 → ValidationError。

渲染契约：Host presenter 展示 taskId + hosts + components；Web card 派生主机/组件覆盖与状态。

### 3.3 collect_application_logs（TOOL-003）

| 元数据 | 值 |
| ---- | ---- |
| id / name | `TOOL-003` / `collect_application_logs` |
| category | collect |
| modelVisible / face | true / HOST、WEB |
| 幂等级别 | 按采集幂等；长任务 |

请求 Schema：

```ts
interface CollectApplicationLogsRequest {
  logSources: string[];        // 日志源，白名单校验
  timeRange: TimeWindow;       // 必填，左闭右开
}
```

| 字段 | 类型 | 必填 | 约束 |
| ---- | ---- | ---- | ---- |
| logSources | string[] | Y | 非空；日志源白名单 |
| timeRange | TimeWindow | Y | `[start, end)`，UTC 换算 |

响应 Schema：

```ts
interface CollectApplicationLogsResult {
  taskId: TaskId;
  status: TaskStatus;
}
```

幂等/错误语义：同 TOOL-001；`timeRange` 为空或反向 → ValidationError。

渲染契约：Host presenter 展示 taskId + logSources + 时间窗；Web card 派生日志源/时间窗/断点续采状态。

### 3.4 calculate_metrics（TOOL-004）

| 元数据 | 值 |
| ---- | ---- |
| id / name | `TOOL-004` / `calculate_metrics` |
| category | compute |
| modelVisible / face | true / HOST、WEB |
| 幂等级别 | 按窗口幂等；可取消 |

请求 Schema：

```ts
interface CalculateMetricsRequest {
  metricDefinitions: string[];   // 指标定义 ID 列表
  timeWindow: TimeWindow;
}
```

| 字段 | 类型 | 必填 | 约束 |
| ---- | ---- | ---- | ---- |
| metricDefinitions | string[] | Y | 非空；定义白名单/已启用 |
| timeWindow | TimeWindow | Y | `[start, end)` |

响应 Schema：

```ts
interface CalculateMetricsResult {
  results: MetricResult[];   // 对齐 DOC-06 §6.3
}
```

| 字段 | 类型 | 必填 | 约束 |
| ---- | ---- | ---- | ---- |
| results | MetricResult[] | Y | 每个含 calculationVersion、dataQuality、lineage |

幂等语义：同租户+同窗口+同 `metricDefinitions`+同输入版本返回同一结果引用（`MetricResultId` 集合），不重复计算。

错误语义：指标定义不存在/未启用 → NotFound/ValidationError；数据质量差（STALE/PARTIAL/INVALID）非异常，经 `dataQuality` 表达。

渲染契约：Host presenter 展示各指标 value + dataQuality；Web card 从指标结果元数据派生（指标/维度/窗口/质量徽标）。

### 3.5 evaluate_risk_rules（TOOL-005）

| 元数据 | 值 |
| ---- | ---- |
| id / name | `TOOL-005` / `evaluate_risk_rules` |
| category | compute |
| modelVisible / face | true / HOST、WEB |
| 幂等级别 | 按窗口幂等；可取消 |

请求 Schema：

```ts
interface EvaluateRiskRulesRequest {
  ruleScope?: string[];          // 规则范围（可空=启用全集）
  evaluationWindow: TimeWindow;
}
```

| 字段 | 类型 | 必填 | 约束 |
| ---- | ---- | ---- | ---- |
| ruleScope | string[]? | N | 规则白名单 |
| evaluationWindow | TimeWindow | Y | `[start, end)` |

响应 Schema：

```ts
interface EvaluateRiskRulesResult {
  evaluations: EvaluationResult[];   // 对齐 DOC-06 §6.4
}
```

| 字段 | 类型 | 必填 | 约束 |
| ---- | ---- | ---- | ---- |
| evaluations | EvaluationResult[] | Y | 每个含 ruleId/ruleVersion/inputMetricVersions/dataQuality/matched/score |

幂等语义：同租户+同窗口+同规则+同输入版本返回同一评估引用；只读无副作用。

错误语义：规则不存在/未启用 → NotFound/ValidationError；未命中（matched=false）属正常结果，不抛异常。

渲染契约：Host presenter 展示命中数 + 高分项；Web card 从评估结果元数据派生（规则命中列表、风险评分、数据质量）。

### 3.6 query_risks（TOOL-006）

| 元数据 | 值 |
| ---- | ---- |
| id / name | `TOOL-006` / `query_risks` |
| category | query |
| modelVisible / face | true / HOST、WEB |
| 幂等级别 | 只读，天然幂等 |

请求 Schema：

```ts
interface QueryRisksRequest {
  riskConditions?: RiskConditions;   // 过滤条件（严重度/状态/规则/业务对象/窗口）
  pagination: Pagination;            // 必填
}
```

| 字段 | 类型 | 必填 | 约束 |
| ---- | ---- | ---- | ---- |
| riskConditions | RiskConditions? | N | 过滤条件 |
| pagination | Pagination | Y | page/pageSize/sort/cursor |

响应 Schema：

```ts
interface QueryRisksResult {
  items: RiskEventSummary[];   // 风险状态与历史摘要
  total?: number;
  nextCursor?: string;
}
```

| 字段 | 类型 | 必填 | 约束 |
| ---- | ---- | ---- | ---- |
| items | RiskEventSummary[] | Y | 摘要，脱敏 |
| total | number? | N | 可不精确 |
| nextCursor | string? | N | keyset 续页游标 |

错误语义：分页参数越界 → ValidationError；只读，不抛业务异常。

渲染契约：Host presenter 展示风险列表（严重度/状态/对象）；Web card 列表视图，支持稳定排序与分页。

`RiskEventSummary`：{ riskEventId, tenantId, businessObjectId(掩码), ruleId, severity, currentStatus, currentCycleId, lastChangedAt }。

### 3.7 manage_action_proposals（TOOL-007）

| 元数据 | 值 |
| ---- | ---- |
| id / name | `TOOL-007` / `manage_action_proposals` |
| category | manage |
| modelVisible / face | true / HOST、WEB |
| 幂等级别 | 有状态转换（状态机驱动） |

请求 Schema：

```ts
interface ManageActionProposalsRequest {
  proposalId: ProposalId;           // 必填
  operationType: ProposalOperation; // 必填
}

type ProposalOperation =
  | 'SUBMIT'          // GENERATED → PENDING_REVIEW
  | 'WITHDRAW'        // GENERATED / PENDING_REVIEW → WITHDRAWN
  | 'APPROVE'         // PENDING_REVIEW → APPROVED
  | 'REJECT';         // PENDING_REVIEW → REJECTED
```

| 字段 | 类型 | 必填 | 约束 |
| ---- | ---- | ---- | ---- |
| proposalId | ProposalId | Y | 目标建议 |
| operationType | ProposalOperation | Y | 合法状态转换 |

响应 Schema：

```ts
interface ManageActionProposalsResult {
  proposalId: ProposalId;
  status: ProposalStatus;   // 七态，见 DOC-06 §7.2
}
```

幂等语义：重复同一操作对同一 Proposal 幂等（已处于目标态不再重复变更）；`SUPERSEDED` 由「追加新版本」事件版本追加入径自动触发，不经 `operationType`。

错误语义：Proposal 不存在 → NotFound；非法状态转换（终态回退、已 APPROVED 再 WITHDRAW）→ Conflict；字段缺失 → ValidationError。

渲染契约：Host presenter 展示 proposalId + 新状态 + 操作结果；Web card 派生操作类型、前后状态、审计信息（audit 字段）。

### 3.8 generate_risk_reports（TOOL-008）

| 元数据 | 值 |
| ---- | ---- |
| id / name | `TOOL-008` / `generate_risk_reports` |
| category | report |
| modelVisible / face | true / HOST、WEB |
| 幂等级别 | 按参数幂等（每次新 ReportId）；可取消 |

请求 Schema：

```ts
interface GenerateRiskReportsRequest {
  reportType: ReportFormat;   // JSON | MARKDOWN
  timeRange: TimeWindow;
}
```

| 字段 | 类型 | 必填 | 约束 |
| ---- | ---- | ---- | ---- |
| reportType | ReportFormat | Y | JSON/MARKDOWN |
| timeRange | TimeWindow | Y | 左闭右开 |

响应 Schema：

```ts
interface GenerateRiskReportsResult {
  reportId: ReportId;
  fileLocation: string;
}
```

幂等语义：同参数重复生成返回新 ReportId，不覆盖历史报告；历史保留供审计/追溯。

错误语义：数据不完整 → 结果 `consistency` 标记 PARTIAL/BEST_EFFORT，非异常；生成超时 → Timeout。

渲染契约：Host presenter 展示 reportId + fileLocation + consistency；Web card 派生报告类型/时间范围/一致性级别，提供下载。

### 3.9 get_monitor_health（TOOL-009）

| 元数据 | 值 |
| ---- | ---- |
| id / name | `TOOL-009` / `get_monitor_health` |
| category | health |
| modelVisible / face | true / HOST、WEB |
| 幂等级别 | 只读，天然幂等 |

请求 Schema：

```ts
interface GetMonitorHealthRequest {
  components?: string[];   // SYS-MON-001～008
  dataSources?: string[];
  tenantId?: string;
}
```

| 字段 | 类型 | 必填 | 约束 |
| ---- | ---- | ---- | ---- |
| components | string[]? | N | 组件子集 |
| dataSources | string[]? | N | 数据源子集 |
| tenantId | string? | N | 缺省取可信 TenantContext |

响应 Schema：

```ts
interface GetMonitorHealthResult {
  health: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN';
  plugin: { status: string; uptimeSec: number };
  dataSources: { sourceId: string; status: string; lastCheckedAt: Instant; message?: string }[];
  coverage: { configured: number; enabled: number; normal: number; degraded: number };
}
```

| 字段 | 类型 | 必填 | 约束 |
| ---- | ---- | ---- | ---- |
| health | HealthStatus | Y | 统一健康判定 |
| plugin | object | Y | 插件状态与 uptime |
| dataSources | object[] | Y | 各数据源状态 |
| coverage | object | Y | 覆盖率四点 |

错误语义：只读；任何未配置/未启用/采集失败/数据过期/规则缺失在 `coverage`/`dataSources` 降级表达，不抛异常（`UNKNOWN` 用于无法判定）。

`coverage` 四桶计数与 DOC-03 §6 `MonitoringCoverage` 六态的派生映射：`configured` = 非「未配置」对象数；`enabled` = 非「未配置」且非「未启用」；`normal` = 「正常」对象数；`degraded` = 「采集失败 + 数据过期 + 规则缺失」合计（= enabled − normal）。

渲染契约：Host presenter 展示 health 徽标 + coverage 四点；Web card 派生组件/数据源状态表与健康摘要。

## 4. 通用分页 / 错误 / 结果包装 Schema

```ts
interface Pagination {
  page: number;               // 从 1 起
  pageSize: number;           // 配置上限约束
  sort?: SortSpec[];          // 稳定排序
  cursor?: string;            // keyset 游标
}
interface SortSpec { field: string; order: 'ASC' | 'DESC'; }

interface ErrorResult {
  kind: ErrorCategory;        // Validation/Authorization/NotFound/Conflict/Timeout/Cancellation/Persistence/ExternalDependency/Internal（类型见 DOC-11 §3.3）
  message: string;
  code?: string;
  fieldErrors?: { field: string; message: string }[];
}
```

## 5. 与下游文档边界与追踪

| 本文档输出 | 下游承接 |
| ---- | ---- |
| 九工具请求/响应 Schema | 模型工具注册实现 + DOC-15 测试 |
| 幂等/错误语义 | DOC-11（错误/幂等/恢复） |
| 渲染契约（Host/Web） | DOC-02 §3.3（渲染原则）；本文档 §2.5/§3.x（渲染契约规格）；前端卡片实现（app 包，无编号文档） |
| Port 消费侧 | DOC-07（Repository/Port 契约） |
| 本地化文案路由 | 客户端字典（AGENTS locale-owned） |

需求追踪：每个工具映射回 BR-001～003、SYS-MON-001～008、TOOL-001～009（完整追踪表见 DOC-18）。

## 附录 A：版本与文档状态

| 版本 | 状态 | 说明 |
| ---- | ---- | ---- |
| V1.0-Baseline | Frozen | 冻结基线，开发启动依据 |

本文档已冻结，基线版本 `V1.0-Baseline`，作为开发启动依据。

**文档结束。**