# DSH 企业级风险监控 Agent V1 DTO 与数据模型规格

| 文档属性 | 内容 |
| -------------- | ------------------------------------------ |
| 文档编号 | DSH-RISK-DTO-V1 |
| 文档名称 | DSH 企业级风险监控 Agent V1 DTO 与数据模型规格 |
| 版本 | V1.0-Baseline |
| 文档状态 | 已冻结（Frozen） |
| 前置输入 | DOC-01（DSH-RISK-SRS-V1，V1.3-Review）；DOC-02（总体架构与模块设计）；DOC-03（领域模型与状态机设计）；DOC-04（采集与编排设计）；DOC-05（端到端数据流设计） |
| 下一环节 | DOC-07（Ports 与 Repository 契约）、DOC-08（Tool 接口契约规格）、DOC-11（错误/事务/幂等/恢复）、DOC-14（配置文件规格） |
| 适用范围 | DSH 风险监控 Agent V1 插件工程 |
| 技术基线 | DeepSeek Harness 工作树 live 源码（以源码核验为准） |

## 1. 文档概述

### 1.1 编写目的

本文档定义 DSH 企业级风险监控 Agent V1 的全部 DTO 与数据模型的字段级规格：领域对象、事件、公共值类型、枚举、状态、关联结构与 Tool 请求/响应 DTO 的字段、类型、必填性、约束与 JSON 表示，作为 DOC-07（Ports/Repository 契约）、DOC-08（Tool 接口契约）、DOC-11（错误/事务/幂等/恢复）与 DOC-14（配置文件规格）的数据依据。

### 1.2 边界声明

| 主题 | 归属 |
| ---- | ---- |
| 领域身份、聚合根、不变量、枚举值集合 | DOC-03 |
| 字段级 DTO、类型、必填、校验、JSON 表示 | 本文档 |
| Repository / Port 方法签名与查询语义 | DOC-07 |
| 九个模型工具接口契约（入参/出参/幂等/错误语义） | DOC-08 |
| Metric DSL / Rule DSL 语法 | DOC-09 / DOC-10 |
| 错误分类、事务、幂等与恢复边界 | DOC-11 |
| 配置 Schema（YAML） | DOC-14 |
| 采集/任务/工作流编排细节与状态机 | DOC-04 |

本文档只落「数据模型 + 字段级 DTO」，不进入方法签名（DOC-07）、工具契约语义（DOC-08）与 DSL 语法（DOC-09/10）。

### 1.3 前置输入与依据

DOC-01 §4（BR-001～003）、§6（模型工具）、§7（数据采集与事件）、§8（Metric/Baseline/Rule）、§9（风险）、§10（Evidence/Proposal）、§11（Notification/Report）、§13（存储与事务）；DOC-02 §3.3（三层 DTO 分离）、§4（模块）；DOC-03 §3（对象目录）、§5（事件）、§6（枚举）、§7（状态机）、§8（关联）；DOC-04（Task/Workflow/Schedule/采集对象）；DOC-05（数据流贯穿机制）。

### 1.4 记法约定

本文档每个对象均采用「TypeScript `interface` 代码块为主体 + 字段表」的双记法。字段表列定义为：

| 列 | 含义 |
| ---- | ---- |
| 字段 | 字段名（JSON 与 TS 同构，camelCase） |
| 类型 | TS 类型引用 |
| 必填 | `Y`（必有）/ `N`（可缺省） |
| 约束 | 值域、校验、业务约束 |
| JSON 表示 | 落盘/序列化时的表示法 |

类型引用约定：`→` 表示该字段为另一对象的品牌化 ID 引用；`[]` 表示数组；`?` 表示可选（与「必填=N」对应）；`string | null` 显式标注可空。

## 2. 全局命名与类型约定

### 2.1 品牌化 ID 约定

- 所有跨边界标识一律使用品牌化类型 `Branded<B>`，杜绝裸 `string` 作为业务 ID 的对外类型。
- 基础类型定义：

```ts
declare const __brand: unique symbol;
type Branded<T, B extends string> = T & { readonly [__brand]: B };
```

- 命名规则：`{Domain}{对象}Id`，例如 `TenantId`、`TaskId`、`RiskEventId`。核心品牌化 ID 目录见 §3。
- JSON 表示：品牌化 ID 直接序列化为其底层原始值（字符串或数值），不附带品牌标记；反序列化时由边界校验后重新施加品牌。

### 2.2 值类型序列化约定

#### 2.2.1 Money（金额）

金额采用精确十进制语义，禁止以二进制浮点数落盘或比较。

```ts
type CurrencyCode = Branded<string, 'CurrencyCode'>; // ISO-4217 三位字母，如 CNY/USD/EUR
interface Money {
  value: string;      // 定点字符串，如 "123.45"
  scale: number;      // 小数位数
  currency: CurrencyCode;
}
```

- `value` 为定点字符串，禁止科学计数法与 `+`/`,` 等非数字字符。
- 比较必须基于定点十进制（转换到共同 `scale` 后按整数比较），禁止 `parseFloat`。
- 跨币种汇总必须先配置可靠汇率来源、有效时间、版本与换算精度，未配置时禁止直接相加。
- JSON 表示：`{ "value": "123.45", "scale": 2, "currency": "CNY" }`。

#### 2.2.2 Instant（时间戳）

```ts
type Instant = Branded<string, 'Instant'>; // 绝对时刻，UTC 存储
```

- 绝对时刻一律 UTC 存储，JSON 表示采用 ISO-8601 含时区（如 `2026-11-10T08:00:00.000Z`）。
- 展示与业务计算按租户时区（IANA tz）换算。

#### 2.2.3 TimeWindow（时间窗口）

```ts
interface TimeWindow {
  start: Instant;  // 含
  end: Instant;    // 不含
}
```

- 窗口采用左闭右开语义 `[start, end)`；`start < end` 必须成立。
- 跨时区统计或比较先换算为 UTC 绝对时刻再判定。

#### 2.2.4 Version（版本）

```ts
type EntityVersion = number;       // 实体乐观版本，配合 expectedVersion 防静默覆盖
type DefinitionVersion = string;   // 定义版本（Rule/Baseline/Metric 定义）
type SchemaVersion = string;       // 事件/数据 Schema 版本（JSON 表示原样字符串）
```

- 三者分属不同生命周期，不得相互替代（对齐 DOC-01 §13.3）。
- JSON 表示：`EntityVersion` 为整数；`DefinitionVersion`/`SchemaVersion` 为字符串。

#### 2.2.5 IdempotencyKey 与确定性 Hash

```ts
type IdempotencyKey = Branded<string, 'IdempotencyKey'>; // 确定性 Hash（hex）
```

- 幂等键 = 租户 + 数据源 + 表 + 主键 + 源版本，按固定顺序拼接各字段值后做确定性 Hash（Hash 算法与冲突语义见 DOC-11 §幂等）。
- JSON 表示：hex 字符串。

### 2.3 枚举序列化约定

- 命名沿用 DOC-03 §6：风险相关状态用 CamelCase（`Pending`/`Triggered`/`Ongoing`/`Recovered`…），其余枚举用 UPPER_SNAKE（`SUCCESS`/`NORMAL`/`COUNTER`…）。
- JSON 表示：枚举值以字符串常量原样存储与传输；禁止数字编码。
- 未知值处理：反序列化遇到未知值不得静默映射，必须走 `UNKNOWN`/`INVALID` 或进入协调（见 §7.5）。

### 2.4 必填 / 可选 / 可空三态约定

| 记号 | 含义 | 缺省行为 |
| ---- | ---- | -------- |
| `field: T` | 必填 | 缺失即校验失败 |
| `field?: T` | 可选 | 可缺省，有明确默认语义 |
| `field: T \| null` | 可空 | 允许显式 null，区别于缺失 |

### 2.5 JSON 字段命名总规则

- 字段命名统一 camelCase，与 DOC-01/03 示例（`eventId`/`tenantId`/`windowStart`/`windowEnd`/`calculationVersion`）一致。
- 时间戳字段名语义分层（§5.1）：`eventTime` / `collectedAt` / `ingestedAt`。

## 3. 品牌化 ID 目录

核心品牌化 ID 全表（底层表示均为 `string` 或 `number`，经 `Branded<...>` 施加品牌）：

| 品牌类型 | 底层 | 标识对象 | 约束 |
| ---- | ---- | ---- | ---- |
| `TenantId` | string | 租户 | 全局唯一，隔离边界 |
| `TaskId` | string | 业务任务 | 单次可独立管理任务 |
| `WorkflowId` | string | 工作流实例 | 一次工作流执行 |
| `WorkflowDefinitionId` | string | 工作流定义 | 定义与实例分离 |
| `ScheduleId` | string | 调度定义 | 触发规则 |
| `DataSourceId` | string | 数据源定义 | MySQL/SSH/Log |
| `CollectorId` | string | 采集执行单元 | 采集器 |
| `CollectionTaskId` | string | 采集任务实例 | 一次采集执行 |
| `CheckpointId` | string | 采集检查点 | 游标 |
| `CommitId` | string | 采集提交事务 | 三态 |
| `MetricDefinitionId` | string | 指标定义 | 定义版本分离 |
| `MetricResultId` | string | 指标计算结果 | 一次计算 |
| `BaselineId` | string | 基线 | Candidate/Active/Frozen |
| `RuleDefinitionId` | string | 规则定义 | 版本化 |
| `EvaluationId` | string | 规则评估结果 | 一次评估 |
| `RiskEventId` | string | 风险事实 | `tenantId+ruleId+businessObjectId` 维度 |
| `RiskCycleId` | string | 风险发生周期 | 恢复后再发新 ID |
| `AttackEventId` | string | 攻击活动 | 关联多 RiskEvent |
| `RiskRelationId` | string | 风险关联 | 方向/类型/依据 |
| `EvidenceId` | string | 证据 | 判定依据快照 |
| `ProposalId` | string | 行动建议 | 七态 |
| `NotificationId` | string | 通知 | 通知记录 |
| `DeliveryId` | string | 投递记录 | 至少一次 |
| `AttemptId` | string | 投递尝试 | 一次尝试 |
| `ReportId` | string | 报告 | JSON/Markdown |
| `AuditRecordId` | string | 审计记录 | 关键操作 |
| `EventId` | string | 标准事件 | 事件标识 |
| `IdempotencyKey` | string | 幂等键 | 确定性 Hash |
| `ConfigSnapshotRef` | string | 配置不可变快照版本引用 | 不可变，版本化（DOC-14 §6.1） |
| `SuppressionId` | string | 风险抑制/例外 | 抑制条目标识 |

> 未单列的标识（如 `Dimension` 内引用的主体 ID）按本表同模式声明：`Branded<string, '...'>`，命名遵循 `{作用域}{对象}Id`。

## 4. 公共值类型 DTO

### 4.1 Money

见 §2.2.1。字段表：

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| value | string | Y | 定点字符串，禁科学计数法 | `"123.45"` |
| scale | number | Y | 非负整数小数位数 | `2` |
| currency | CurrencyCode | Y | ISO-4217 三位字母 | `"CNY"` |

### 4.2 Instant

| 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- |
| `Instant`（引用） | Y | UTC 绝对时刻 | ISO-8601 `...Z` |

### 4.3 TimeWindow

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| start | Instant | Y | 含 | ISO-8601 |
| end | Instant | Y | 不含，`end > start` | ISO-8601 |

### 4.4 Version（EntityVersion / DefinitionVersion / SchemaVersion）

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| entityVersion | EntityVersion | N | 实体乐观锁版本 | 整数 |
| definitionVersion | DefinitionVersion | N | 定义版本 | 字符串 |
| schemaVersion | SchemaVersion | Y | 事件/数据 Schema 版本 | 字符串 |

### 4.5 IdempotencyKey / Hash

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| idempotencyKey | IdempotencyKey | Y | 确定性 Hash | hex 字符串 |

### 4.6 TenantContext（值对象）

租户可信上下文，仅由 Application/Security 边界建立，不得直接信任模型传入的 `tenantId`。

```ts
interface TenantContext {
  tenantId: TenantId;
  timezone: IanaTimezone;          // IANA tz，如 Asia/Shanghai
  configSnapshotRef?: ConfigSnapshotRef; // 配置快照引用
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| tenantId | TenantId | Y | 可信租户约束 | string |
| timezone | IanaTimezone | Y | IANA tz | `"Asia/Shanghai"` |
| configSnapshotRef | ConfigSnapshotRef | N | 配置快照引用（版本） | string |

### 4.7 ToolExecutionContext（Plugin/Application 边界 DTO）

由 DSH 的 `ToolRunContext` 适配而来，二者不得混用（DOC-02 §3.3）。

```ts
interface ToolExecutionContext {
  tenantContext: TenantContext;
  invocationId: string;          // 本次调用标识
  signal?: AbortSignal;          // 协作式取消信号
  agentRef?: string;             // 调用主体引用（DSH agent 标识，脱敏）
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| tenantContext | TenantContext | Y | 可信上下文 | object |
| invocationId | string | Y | 调用标识 | string |
| signal | AbortSignal? | N | 协作取消 | — |
| agentRef | string? | N | 调用主体（脱敏） | string |

## 5. 事件模型 DTO

### 5.1 EventMetadata（公共事件元数据）

所有标准事件共享的元数据（DOC-01 §7.9）。

```ts
interface EventMetadata {
  eventId: EventId;
  tenantId: TenantId;
  eventType: string;               // 事件类型区分，如 'transaction' | 'login' | 'apiAccess'
  schemaVersion: SchemaVersion;
  eventTime: Instant;              // 业务时间
  collectedAt: Instant;            // 采集时间
  ingestedAt: Instant;             // 入库标准化时间
  sourceId: string;                // 数据源标识
  sourceType: SourceType;          // MYSQL | SSH | LOG | HTTP(future)
  sourceReference: string;         // 来源记录定位信息
  idempotencyKey: IdempotencyKey;
  traceId?: string;                // 端到端调用链
  correlationId?: string;          // 业务关联标识
  producer: string;                // 生产者标识
  tags?: string[];                 // 标签
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| eventId | EventId | Y | 事件标识 | string |
| tenantId | TenantId | Y | 租户隔离边界 | string |
| eventType | string | Y | 事件类型判别 | string |
| schemaVersion | SchemaVersion | Y | 事件 Schema 版本 | string |
| eventTime | Instant | Y | 业务发生时间 | ISO-8601 |
| collectedAt | Instant | Y | ≥ eventTime | ISO-8601 |
| ingestedAt | Instant | Y | ≥ collectedAt | ISO-8601 |
| sourceId | string | Y | 数据源标识 | string |
| sourceType | SourceType | Y | 来源类型 | UPPER_SNAKE |
| sourceReference | string | Y | 来源记录定位 | string |
| idempotencyKey | IdempotencyKey | Y | 幂等键 | hex |
| traceId | string? | N | 跨服务调用链 | string |
| correlationId | string? | N | 业务关联 | string |
| producer | string | Y | 生产者 | string |
| tags | string[]? | N | 标签 | string[] |

时间戳分层与顺序约束：`collectedAt ≥ eventTime`，`ingestedAt ≥ collectedAt`；时钟偏差/乱序时保留原始时间戳并标记，不静默改写。

### 5.2 TransactionEvent（BR-001）

```ts
interface TransactionEvent extends EventMetadata {
  customerId: string;              // 客户标识
  accountId: string;               // 账户标识
  transactionId: string;           // 交易标识
  amount: Money;                   // 交易金额（定点十进制）
  status: TransactionStatus;       // 交易状态
  transactionTime: Instant;        // 交易时间
  type: TransactionType;           // 交易类型
  reversal?: ReversalReference;    // 退款/冲正关联
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| customerId | string | Y | 客户 | string |
| accountId | string | Y | 账户 | string |
| transactionId | string | Y | 交易 | string |
| amount | Money | Y | 定点十进制 | object |
| status | TransactionStatus | Y | 枚举 | UPPER_SNAKE |
| transactionTime | Instant | Y | 交易时间 | ISO-8601 |
| type | TransactionType | Y | 资金方向维度 | UPPER_SNAKE |
| reversal | ReversalReference? | N | 退款/冲正关联 | object |

`ReversalReference`：{ originalTransactionId, reversalType, referenceTime }，保留原始交易关系，不覆盖原交易事实。

### 5.3 LoginEvent（BR-002）

```ts
interface LoginEvent extends EventMetadata {
  subjectId: string;               // 主体标识
  accountId: string;               // 账号标识
  result: AuthenticationResult;    // 认证结果
  failureReason?: string;          // 失败原因
  sourceIp: string;                // 来源 IP（脱敏见 DOC-01 §10.2）
  deviceId?: string;               // 设备标识
  channel?: string;                // 渠道
  applicationId?: string;          // 应用标识
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| subjectId | string | Y | 主体 | string |
| accountId | string | Y | 账号 | string |
| result | AuthenticationResult | Y | 认证结果 | UPPER_SNAKE |
| failureReason | string? | N | 失败原因 | string |
| sourceIp | string | Y | 来源 IP（脱敏） | string |
| deviceId | string? | N | 设备 | string |
| channel | string? | N | 渠道 | string |
| applicationId | string? | N | 应用 | string |

### 5.4 ApiAccessEvent（BR-003）

```ts
interface ApiAccessEvent extends EventMetadata {
  requestId: string;               // 单次请求标识（同请求多阶段串联）
  apiId?: string;                  // API 标识
  apiPath: string;                 // API 路径（模板化）
  httpMethod: HttpMethod;          // HTTP 方法
  apiCategory?: ApiCategory;       // API 分类
  requestStage: RequestStage;      // 请求阶段
  subjectId?: string;
  accountId?: string;
  sourceIp: string;
  deviceId?: string;
  channel?: string;
  authResult: AuthenticationResult;
  responseStatus?: number;         // HTTP 状态码
  businessResult?: BusinessResult; // 业务结果
  latencyMs?: number;              // 延迟
  timeout?: boolean;               // 是否超时
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| requestId | string | Y | 同请求多阶段串联 | string |
| apiId | string? | N | API 标识 | string |
| apiPath | string | Y | 模板化路径 | string |
| httpMethod | HttpMethod | Y | 方法 | UPPER_SNAKE |
| apiCategory | ApiCategory? | N | 分类（无法识别用 `UNKNOWN_API`） | UPPER_SNAKE |
| requestStage | RequestStage | Y | 阶段 | UPPER_SNAKE |
| subjectId | string? | N | 主体 | string |
| accountId | string? | N | 账号 | string |
| sourceIp | string | Y | 来源 IP | string |
| deviceId | string? | N | 设备 | string |
| channel | string? | N | 渠道 | string |
| authResult | AuthenticationResult | Y | 认证结果 | UPPER_SNAKE |
| responseStatus | number? | N | HTTP 状态 | number |
| businessResult | BusinessResult? | N | 业务结果 | UPPER_SNAKE |
| latencyMs | number? | N | 延迟 | number |
| timeout | boolean? | N | 是否超时 | boolean |

约束：不同请求阶段不得混合计算同一请求总量（同 `requestId` 下不同阶段记录不得重复累计）；`traceId` 跨服务串联（在 EventMetadata 中）；HTTP 200 不必然代表业务成功。

### 5.5 EventState 存储表示

事件处理状态（DOC-03 §7.3）：

| 枚举值 | 含义 | 存储 |
| ---- | ---- | ---- |
| `ACCEPTED` | 接受并进入处理 | `"ACCEPTED"` |
| `DUPLICATE` | 幂等重复 | `"DUPLICATE"` |
| `REJECTED` | 校验失败拒绝 | `"REJECTED"` |
| `QUARANTINED` | 隔离待协调 | `"QUARANTINED"` |
| `SUPERSEDED` | 被新版本取代 | `"SUPERSEDED"` |

事件不可原地修改；源版本变化产生新版本，旧版本标记 `SUPERSEDED` 且不参与后续计算但保留来源关系。

## 6. 领域对象 DTO（按域）

### 6.1 Tenant 域

#### Tenant（聚合根）

```ts
interface Tenant {
  tenantId: TenantId;
  timezone: IanaTimezone;    // 租户时区
  configRef?: ConfigSnapshotRef;  // 配置引用
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| tenantId | TenantId | Y | 隔离边界 | string |
| timezone | IanaTimezone | Y | IANA tz | string |
| configRef | ConfigSnapshotRef? | N | 配置引用 | string |

`TenantContext`（值对象）见 §4.6。

### 6.2 Collection 域

#### DataSource（聚合根）

```ts
interface DataSource {
  dataSourceId: DataSourceId;
  tenantId: TenantId;
  type: SourceType;          // MYSQL | SSH | LOG
  enabled: boolean;
  configRef: ConfigSnapshotRef;  // 指向 DOC-14 配置
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| dataSourceId | DataSourceId | Y | 数据源 | string |
| tenantId | TenantId | Y | 租户 | string |
| type | SourceType | Y | 类型 | UPPER_SNAKE |
| enabled | boolean | Y | 是否启用 | boolean |
| configRef | ConfigSnapshotRef | Y | 配置引用 | string |

#### Task（聚合根）

```ts
interface Task {
  taskId: TaskId;
  tenantId: TenantId;
  workflowId?: WorkflowId;
  type: TaskType;
  status: TaskStatus;               // §7.3
  priority: number;
  configSnapshotRef: ConfigSnapshotRef;        // 启动时固定快照
  attempts: Attempt[];
  createdAt: Instant;
  updatedAt: Instant;
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| taskId | TaskId | Y | 任务 | string |
| tenantId | TenantId | Y | 租户 | string |
| workflowId | WorkflowId? | N | 所属工作流 | string |
| type | TaskType | Y | 类型 | UPPER_SNAKE |
| status | TaskStatus | Y | 状态机 §7.3 | UPPER_SNAKE |
| priority | number | Y | 优先级 | number |
| configSnapshotRef | ConfigSnapshotRef | Y | 配置快照 | string |
| attempts | Attempt[] | Y | 执行/重试记录 | array |
| createdAt | Instant | Y | 创建时间 | ISO-8601 |
| updatedAt | Instant | Y | 更新时间 | ISO-8601 |

#### Workflow（聚合根）

```ts
interface Workflow {
  workflowId: WorkflowId;
  tenantId: TenantId;
  definitionId: WorkflowDefinitionId;
  status: WorkflowStatus;         // PENDING/RUNNING/SUCCEEDED/FAILED/CANCELLED
  stages: StageInfo[];
  configSnapshotRef: ConfigSnapshotRef;
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| workflowId | WorkflowId | Y | 实例 | string |
| tenantId | TenantId | Y | 租户 | string |
| definitionId | WorkflowDefinitionId | Y | 定义 | string |
| status | WorkflowStatus | Y | 状态机 §7.3 | UPPER_SNAKE |
| stages | StageInfo[] | Y | Stage 列表 | array |
| configSnapshotRef | ConfigSnapshotRef | Y | 配置快照 | string |

`StageInfo`：{ stageId, status: StageStatus（PENDING/RUNNING/SUCCEEDED/FAILED/SKIPPED）, dependsOn[] }。

#### Schedule（值对象）

```ts
interface Schedule {
  scheduleId: ScheduleId;
  triggerType: TriggerType;      // TIMED | EVENT | MANUAL
  cron?: string;
  scope: { tenants?: TenantId[]; targets?: string[] };
  configSnapshotRef: ConfigSnapshotRef;
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| scheduleId | ScheduleId | Y | 调度 | string |
| triggerType | TriggerType | Y | 触发来源 | UPPER_SNAKE |
| cron | string? | N | 定时表达式 | string |
| scope | object | Y | 租户/目标范围 | object |
| configSnapshotRef | ConfigSnapshotRef | Y | 配置快照 | string |

#### Collector（实体）

```ts
interface Collector {
  collectorId: CollectorId;
  dataSourceId: DataSourceId;
  mode: CollectionMode;          // §2.3（FULL/INCREMENTAL/TIME_RANGE/SNAPSHOT/TAIL）
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| collectorId | CollectorId | Y | 采集单元 | string |
| dataSourceId | DataSourceId | Y | 数据源 | string |
| mode | CollectionMode | Y | 采集模式 | UPPER_SNAKE |

#### CollectionTask（聚合根）

```ts
interface CollectionTask {
  collectionTaskId: CollectionTaskId;
  taskId: TaskId;
  dataSourceId: DataSourceId;
  mode: CollectionMode;
  status: CollectionStatus;      // SUCCEEDED/PARTIAL/FAILED/CANCELLED/TIMED_OUT
  checkpointId?: CheckpointId;
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| collectionTaskId | CollectionTaskId | Y | 采集实例 | string |
| taskId | TaskId | Y | 关联业务任务 | string |
| dataSourceId | DataSourceId | Y | 数据源 | string |
| mode | CollectionMode | Y | 模式 | UPPER_SNAKE |
| status | CollectionStatus | Y | 执行结果 | UPPER_SNAKE |
| checkpointId | CheckpointId? | N | 检查点 | string |

#### CollectionCommit（值对象）

```ts
interface CollectionCommit {
  commitId: CommitId;
  state: CollectionCommitState;      // PREPARED/DATA_PERSISTED/COMMITTED
  checkpointId?: CheckpointId;
  persistedAt?: Instant;
  committedAt?: Instant;
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| commitId | CommitId | Y | 提交事务 | string |
| state | CollectionCommitState | Y | 三态 | UPPER_SNAKE |
| checkpointId | CheckpointId? | N | 检查点 | string |
| persistedAt | Instant? | N | 数据持久化时间 | ISO-8601 |
| committedAt | Instant? | N | 提交时间 | ISO-8601 |

#### Checkpoint（值对象）

```ts
interface Checkpoint {
  checkpointId: CheckpointId;
  dataSourceId: DataSourceId;
  cursor: Record<string, unknown>;   // MySQL 复合游标 / 日志文件身份 + byteOffset
  timePrecision?: string;
  tieBreaker?: string;               // 并列记录处理策略
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| checkpointId | CheckpointId | Y | 检查点 | string |
| dataSourceId | DataSourceId | Y | 数据源 | string |
| cursor | object | Y | 游标值 | object |
| timePrecision | string? | N | 时间精度 | string |
| tieBreaker | string? | N | 并列处理 | string |

### 6.3 Metric 域

#### MetricDefinition（聚合根）

```ts
interface MetricDefinition {
  metricId: MetricDefinitionId;
  tenantId: TenantId;
  name: string;
  type: MetricType;              // COUNTER/GAUGE/RATE/RATIO/DISTRIBUTION/DERIVED
  unit?: string;
  expression: string;            // 序列化 MetricSpec（引用 DOC-09）
  definitionVersion: DefinitionVersion;
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| metricId | MetricDefinitionId | Y | 指标定义 | string |
| tenantId | TenantId | Y | 租户 | string |
| name | string | Y | 名称 | string |
| type | MetricType | Y | 类型 | UPPER_SNAKE |
| unit | string? | N | 单位 | string |
| expression | string | Y | 指标 DSL 表达式（引 DOC-09） | string |
| definitionVersion | DefinitionVersion | Y | 定义版本 | string |

约束：`type`（MetricType）与 `expression` 中 `MetricSpec.type` 必须一致，以 `expression` 为准；`expression` 为整份 `MetricSpec` 的序列化（DOC-09）。

#### MetricResult（值对象）

```ts
interface MetricResult {
  metricResultId: MetricResultId;
  metricId: MetricDefinitionId;
  tenantId: TenantId;
  dimension: Dimension;
  value: MetricValue;            // 数值表示由 valueEncoding 决定（MONEY/COUNT/RATIO/DECIMAL，DOC-09 §4.4）
  unit?: string;
  sampleCount: number;
  windowStart: Instant;
  windowEnd: Instant;            // [start, end)
  dataQuality: DataQuality;
  lineage: Lineage;
  calculationVersion: SchemaVersion;
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| metricResultId | MetricResultId | Y | 结果 | string |
| metricId | MetricDefinitionId | Y | 指标 | string |
| tenantId | TenantId | Y | 租户 | string |
| dimension | Dimension | Y | 维度 | object |
| value | MetricValue | Y | 值编码由 valueEncoding 决定（DOC-09 §4.4） | string/number |
| unit | string? | N | 单位 | string |
| sampleCount | number | Y | 样本数 | number |
| windowStart | Instant | Y | 含 | ISO-8601 |
| windowEnd | Instant | Y | 不含 | ISO-8601 |
| dataQuality | DataQuality | Y | 数据质量 | UPPER_SNAKE |
| lineage | Lineage | Y | 计算来源 | object |
| calculationVersion | SchemaVersion | Y | 计算版本 | string |

`value` 的数值表示由 `valueEncoding`（DOC-09 §4.4）决定，与 `MetricType` 正交：`MONEY`→`Money`（定点字符串 + scale + 币种）、`COUNT`→整数、`RATIO`/`DECIMAL`→声明精度浮点；`MetricType` 仅决定计算语义（COUNTER/GAUGE/RATE/RATIO/DISTRIBUTION/DERIVED），不作为值编码判别。

#### Dimension（值对象）

```ts
interface Dimension {
  entries: Record<string, string>;   // 维度键值，如 customer/account/ip/device/channel
}
```

#### DataQuality（枚举/值对象）

`NORMAL / STALE / PARTIAL / ERROR / INVALID`（独立于 CollectionStatus，详见 §7.4）。

#### Lineage（值对象）

```ts
interface Lineage {
  sources: LineageRef[];            // 上游事件/指标引用
  dependencies?: string[];          // 派生依赖
  computationRef?: string;          // 计算实现引用
}
```

#### Baseline（聚合根）

> 结果对象：承接 Baseline Engine 计算的基线状态与统计量；基线**定义**（窗口/算法/`factor`/`minSampleSize` 等定义参数）见 DOC-09 §15.8。

```ts
interface Baseline {
  baselineId: BaselineId;
  tenantId: TenantId;
  metricId: MetricDefinitionId;
  state: BaselineState;                          // Candidate/Active/Frozen，状态机见 DOC-09 §15.2
  statistics?: BaselineStatistics;
  version: DefinitionVersion;
  minSampleSize?: number;
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| baselineId | BaselineId | Y | 基线 | string |
| tenantId | TenantId | Y | 租户 | string |
| metricId | MetricDefinitionId | Y | 指标 | string |
| state | BaselineState | Y | Candidate/Active/Frozen（状态机权威见 DOC-09 §15.2） | CamelCase |
| statistics | BaselineStatistics? | N | 基线统计量结果（对齐 DOC-09 §15.4） | object |
| version | DefinitionVersion | Y | 版本 | string |
| minSampleSize | number? | N | 最小样本量（激活门槛见 DOC-09 §15.3） | number |

#### BaselineStatistics（基线统计量结果）

```ts
/**
 * 基线统计量结果：承载 DOC-09 §15.4 三方法（STDDEV/PERCENTILE/ZSCORE）的计算产物。
 * 金额类数值走定点十进制（DOC-06 §2.2.1）。
 */
interface BaselineStatistics {
  method: BaselineMethod;            // STDDEV/PERCENTILE/ZSCORE（算法权威 DOC-09 §15.4）
  sampleSize: number;                // 参与计算的样本数
  mean?: number;                     // 均值（STDDEV/ZSCORE）
  stddev?: number;                   // 标准差（STDDEV/ZSCORE）
  percentile?: number;               // 第 factor 分位值（PERCENTILE）
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| method | BaselineMethod | Y | STDDEV/PERCENTILE/ZSCORE（DOC-09 §15.4） | UPPER_SNAKE |
| sampleSize | number | Y | 参与计算的样本数（≥ minSampleSize） | number |
| mean | number? | N | 均值（STDDEV/ZSCORE） | number |
| stddev | number? | N | 标准差（STDDEV/ZSCORE） | number |
| percentile | number? | N | 分位值（PERCENTILE） | number |

### 6.4 Rule 域

#### RuleDefinition（聚合根）

```ts
interface RuleDefinition {
  ruleId: RuleDefinitionId;
  tenantId: TenantId;
  name: string;
  ruleVersion: DefinitionVersion;
  expressionRef: string;            // DSL/AST 引用（语法见 DOC-10）
  thresholds?: ThresholdSpec[];
  windows?: TimeWindow[];
  enabled: boolean;
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| ruleId | RuleDefinitionId | Y | 规则 | string |
| tenantId | TenantId | Y | 租户 | string |
| name | string | Y | 名称 | string |
| ruleVersion | DefinitionVersion | Y | 版本 | string |
| expressionRef | string | Y | DSL/AST 引用 | string |
| thresholds | ThresholdSpec[]? | N | 固定/动态阈值 | array |
| windows | TimeWindow[]? | N | 多窗口 | array |
| enabled | boolean | Y | 是否启用 | boolean |

#### EvaluationResult（值对象）

```ts
interface EvaluationResult {
  evaluationId: EvaluationId;
  ruleId: RuleDefinitionId;
  ruleVersion: DefinitionVersion;
  inputMetricVersions: Record<string, SchemaVersion>;
  dataQuality: DataQuality;
  matched: boolean;
  score?: RiskScore;
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| evaluationId | EvaluationId | Y | 评估 | string |
| ruleId | RuleDefinitionId | Y | 规则 | string |
| ruleVersion | DefinitionVersion | Y | 规则版本 | string |
| inputMetricVersions | object | Y | 输入指标版本 | object |
| dataQuality | DataQuality | Y | 数据质量 | UPPER_SNAKE |
| matched | boolean | Y | 是否命中（未命中属正常） | boolean |
| score | RiskScore? | N | 风险评分 | object |

### 6.5 Risk 域（聚合与关联对象）

#### RiskEvent（聚合根）

```ts
interface RiskEvent {
  riskEventId: RiskEventId;
  tenantId: TenantId;
  ruleId: RuleDefinitionId;
  businessObjectId: string;      // 业务对象（客户/账号/IP/设备等）
  severity: Severity;
  score: RiskScore;
  currentCycleId?: RiskCycleId;
  createdAt: Instant;
  updatedAt: Instant;
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| riskEventId | RiskEventId | Y | 风险事实 | string |
| tenantId | TenantId | Y | 租户 | string |
| ruleId | RuleDefinitionId | Y | 规则 | string |
| businessObjectId | string | Y | 业务对象 | string |
| severity | Severity | Y | 等级 | UPPER_SNAKE |
| score | RiskScore | Y | 评分 | object |
| currentCycleId | RiskCycleId? | N | 当前周期 | string |
| createdAt | Instant | Y | 创建 | ISO-8601 |
| updatedAt | Instant | Y | 更新 | ISO-8601 |

身份维度 `tenantId + ruleId + businessObjectId` 唯一；恢复后再发复用原 `riskEventId`。

#### RiskCycle（聚合根）

```ts
interface RiskCycle {
  riskCycleId: RiskCycleId;
  riskEventId: RiskEventId;
  status: RiskCycleStatus;       // Pending/Normal/Triggered/Ongoing/Recovered/Unknown
  openedAt: Instant;
  closedAt?: Instant;
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| riskCycleId | RiskCycleId | Y | 周期 | string |
| riskEventId | RiskEventId | Y | 风险事实 | string |
| status | RiskCycleStatus | Y | 六态 §7.1 | CamelCase |
| openedAt | Instant | Y | 开始 | ISO-8601 |
| closedAt | Instant? | N | 结束 | ISO-8601 |

#### AttackEvent（聚合根）

```ts
interface AttackEvent {
  attackEventId: AttackEventId;
  tenantId: TenantId;
  riskEventRefs: RiskEventId[];    // 关联多 RiskEvent
  attackType?: string;
  createdAt: Instant;
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| attackEventId | AttackEventId | Y | 攻击活动 | string |
| tenantId | TenantId | Y | 租户 | string |
| riskEventRefs | RiskEventId[] | Y | 关联风险事实 | array |
| attackType | string? | N | 攻击类型 | string |
| createdAt | Instant | Y | 创建 | ISO-8601 |

#### RiskEventHistory（实体）

```ts
interface RiskEventHistory {
  riskEventId: RiskEventId;
  fromStatus?: RiskCycleStatus;
  toStatus: RiskCycleStatus;
  triggerEvent: string;          // 触发事件/条件
  ruleVersion?: DefinitionVersion;
  at: Instant;
  operator?: string;             // 操作者（自动为空）
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| riskEventId | RiskEventId | Y | 风险事实 | string |
| fromStatus | RiskCycleStatus? | N | 原状态 | CamelCase |
| toStatus | RiskCycleStatus | Y | 目标状态 | CamelCase |
| triggerEvent | string | Y | 触发事件 | string |
| ruleVersion | DefinitionVersion? | N | 规则版本 | string |
| at | Instant | Y | 时间 | ISO-8601 |
| operator | string? | N | 操作者 | string |

每个状态转换必须持久化一条 `RiskEventHistory`。

#### RiskRelation（实体）

```ts
interface RiskRelation {
  relationId: RiskRelationId;
  fromId: string;
  toId: string;
  type: RelationType;            // §8
  basis?: string;
  confidence?: number;           // 可信度
  validFrom: Instant;
  validTo?: Instant;
  source: RelationSource;        // AUTO | MANUAL
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| relationId | RiskRelationId | Y | 关联 | string |
| fromId | string | Y | 起点 | string |
| toId | string | Y | 终点 | string |
| type | RelationType | Y | 类型 | UPPER_SNAKE |
| basis | string? | N | 依据 | string |
| confidence | number? | N | 可信度 | number |
| validFrom | Instant | Y | 有效起 | ISO-8601 |
| validTo | Instant? | N | 有效止 | ISO-8601 |
| source | RelationSource | Y | 自动/人工 | UPPER_SNAKE |

#### RiskEvidenceReference（值对象）

```ts
interface RiskEvidenceReference {
  riskEventId: RiskEventId;
  evidenceId: EvidenceId;
}
```

#### RiskImpactScope（值对象）

```ts
interface RiskImpactScope {
  scope: string[];                 // 影响范围维度
  affectedTenants?: TenantId[];    // 跨租户需显式授权
}
```

#### RiskSuppression（实体）

```ts
interface RiskSuppression {
  suppressionId: SuppressionId;
  riskEventId?: RiskEventId;
  reason: string;
  operator: string;
  validFrom: Instant;
  validTo: Instant;                // 到期自动失效
  scope?: RiskImpactScope;
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| suppressionId | SuppressionId | Y | 抑制/例外 | string |
| riskEventId | RiskEventId? | N | 目标风险 | string |
| reason | string | Y | 原因 | string |
| operator | string | Y | 操作者 | string |
| validFrom | Instant | Y | 有效起 | ISO-8601 |
| validTo | Instant | Y | 有效止 | ISO-8601 |
| scope | RiskImpactScope? | N | 范围 | object |

#### RiskEvaluationReference（值对象）

```ts
interface RiskEvaluationReference {
  riskEventId: RiskEventId;
  evaluationId: EvaluationId;
}
```

#### RiskScore（值对象）

```ts
interface RiskScore {
  score: number;        // 确定性评分
  severity: Severity;   // 等级（由明确映射规则转换）
  reason?: string;
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| score | number | Y | 评分 | number |
| severity | Severity | Y | 等级 | UPPER_SNAKE |
| reason | string? | N | 评分依据 | string |

`score` 与 `severity` 分离，转换关系由明确规则定义；LLM 不得直接决定最终分数/等级。

#### Severity（枚举）

`INFO / LOW / MEDIUM / HIGH / CRITICAL`，统一字典，用于通知/报告/查询。

### 6.6 Evidence 域

#### Evidence（聚合根）

```ts
interface Evidence {
  evidenceId: EvidenceId;
  riskEventId: RiskEventId;
  sourceEvents: EventId[];
  metricVersions: MetricResult[];      // 指标及计算版本
  ruleVersion: DefinitionVersion;
  keyInputSnapshot: unknown;           // 关键输入快照（脱敏）
  dataQuality: DataQuality;
  judgedAt: Instant;
  calculationVersion: SchemaVersion;
  relations?: RiskRelation[];
  sourceReferences?: string[];
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| evidenceId | EvidenceId | Y | 证据 | string |
| riskEventId | RiskEventId | Y | 风险关联 | string |
| sourceEvents | EventId[] | Y | 来源事件 | array |
| metricVersions | MetricResult[] | Y | 指标+计算版本 | array |
| ruleVersion | DefinitionVersion | Y | 规则版本 | string |
| keyInputSnapshot | unknown | Y | 关键输入快照 | object |
| dataQuality | DataQuality | Y | 数据质量 | UPPER_SNAKE |
| judgedAt | Instant | Y | 判定时间 | ISO-8601 |
| calculationVersion | SchemaVersion | Y | 计算版本 | string |
| relations | RiskRelation[]? | N | 关联 | array |
| sourceReferences | string[]? | N | 来源引用 | array |

约束：Evidence 不可无审计覆盖；Hash 可检测内容变化但不单独证明不可篡改；日志与 Evidence 不输出明文敏感字段。

### 6.7 Proposal 域

#### ActionProposal（聚合根）

```ts
interface ActionProposal {
  proposalId: ProposalId;
  tenantId: TenantId;
  riskEventId: RiskEventId;
  riskCycleId?: RiskCycleId;
  type: ProposalType;
  content: string;
  reason: string;
  evidenceRefs: EvidenceId[];
  applicableTo?: string;
  generatedAt: Instant;
  ruleVersion: DefinitionVersion;
  status: ProposalStatus;        // 七态 §7.2
  audit: AuditInfo;
  versions?: ProposalVersion[];
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| proposalId | ProposalId | Y | 建议 | string |
| tenantId | TenantId | Y | 租户 | string |
| riskEventId | RiskEventId | Y | 风险事实 | string |
| riskCycleId | RiskCycleId? | N | 风险周期 | string |
| type | ProposalType | Y | 类型：SUPPRESS/ESCALATE/NOTIFY | UPPER_SNAKE |
| content | string | Y | 建议内容 | string |
| reason | string | Y | 建议原因 | string |
| evidenceRefs | EvidenceId[] | Y | Evidence 引用 | array |
| applicableTo | string? | N | 适用对象 | string |
| generatedAt | Instant | Y | 生成时间 | ISO-8601 |
| ruleVersion | DefinitionVersion | Y | 规则版本 | string |
| status | ProposalStatus | Y | 状态 | UPPER_SNAKE |
| audit | AuditInfo | Y | 审计信息 | object |
| versions | ProposalVersion[]? | N | 版本列表 | array |

约束：Proposal 不代表真实动作已执行；APPROVED 不代表动作执行成功；相同处置意图（同 RiskEvent + 类型 + 适用对象）追加版本 → 旧版本 `SUPERSEDED`。

`ProposalType` 取值：`SUPPRESS`（抑制/降噪）、`ESCALATE`（升级）、`NOTIFY`（通知介入），依据 DOC-01 §10.3（Proposal 类型权威定义）。

`ProposalVersion`：{ version, content, reason, createdAt, supersedes? }。`AuditInfo`：{ createdAt, createdBy, updatedAt? , approvedAt?, approvedBy? }。

### 6.8 Notification 域

```ts
interface Notification {
  notificationId: NotificationId;
  tenantId: TenantId;
  kind: NotificationKind;        // 风险通知/维护等
  riskEventId?: RiskEventId;
  proposalId?: ProposalId;
  status: NotificationClosure;   // 待确认/已确认/处理中/已解决
  recipients: string[];
  createdAt: Instant;
}

interface Delivery {
  deliveryId: DeliveryId;
  notificationId: NotificationId;
  channel: DeliveryChannel;      // WEBHOOK/SMTP/IM
  status: DeliveryStatus;        // 至少一次投递
  createdAt: Instant;
}

interface Attempt {
  attemptId: AttemptId;
  deliveryId: DeliveryId;
  result: AttemptResult;         // SUCCESS/FAILED/UNKNOWN
  at: Instant;
}
```

| 对象 | 关键字段 | 必填 | 约束 |
| ---- | ---- | ---- | ---- |
| Notification | notificationId/tenantId/kind/status/recipients | Y | 通知记录独立 |
| Delivery | deliveryId/notificationId/channel/status | Y | 投递记录独立 |
| Attempt | attemptId/deliveryId/result/at | Y | 一次尝试 |

约束：Notification / Delivery / Attempt 三者分离；至少一次投递、不承诺 exactly-once；`UNKNOWN` 投递结果进入协调流程；通知失败不导致 RiskEvent/Proposal 丢失；通知确认不自动关闭风险。

### 6.9 Report 域

```ts
interface Report {
  reportId: ReportId;
  tenantId: TenantId;
  format: ReportFormat;            // JSON | MARKDOWN
  dataThrough: Instant;            // 数据截止时间
  sourceDataVersion: string;       // 源数据版本
  ruleVersion: DefinitionVersion;
  calculationVersion: SchemaVersion;
  generatedAt: Instant;
  consistency: ReportConsistency;  // POINT_IN_TIME/BEST_EFFORT/PARTIAL
  fileLocation?: string;
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| reportId | ReportId | Y | 报告 | string |
| tenantId | TenantId | Y | 租户 | string |
| format | ReportFormat | Y | 格式 | UPPER_SNAKE |
| dataThrough | Instant | Y | 截止时间 | ISO-8601 |
| sourceDataVersion | string | Y | 源数据版本 | string |
| ruleVersion | DefinitionVersion | Y | 规则版本 | string |
| calculationVersion | SchemaVersion | Y | 计算版本 | string |
| generatedAt | Instant | Y | 生成时间 | ISO-8601 |
| consistency | ReportConsistency | Y | 一致性级别 | UPPER_SNAKE |
| fileLocation | string? | N | 文件位置 | string |

约束：多来源默认 `BEST_EFFORT`；数据不完整标记 `PARTIAL` 或相应数据质量；历史报告不得因源数据后续变化自动修改。

### 6.10 Audit 域

```ts
interface AuditRecord {
  auditRecordId: AuditRecordId;
  tenantId: TenantId;
  actor?: string;               // 操作者/调用主体（脱敏）
  action: string;               // 操作类型
  target: string;               // 操作对象
  result: string;               // 操作结果
  source?: string;              // 来源信息
  at: Instant;
}
```

| 字段 | 类型 | 必填 | 约束 | JSON 表示 |
| ---- | ---- | ---- | ---- | ---- |
| auditRecordId | AuditRecordId | Y | 审计 | string |
| tenantId | TenantId | Y | 租户 | string |
| actor | string? | N | 操作者（脱敏） | string |
| action | string | Y | 操作类型 | string |
| target | string | Y | 操作对象 | string |
| result | string | Y | 结果 | string |
| source | string? | N | 来源 | string |
| at | Instant | Y | 时间 | ISO-8601 |

### 6.11 Security 域

```ts
interface SecretReference {
  secretRef: string;            // 指向 Secret 机制，不落明文 YAML
  provider: string;             // Secret Provider 标识
}

interface MaskingPolicy {
  category: SensitiveCategory;  // CREDENTIAL / KEY / PII
  action: MaskingAction;        // DELETE / HASH / MASK
  config?: string;
}
```

| 对象 | 关键字段 | 约束 |
| ---- | ---- | ---- |
| SecretReference | secretRef/provider | 不落明文，走 Secret 机制 |
| MaskingPolicy | category/action | 认证凭据/密钥=DELETE；PII=HASH/MASK |

敏感字段三类：认证凭据（删除）、密钥（删除）、PII（Hash/掩码），遵循 DOC-01 §10.2。

## 7. 状态枚举存储表示与迁移

### 7.1 风险状态（RiskCycleStatus，六态）

| 状态 | 存储 | 说明 |
| ---- | ---- | ---- |
| `Pending` | `"Pending"` | 待评估 |
| `Normal` | `"Normal"` | 正常 |
| `Triggered` | `"Triggered"` | 已触发 |
| `Ongoing` | `"Ongoing"` | 持续 |
| `Recovered` | `"Recovered"` | 已恢复 |
| `Unknown` | `"Unknown"` | 诊断态，独立于正常顺序 |

风险相关状态用 CamelCase（DOC-03 §6）。转换规则见 DOC-03 §7.1；每次转换持久化 `RiskEventHistory`。

### 7.2 Proposal 状态（七态）

| 状态 | 存储 | 终态 |
| ---- | ---- | ---- |
| `GENERATED` | `"GENERATED"` | 否 |
| `PENDING_REVIEW` | `"PENDING_REVIEW"` | 否 |
| `APPROVED` | `"APPROVED"` | 否（可 SUPERSEDED） |
| `REJECTED` | `"REJECTED"` | 是 |
| `WITHDRAWN` | `"WITHDRAWN"` | 是 |
| `EXPIRED` | `"EXPIRED"` | 是 |
| `SUPERSEDED` | `"SUPERSEDED"` | 是 |

转换规则见 DOC-03 §7.2：终态不再转换，不得回退 `GENERATED`/`PENDING_REVIEW`，已 APPROVED 不得 WITHDRAWN。

### 7.3 Task / Workflow / Stage 状态

| 对象 | 状态集合（存储 UPPER_SNAKE） |
| ---- | ---- |
| Task | `PENDING/QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED/TIMED_OUT` |
| Workflow | `PENDING/RUNNING/SUCCEEDED/FAILED/CANCELLED` |
| Stage（StageStatus） | `PENDING/RUNNING/SUCCEEDED/FAILED/SKIPPED` |

转换规则见 DOC-04 §6.1/§6.2。

### 7.4 四套状态枚举区分

| 枚举 | 存储值域 | 生命周期归属 |
| ---- | ---- | ---- |
| CollectionStatus | `SUCCEEDED/PARTIAL/FAILED/CANCELLED/TIMED_OUT` | Collection Task |
| DataQuality | `NORMAL/STALE/PARTIAL/ERROR/INVALID` | Data/Event |
| EventState | `ACCEPTED/DUPLICATE/REJECTED/QUARANTINED/SUPERSEDED` | Event |
| 覆盖率状态 | 未配置/未启用/采集失败/数据过期/规则缺失/正常 | Monitoring Coverage |

四者分属不同生命周期，不得相互替代（DOC-03 §6.1）；各枚举值域权威见 DOC-03 §6。

### 7.5 状态持久化与迁移规则

- 状态一律以字符串常量原样存储与传输，禁止数字编码。
- 反序列化遇未知值不得静默映射：能判定者归入 `UNKNOWN`/`INVALID`，否则进入协调/隔离。
- 状态新增：以追加枚举值进行向后兼容；状态删除/改名需走 Schema 迁移（DOC-17 Migration）。
- 状态转换不可中断的记录（`RiskEventHistory`、Proposal 状态历史）不可无审计覆盖。

## 8. 关联 DTO 结构

### 8.1 RelationType 与通用关联 DTO

```ts
type RelationType =
  | 'RELATED_TO' | 'CAUSED_BY' | 'TRIGGERED_BY'
  | 'AFFECTS' | 'PART_OF' | 'DUPLICATE_OF';

interface RelationDTO {
  relationId?: string;
  from: string;                 // 起点标识
  to: string;                   // 终点标识
  type: RelationType;
  basis?: string;               // 依据
  confidence?: number;          // 可信度 0..1
  validFrom: Instant;
  validTo?: Instant;
  source: RelationSource;       // AUTO | MANUAL
}
```

关联必须保存方向、关系类型、依据、可信度、有效时间、来源；自动关联与人工关联必须能区分。

### 8.2 关键关联

| 关联 | 结构 |
| ---- | ---- |
| RiskEvent ↔ RiskCycle | `RiskCycle.riskEventId → RiskEvent` |
| AttackEvent ↔ RiskEvent | `AttackEvent.riskEventRefs[]` |
| RiskEvent ↔ Evidence | `RiskEvidenceReference` |
| RiskEvent ↔ Evaluation | `RiskEvaluationReference` |
| Subject Relation | 通用 `RelationDTO`（登录失败维度关联，记录方向/类型/依据/可信度/有效时间/来源） |

## 9. 枚举全集落地

| 枚举 | TS 类型 | JSON 表示 |
| ---- | ---- | ---- |
| TransactionStatus | union of SUCCESS/FAILED/PENDING/PROCESSING/REVERSED/REFUNDED/CANCELLED/UNKNOWN | UPPER_SNAKE |
| TransactionType | DEBIT/CREDIT/TRANSFER/REFUND/CHARGEBACK/ADJUSTMENT | UPPER_SNAKE |
| CurrencyCode | ISO-4217 三位字母 | string |
| AuthenticationResult | SUCCESS/AUTH_FAILURE/ACCOUNT_REJECTED/MFA_FAILURE/CAPTCHA_FAILURE/SYSTEM_FAILURE/NETWORK_FAILURE/UNKNOWN | UPPER_SNAKE |
| RequestStage | REQUEST_RECEIVED/AUTHENTICATED/BUSINESS_STARTED/BUSINESS_COMPLETED | UPPER_SNAKE |
| CollectionMode | FULL/INCREMENTAL/TIME_RANGE/SNAPSHOT/TAIL | UPPER_SNAKE |
| CollectionStatus | SUCCEEDED/PARTIAL/FAILED/CANCELLED/TIMED_OUT | UPPER_SNAKE |
| CollectionCommitState | PREPARED/DATA_PERSISTED/COMMITTED | UPPER_SNAKE |
| DataQuality | NORMAL/STALE/PARTIAL/ERROR/INVALID | UPPER_SNAKE |
| EventState | ACCEPTED/DUPLICATE/REJECTED/QUARANTINED/SUPERSEDED | UPPER_SNAKE |
| MetricType | COUNTER/GAUGE/RATE/RATIO/DISTRIBUTION/DERIVED | UPPER_SNAKE |
| Severity | INFO/LOW/MEDIUM/HIGH/CRITICAL | UPPER_SNAKE |
| ReportConsistency | POINT_IN_TIME/BEST_EFFORT/PARTIAL | UPPER_SNAKE |
| RelationType | RELATED_TO/CAUSED_BY/TRIGGERED_BY/AFFECTS/PART_OF/DUPLICATE_OF | UPPER_SNAKE |
| RiskCycleStatus | Pending/Normal/Triggered/Ongoing/Recovered/Unknown | CamelCase |
| BaselineState | Candidate/Active/Frozen | CamelCase |
| ProposalStatus | GENERATED/PENDING_REVIEW/APPROVED/REJECTED/WITHDRAWN/EXPIRED/SUPERSEDED | UPPER_SNAKE |
| ProposalType | SUPPRESS/ESCALATE/NOTIFY | UPPER_SNAKE |
| NotificationClosure | 待确认/已确认/处理中/已解决 | 中文常量 |
| SourceType | MYSQL/SSH/LOG/HTTP | UPPER_SNAKE |
| RelationSource | AUTO/MANUAL | UPPER_SNAKE |
| TaskType | COLLECT_BUSINESS_DATA/COLLECT_SYSTEM_METRICS/COLLECT_APPLICATION_LOGS | UPPER_SNAKE |
| TriggerType | TIMED/EVENT/MANUAL | UPPER_SNAKE |
| ReportFormat | JSON/MARKDOWN | UPPER_SNAKE |
| DeliveryChannel | WEBHOOK/SMTP/IM | UPPER_SNAKE |
| DeliveryStatus | PENDING/SENT/FAILED/UNKNOWN | UPPER_SNAKE |
| AttemptResult | SUCCESS/FAILED/UNKNOWN | UPPER_SNAKE |
| NotificationKind | RISK_NOTIFICATION/MAINTENANCE | UPPER_SNAKE |
| HealthStatus | HEALTHY/DEGRADED/UNHEALTHY/UNKNOWN | UPPER_SNAKE |
| TaskStatus | PENDING/QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED/TIMED_OUT | UPPER_SNAKE |
| WorkflowStatus | PENDING/RUNNING/SUCCEEDED/FAILED/CANCELLED | UPPER_SNAKE |
| StageStatus | PENDING/RUNNING/SUCCEEDED/FAILED/SKIPPED | UPPER_SNAKE |
| SensitiveCategory | CREDENTIAL/KEY/PII | UPPER_SNAKE |
| MaskingAction | DELETE/HASH/MASK | UPPER_SNAKE |
| ValueEncoding | MONEY/COUNT/RATIO/DECIMAL | UPPER_SNAKE |
| HttpMethod | GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS（其余 UNKNOWN） | UPPER_SNAKE |
| ApiCategory | 数据源配置驱动开放枚举 + UNKNOWN_API 兜底 | UPPER_SNAKE |
| BusinessResult | SUCCESS/FAILED/TIMEOUT/UNKNOWN | UPPER_SNAKE |
| ProposalOperation | SUBMIT/WITHDRAW/APPROVE/REJECT | UPPER_SNAKE |

（枚举值全集落地：业务/领域枚举以 DOC-03 §6 为权威（本文档补 TS 类型与 JSON 序列化落地）；运行态状态枚举 TaskStatus/WorkflowStatus/StageStatus 值域以 DOC-04 §6.1/§6.2 为权威；SensitiveCategory/MaskingAction 语义以 DOC-01 §10.2 为权威、字面值以 DOC-12/本文档 §6.11 为准；DSL 枚举 ValueEncoding 以 DOC-09 §4.4 为权威；API 事件域枚举 HttpMethod/ApiCategory/BusinessResult 以 DOC-01 §4.3 为权威；ProposalOperation 以 DOC-03 §7.2（Proposal 七态转换）为权威。）

## 10. Tool 请求/响应 DTO（Application DTO 层）

九个模型工具的工具请求/响应 DTO。此节只给字段级 DTO；工具契约语义（幂等/错误语义/渲染）由 DOC-08 定义。

### 10.1 collect_business_data

```ts
interface CollectBusinessDataRequest {
  dataSources: string[];          // 数据源范围
  tenantId?: string;              // 仅作范围提示，最终以可信 TenantContext 为准
  collectionRange?: TimeWindow;
}
interface CollectBusinessDataResult {
  taskId: TaskId;
  status: TaskStatus;
}
```

### 10.2 collect_system_metrics

```ts
interface CollectSystemMetricsRequest {
  hosts: string[];
  components: string[];           // SYS-MON-001～008
  metricScope?: string[];
}
interface CollectSystemMetricsResult {
  taskId: TaskId;
  status: TaskStatus;
}
```

### 10.3 collect_application_logs

```ts
interface CollectApplicationLogsRequest {
  logSources: string[];
  timeRange: TimeWindow;
}
interface CollectApplicationLogsResult {
  taskId: TaskId;
  status: TaskStatus;
}
```

### 10.4 calculate_metrics

```ts
interface CalculateMetricsRequest {
  metricDefinitions: string[];    // 指标定义 ID 列表
  timeWindow: TimeWindow;
}
interface CalculateMetricsResult {
  results: MetricResult[];        // 对齐 §6.3 MetricResult
}
```

### 10.5 evaluate_risk_rules

```ts
interface EvaluateRiskRulesRequest {
  ruleScope?: string[];           // 规则范围
  evaluationWindow: TimeWindow;
}
interface EvaluateRiskRulesResult {
  evaluations: EvaluationResult[];  // 含规则版本、输入指标版本、数据质量
}
```

### 10.6 query_risks

```ts
interface QueryRisksRequest {
  riskConditions?: RiskConditions;  // 风险过滤条件
  pagination: Pagination;
}
interface QueryRisksResult {
  items: RiskEventSummary[];        // 风险状态与历史
  total?: number;
  nextCursor?: string;              // keyset 续页游标（DOC-08 §3.6）
}
```

### 10.7 manage_action_proposals

```ts
interface ManageActionProposalsRequest {
  proposalId: ProposalId;
  operationType: ProposalOperation;  // 提交审批/撤回/审批通过/否决…
}
interface ManageActionProposalsResult {
  proposalId: ProposalId;
  status: ProposalStatus;            // 七态（权威见 DOC-03 §7.2）
}
```

`ProposalOperation` 与状态机（DOC-03 §7.2）的映射：

| operationType | 合法源态 | 目标态 |
| --- | --- | --- |
| SUBMIT | GENERATED | PENDING_REVIEW |
| WITHDRAW | GENERATED / PENDING_REVIEW | WITHDRAWN |
| APPROVE | PENDING_REVIEW | APPROVED |
| REJECT | PENDING_REVIEW | REJECTED |

自动触发（不经 `operationType`）：追加新版本 → `SUPERSEDED`（GENERATED/PENDING_REVIEW/APPROVED/REJECTED 均可）；`PENDING_REVIEW` 超时（默认 72h，DOC-14 §4.1）由定时任务置 `EXPIRED`。

### 10.8 generate_risk_reports

```ts
interface GenerateRiskReportsRequest {
  reportType: ReportFormat;          // JSON | MARKDOWN
  timeRange: TimeWindow;
}
interface GenerateRiskReportsResult {
  reportId: ReportId;
  fileLocation: string;
}
```

### 10.9 get_monitor_health

```ts
interface GetMonitorHealthRequest {
  components?: string[];            // SYS-MON-001～008
  dataSources?: string[];
  tenantId?: string;                // 缺省取可信 TenantContext
}
interface GetMonitorHealthResult {
  health: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN';
  plugin: { status: string; uptimeSec: number };
  dataSources: { sourceId: string; status: string; lastCheckedAt: Instant; message?: string }[];
  coverage: { configured: number; enabled: number; normal: number; degraded: number };
}
```

### 10.10 通用分页 / 稳定排序 / 错误结果承载 DTO

```ts
interface Pagination {
  page: number;
  pageSize: number;
  sort?: SortSpec[];            // 稳定排序；多字段需全序
  cursor?: string;              // keyset 分页游标
}
interface SortSpec {
  field: string;
  order: 'ASC' | 'DESC';
}
interface ErrorResult {
  kind: ErrorCategory;          // Validation/Authorization/NotFound/Conflict/Timeout/Cancellation/Persistence/ExternalDependency/Internal（类型见 DOC-11 §3.3）
  message: string;
  code?: string;
  fieldErrors?: { field: string; message: string }[];  // 字段级校验错误（DOC-08 §4）
}
```

约束：`tenantId` 在所有工具中仅作范围提示，最终以可信 `TenantContext` 为准（DOC-01 §12.2）。

## 11. 与下游文档边界与追踪

| 本文档输出 | 下游承接 |
| ---- | ---- |
| 领域对象与事件字段级 DTO | DOC-07（Repository/Port 方法签名与查询语义） |
| 九个工具请求/响应 DTO | DOC-08（Tool 接口契约：Schema/幂等/错误语义/渲染） |
| Metric/Rule DSL 引用字段 | DOC-09 / DOC-10（DSL 语法） |
| 幂等键/版本/状态存储表示 | DOC-11（幂等与恢复） |
| 配置引用字段（configRef 等） | DOC-14（配置 Schema） |
| 金额/时间/枚举序列化落地 | 各模块实现 + DOC-15（测试） |

需求追踪：每个 DTO 均以字段级映射回 BR-001～003、SYS-MON-001～008、TOOL-001～009（完整追踪表见 DOC-18）。

## 附录 A：版本与文档状态

| 版本 | 状态 | 说明 |
| ---- | ---- | ---- |
| V1.0-Baseline | Frozen | 冻结基线，开发启动依据 |

本文档已冻结，基线版本 `V1.0-Baseline`，作为开发启动依据。

**文档结束。**