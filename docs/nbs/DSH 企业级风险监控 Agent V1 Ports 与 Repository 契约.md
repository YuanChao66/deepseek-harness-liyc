# DSH 企业级风险监控 Agent V1 Ports 与 Repository 契约

| 文档属性 | 内容 |
| -------------- | ------------------------------------------ |
| 文档编号 | DSH-RISK-PORT-V1 |
| 文档名称 | DSH 企业级风险监控 Agent V1 Ports 与 Repository 契约 |
| 版本 | V1.0-Baseline |
| 文档状态 | 已冻结（Frozen） |
| 前置输入 | DOC-01（DSH-RISK-SRS-V1，V1.3-Review）；DOC-02（总体架构与模块设计）；DOC-03（领域模型与状态机设计）；DOC-04（采集与编排设计）；DOC-05（端到端数据流设计）；DOC-06（DTO 与数据模型规格） |
| 下一环节 | DOC-08（Tool 接口契约规格）、DOC-11（错误/事务/幂等/恢复）、DOC-14（配置文件规格） |
| 适用范围 | DSH 风险监控 Agent V1 插件工程 |
| 技术基线 | DeepSeek Harness 工作树 live 源码（以源码核验为准） |

## 1. 文档概述

### 1.1 编写目的

本文档定义 DSH 企业级风险监控 Agent V1 的 Port（Application 层定义的对外能力接口）与 Repository（领域对象持久化访问契约）的方法签名、查询语义、租户约束、分页/排序、版本控制、幂等语义与异常语义，作为 DOC-08（Tool 接口契约）、DOC-11（错误/事务/幂等/恢复）与各 Infrastructure Adapter 实现的契约依据。

### 1.2 边界声明

| 主题 | 归属 |
| ---- | ---- |
| 领域对象字段级 DTO、枚举、值类型 | DOC-06 |
| Repository / Port 方法签名与查询语义 | 本文档 |
| 九个模型工具入参/出参/幂等/错误语义/渲染 | DOC-08 |
| 错误分类、事务、幂等与恢复边界 | DOC-11 |
| 配置 Schema（YAML） | DOC-14 |
| 各 Adapter 的技术实现细节 | MOD-INF-* 实现（本文档只订契约，不订实现） |

本文档只订「接口契约」，不进入 Adapter 具体实现、也不进入编排细节（DOC-04）与错误恢复算法（DOC-11）。

### 1.3 前置输入与依据

DOC-01 §12（多租户）、§13（存储与事务）；DOC-02 §6（Capability Seam 接缝清单与角色分配）、§4.4（Infrastructure 模块）；DOC-03 §4（领域对象目录）；DOC-04（采集对象）；DOC-06（DTO 字段级规格）。

### 1.4 记法约定

- 契约以 TypeScript `interface` 声明方法签名为主体。
- 方法语义用「前置 / 后置 / 异常」短表或要点说明；语义引用 DOC-06 的对象与 DOC-11 的错误分类。
- 命名约定：`save`（创建/覆盖更新）/ `findById`（按 ID 查询）/ `findBy...`（按条件查询）/ `list`（分页列表）/ `delete`（逻辑删除或终态标记）。
- 所有 Repository 查询携带显式租户约束；禁止提供无租户约束的通用访问（无条件 `findById(id)` / `findAll()`）。
- 返回值约定：单条 `Promise<T | null>`；集合 `Promise<T[]>`；分页 `Promise<PageResult<T>>`。
- 异常约定：`NotFound`（缺失）与 `Conflict`（幂等冲突/版本冲突）等，映射见 §2.7。

## 2. Port 与 Repository 契约通用约定

### 2.1 方法签名式样

```ts
interface Repository<Entity, Id> {
  // 所有方法首参或作用域含 TenantContext，见 §2.2
  save(tenant: TenantContext, entity: Entity, expectedVersion?: EntityVersion): Promise<Entity>;
  findById(tenant: TenantContext, id: Id): Promise<Entity | null>;
  list(tenant: TenantContext, query: Query, page: PageQuery): Promise<PageResult<Entity>>;
  delete(tenant: TenantContext, id: Id, expectedVersion?: EntityVersion): Promise<void>;
}
```

### 2.2 租户约束

1. 每个 Repository 方法必带租户约束：首参 `tenant: TenantContext` 或显式 `tenantId: TenantId` 作用域。
2. 不提供 `findById(id)` / `findAll()` 这类无租户入口；跨租户访问必须走显式授权并留审计（DOC-12）。
3. `TenantContext` 仅由可信 Application/Security 边界建立，Repository 不信任调用方任意传入的 `tenantId` 作为授权依据（见 DOC-06 §4.6）。
4. 所有持久化写入必须携带租户归属，缺租户归属的写入拒绝（fail-closed，DOC-12）。

### 2.3 分页与稳定排序

```ts
interface PageQuery {
  page: number;           // 从 1 开始
  pageSize: number;       // 上限由配置约束
  sort?: SortSpec[];      // 多字段排序；缺省按主键升序保证稳定全序
  cursor?: string;        // keyset 分页游标（可选，优先于 page）
}
interface PageResult<T> {
  items: T[];
  total?: number;         // 可选，大数据量可不精确
  nextCursor?: string;    // keyset 续页游标
}
interface SortSpec {
  field: string;
  order: 'ASC' | 'DESC';
}
```

- 列表必须支持稳定排序；对同值记录需有确定性的次级排序键（通常是主键/`Id`）保证全序，避免分页抖动。
- 时间查询采用左闭右开 `[start, end)`（DOC-06 §2.2.3）；持久化时间统一 UTC。

### 2.4 时区与时间查询

- 所有时间条件统一转换为 UTC 绝对时刻后按窗口判定；业务日按租户时区（`TenantContext.timezone`）换算。
- 区间查询语义：左闭右开 `[start, end)`；跨时区统计先换算 UTC（DOC-01 §7.11、DOC-05 §5.4）。

### 2.5 版本控制

- 更新类方法可选携带 `expectedVersion: EntityVersion`；不传则不做乐观锁校验。
- 传 `expectedVersion` 且与当前实体版本不一致时抛 `Conflict`，避免静默覆盖（DOC-01 §13.3）。

### 2.6 幂等查询语义

- 幂等键命中查询：`findByIdempotencyKey(tenant, key): Promise<IdempotencyOutcome>`，见 §3（Event/Collection Repository）。
- 幂等语义（同 Hash 返回原结果；不同 Hash 拒绝冲突；处理中返回引用；UNKNOWN 先协调）由 DOC-11 固化，本文档只订查询签名。

### 2.7 异常与错误语义

- 契约统一抛结构化失败类型（对齐 DOC-11 §错误分类）：`ValidationError` / `AuthorizationError` / `NotFound` / `Conflict` / `Timeout` / `Cancellation` / `PersistenceError` / `ExternalDependencyError` / `InternalError`。
- Domain 不依赖 DSH 错误类型；Repository 层不吞业务错误，缺数据抛 `NotFound`、重复/版本冲突抛 `Conflict`。
- 规则未命中/采集部分成功属业务结果，不抛异常（DOC-01 §15.3）。

### 2.8 支撑类型（Port 契约 DTO）小结

以下类型在 Port 签名中使用，字段级定义属各 Port 契约本身（不落 DOC-06 领域 DTO）：

| 类型 | 用途 |
| ---- | ---- |
| TaskQuery / RiskQuery / ProposalQuery / ReportQuery / AuditQuery / EventQuery | 各 Repository `list` 的过滤条件 |
| RiskConditions / RiskEventSummary | 风险查询过滤与摘要（DOC-08 §3.6） |
| CollectionContext | 采集 Port 共享上下文（数据源/窗口/租户） |
| RawRecords / LogChunkResult / SshExecResult / FileIdentity | 采集 Port 返回载体 |
| LogSource | 日志采集源描述 |
| SecretValue | 凭证解析结果（不进持久化） |
| DomainEvent | EventBus 内部领域事件载体 |
| TaskIdempotencyOutcome | 采集幂等查询结果（同 Hash/冲突/处理中/协调） |
| EventIdempotencyOutcome | 事件入径幂等查询结果（同 Hash/冲突/处理中/协调，对齐 DOC-01 §13.4） |
| HealthStatus | 健康判定（HEALTHY/DEGRADED/UNHEALTHY/UNKNOWN，DOC-08 §3.9） |

## 3. Repository 契约（按域）

### 3.1 TenantRepository

```ts
interface TenantRepository {
  save(ctx: TenantContext, tenant: Tenant): Promise<Tenant>;
  findById(tenant: TenantContext, tenantId: TenantId): Promise<Tenant | null>;
  list(tenant: TenantContext, page: PageQuery): Promise<PageResult<Tenant>>;
}
```

| 方法 | 前置 | 后置 | 异常 |
| ---- | ---- | ---- | ---- |
| save | 租户上下文可信 | 写入/更新租户 | Conflict（版本冲突） |
| findById | 租户作用域匹配或显式授权 | 返回租户或 null | AuthorizationError（跨租户未授权） |
| list | 分页 | 稳定排序列表 | — |

### 3.2 Collection 域 Repository

#### DataSourceRepository

```ts
interface DataSourceRepository {
  save(tenant: TenantContext, ds: DataSource, expectedVersion?: EntityVersion): Promise<DataSource>;
  findById(tenant: TenantContext, dataSourceId: DataSourceId): Promise<DataSource | null>;
  listEnabled(tenant: TenantContext): Promise<DataSource[]>;
}
```

#### TaskRepository

```ts
interface TaskRepository {
  save(tenant: TenantContext, task: Task, expectedVersion?: EntityVersion): Promise<Task>;
  findById(tenant: TenantContext, taskId: TaskId): Promise<Task | null>;
  findByIdempotencyKey(tenant: TenantContext, key: IdempotencyKey): Promise<TaskIdempotencyOutcome>;
  list(tenant: TenantContext, query: TaskQuery, page: PageQuery): Promise<PageResult<Task>>;
  listByWorkflow(tenant: TenantContext, workflowId: WorkflowId): Promise<Task[]>;
}
```

| 方法 | 语义 |
| ---- | ---- |
| findByIdempotencyKey | 同 Hash 返回原 Task 引用；不同 Hash 抛 Conflict；处理中返回处理中引用；UNKNOWN 返回协调中 |

#### WorkflowRepository

```ts
interface WorkflowRepository {
  save(tenant: TenantContext, workflow: Workflow, expectedVersion?: EntityVersion): Promise<Workflow>;
  findById(tenant: TenantContext, workflowId: WorkflowId): Promise<Workflow | null>;
  list(tenant: TenantContext, status?: WorkflowStatus, page?: PageQuery): Promise<PageResult<Workflow>>;
}
```

#### ScheduleRepository

```ts
interface ScheduleRepository {
  upsert(tenant: TenantContext, schedule: Schedule): Promise<Schedule>;
  findById(tenant: TenantContext, scheduleId: ScheduleId): Promise<Schedule | null>;
  listByTenant(tenant: TenantContext): Promise<Schedule[]>;
}
```

#### CollectorRepository

```ts
interface CollectorRepository {
  save(tenant: TenantContext, collector: Collector): Promise<Collector>;
  findById(tenant: TenantContext, collectorId: CollectorId): Promise<Collector | null>;
  listByDataSource(tenant: TenantContext, dataSourceId: DataSourceId): Promise<Collector[]>;
}
```

#### CollectionTaskRepository

```ts
interface CollectionTaskRepository {
  save(tenant: TenantContext, ct: CollectionTask, expectedVersion?: EntityVersion): Promise<CollectionTask>;
  findById(tenant: TenantContext, collectionTaskId: CollectionTaskId): Promise<CollectionTask | null>;
  findByTask(tenant: TenantContext, taskId: TaskId): Promise<CollectionTask | null>;
}
```

#### CheckpointRepository

```ts
interface CheckpointRepository {
  save(tenant: TenantContext, checkpoint: Checkpoint): Promise<Checkpoint>;
  findLatest(tenant: TenantContext, dataSourceId: DataSourceId): Promise<Checkpoint | null>;
  // 检查点推进前置：对应数据已 DATA_PERSISTED（由调用方保证）
}
```

#### CollectionCommitRepository

```ts
interface CollectionCommitRepository {
  save(tenant: TenantContext, commit: CollectionCommit): Promise<CollectionCommit>;
  findById(tenant: TenantContext, commitId: CommitId): Promise<CollectionCommit | null>;
  findByCheckpoint(tenant: TenantContext, checkpointId: CheckpointId): Promise<CollectionCommit[]>;
}
```

### 3.3 Metric 域 Repository

#### MetricDefinitionRepository

```ts
interface MetricDefinitionRepository {
  save(tenant: TenantContext, def: MetricDefinition, expectedVersion?: EntityVersion): Promise<MetricDefinition>;
  findById(tenant: TenantContext, metricId: MetricDefinitionId): Promise<MetricDefinition | null>;
  findByVersion(tenant: TenantContext, metricId: MetricDefinitionId, version: DefinitionVersion): Promise<MetricDefinition | null>;
  list(tenant: TenantContext, page: PageQuery): Promise<PageResult<MetricDefinition>>;
}
```

#### MetricResultRepository

```ts
interface MetricResultRepository {
  save(tenant: TenantContext, result: MetricResult): Promise<MetricResult>;
  findByWindow(tenant: TenantContext, metricId: MetricDefinitionId, window: TimeWindow): Promise<MetricResult[]>;
  findLatest(tenant: TenantContext, metricId: MetricDefinitionId, dimension?: Dimension): Promise<MetricResult | null>;
}
```

#### BaselineRepository

```ts
interface BaselineRepository {
  save(tenant: TenantContext, baseline: Baseline, expectedVersion?: EntityVersion): Promise<Baseline>;
  findActive(tenant: TenantContext, metricId: MetricDefinitionId): Promise<Baseline | null>;
  findByVersion(tenant: TenantContext, baselineId: BaselineId, version: DefinitionVersion): Promise<Baseline | null>;
  listByStatus(tenant: TenantContext, metricId: MetricDefinitionId, state: BaselineState): Promise<Baseline[]>;
}
```

### 3.4 Rule 域 Repository

#### RuleDefinitionRepository

```ts
interface RuleDefinitionRepository {
  save(tenant: TenantContext, def: RuleDefinition, expectedVersion?: EntityVersion): Promise<RuleDefinition>;
  findById(tenant: TenantContext, ruleId: RuleDefinitionId): Promise<RuleDefinition | null>;
  findByVersion(tenant: TenantContext, ruleId: RuleDefinitionId, ruleVersion: DefinitionVersion): Promise<RuleDefinition | null>;
  listEnabled(tenant: TenantContext): Promise<RuleDefinition[]>;
}
```

#### EvaluationResultRepository

```ts
interface EvaluationResultRepository {
  save(tenant: TenantContext, result: EvaluationResult): Promise<EvaluationResult>;
  findById(tenant: TenantContext, evaluationId: EvaluationId): Promise<EvaluationResult | null>;
  listByRule(tenant: TenantContext, ruleId: RuleDefinitionId, window: TimeWindow, page: PageQuery): Promise<PageResult<EvaluationResult>>;
}
```

### 3.5 Risk 域 Repository

#### RiskEventRepository

```ts
interface RiskEventRepository {
  save(ctx: TenantContext, event: RiskEvent, expectedVersion?: EntityVersion): Promise<RiskEvent>;
  findById(ctx: TenantContext, riskEventId: RiskEventId): Promise<RiskEvent | null>;
  findByBusinessObject(ctx: TenantContext, businessObjectId: string, ruleId?: RuleDefinitionId): Promise<RiskEvent[]>;
  list(ctx: TenantContext, query: RiskQuery, page: PageQuery): Promise<PageResult<RiskEvent>>;
}
```

#### RiskCycleRepository

```ts
interface RiskCycleRepository {
  save(ctx: TenantContext, cycle: RiskCycle, expectedVersion?: EntityVersion): Promise<RiskCycle>;
  findById(ctx: TenantContext, riskCycleId: RiskCycleId): Promise<RiskCycle | null>;
  findOpenByRiskEvent(ctx: TenantContext, riskEventId: RiskEventId): Promise<RiskCycle | null>;
  listByRiskEvent(ctx: TenantContext, riskEventId: RiskEventId): Promise<RiskCycle[]>;
}
```

约束：历史 Cycle 不得重新打开或覆盖（DOC-06 §6.5）；`save` 对终态 Cycle 的覆盖更新抛 `Conflict`。

#### AttackEventRepository

```ts
interface AttackEventRepository {
  save(ctx: TenantContext, attack: AttackEvent): Promise<AttackEvent>;
  findById(ctx: TenantContext, attackEventId: AttackEventId): Promise<AttackEvent | null>;
  findByRiskEvent(ctx: TenantContext, riskEventId: RiskEventId): Promise<AttackEvent[]>;
}
```

#### RiskRelationRepository

```ts
interface RiskRelationRepository {
  save(ctx: TenantContext, relation: RiskRelation): Promise<RiskRelation>;
  findById(ctx: TenantContext, relationId: RiskRelationId): Promise<RiskRelation | null>;
  findRelated(ctx: TenantContext, objectId: string): Promise<RiskRelation[]>;
}
```

#### RiskSuppressionRepository

```ts
interface RiskSuppressionRepository {
  save(ctx: TenantContext, suppression: RiskSuppression): Promise<RiskSuppression>;
  findActive(ctx: TenantContext, riskEventId?: RiskEventId, at?: Instant): Promise<RiskSuppression[]>;
}
```

约束：`findActive` 只返回在 `at` 时刻有效（`validFrom ≤ at < validTo`）的抑制；到期自动视为失效。

#### RiskEventHistoryRepository

```ts
interface RiskEventHistoryRepository {
  append(ctx: TenantContext, history: RiskEventHistory): Promise<RiskEventHistory>;
  listByRiskEvent(ctx: TenantContext, riskEventId: RiskEventId): Promise<RiskEventHistory[]>;
}
```

约束：状态转换历史不可无审计覆盖，`append` 为 append-only，不提供覆盖更新。

### 3.6 Evidence 域 Repository

```ts
interface EvidenceRepository {
  save(ctx: TenantContext, evidence: Evidence): Promise<Evidence>;
  findById(ctx: TenantContext, evidenceId: EvidenceId): Promise<Evidence | null>;
  listByRiskEvent(ctx: TenantContext, riskEventId: RiskEventId): Promise<Evidence[]>;
}
```

约束：Evidence 不可无审计覆盖；更新视为新版本而非原地覆盖。

### 3.7 Proposal 域 Repository

```ts
interface ActionProposalRepository {
  save(ctx: TenantContext, proposal: ActionProposal, expectedVersion?: EntityVersion): Promise<ActionProposal>;
  findById(ctx: TenantContext, proposalId: ProposalId): Promise<ActionProposal | null>;
  findCurrentByIntent(ctx: TenantContext, riskEventId: RiskEventId, type: ProposalType, applicableTo?: string): Promise<ActionProposal | null>;
  list(ctx: TenantContext, query: ProposalQuery, page: PageQuery): Promise<PageResult<ActionProposal>>;
}
```

| 方法 | 语义 |
| ---- | ---- |
| findCurrentByIntent | 返回同一处置意图的当前（非 SUPERSEDED）Proposal |
| save | 对终态 Proposal 从终态回退到 GENERATED/PENDING_REVIEW 拒绝（Conflict） |

### 3.8 Notification 域 Repository

```ts
interface NotificationRepository {
  save(ctx: TenantContext, notification: Notification): Promise<Notification>;
  findById(ctx: TenantContext, notificationId: NotificationId): Promise<Notification | null>;
  listPending(ctx: TenantContext, page: PageQuery): Promise<PageResult<Notification>>;
}

interface DeliveryRepository {
  save(ctx: TenantContext, delivery: Delivery): Promise<Delivery>;
  findById(ctx: TenantContext, deliveryId: DeliveryId): Promise<Delivery | null>;
  listByNotification(ctx: TenantContext, notificationId: NotificationId): Promise<Delivery[]>;
}

interface AttemptRepository {
  append(ctx: TenantContext, attempt: Attempt): Promise<Attempt>;
  findByDelivery(ctx: TenantContext, deliveryId: DeliveryId): Promise<Attempt[]>;
}
```

约束：Notification / Delivery / Attempt 三者分离存储；`Attempt` append-only。

### 3.9 Report 域 Repository

```ts
interface ReportRepository {
  save(ctx: TenantContext, report: Report): Promise<Report>;
  findById(ctx: TenantContext, reportId: ReportId): Promise<Report | null>;
  list(ctx: TenantContext, query: ReportQuery, page: PageQuery): Promise<PageResult<Report>>;
}
```

约束：历史报告不得因源数据后续变化自动修改（delete 只做归档标记）。

### 3.10 Audit 域 Repository

```ts
interface AuditRepository {
  append(ctx: TenantContext, record: AuditRecord): Promise<AuditRecord>;
  list(ctx: TenantContext, query: AuditQuery, page: PageQuery): Promise<PageResult<AuditRecord>>;
}
```

约束：审计记录 append-only，不提供删除/覆盖；审计失败 fail-closed（DOC-12）。

### 3.11 Event 域 Repository

```ts
interface EventRepository {
  save(ctx: TenantContext, event: EventMetadata, expectedVersion?: EntityVersion): Promise<EventMetadata>;
  findById(ctx: TenantContext, eventId: EventId): Promise<EventMetadata | null>;
  findByIdempotencyKey(ctx: TenantContext, key: IdempotencyKey): Promise<EventIdempotencyOutcome>;
  list(ctx: TenantContext, query: EventQuery, page: PageQuery): Promise<PageResult<EventMetadata>>;
}
```

| 方法 | 语义 |
| ---- | ---- |
| save | 事件入径追加持久化；旧版本 SUPERSEDED 不改写原记录（DOC-01 §7.9）；EventState 由入径方给定 |
| findByIdempotencyKey | 同 Hash 返回原事件引用；不同 Hash 抛 Conflict；处理中返回处理中引用；UNKNOWN 返回协调中（DOC-01 §13.4） |

## 4. 外部 Port 契约（Infrastructure Adapter）

以下 Port 定义于 Application 层，由 Infrastructure Adapter 实现（DOC-02 §6 接缝清单）。

### 4.1 MySQL 采集 Port

```ts
interface MySqlCollectorPort {
  collect(ctx: CollectionContext): Promise<RawRecords>;
  prepareCommit(ctx: CollectionContext, commit: CollectionCommit): Promise<void>;
  getCheckpoint(ctx: CollectionContext, dataSourceId: DataSourceId): Promise<Checkpoint | null>;
}
```

约束：只读账号；表/字段白名单校验；参数化查询；禁止任意 SQL；查询超时与结果数量上限；复合游标（updated_at + primary_key）推进前必须 `DATA_PERSISTED`（DOC-04 §4.3）。

### 4.2 SSH 采集 Port

```ts
interface SshCollectorPort {
  exec(ctx: CollectionContext, template: string, params: Record<string, string>): Promise<SshExecResult>;
}
```

约束：命令模板白名单 + 参数白名单；禁止外部输入直接拼接 Shell；Host Key 校验；连接/执行超时；输出长度限制；并发限制；命令执行审计（DOC-04 §4.3）。

### 4.3 日志采集 Port

```ts
interface LogCollectorPort {
  tail(ctx: CollectionContext, source: LogSource, checkpoint: Checkpoint): Promise<LogChunkResult>;
  resolveIdentity(ctx: CollectionContext, source: LogSource): Promise<FileIdentity>;
}
```

约束：游标 = 文件身份 + byteOffset；支持追加/轮转/截断/多行/编码异常/断点续采；多行堆栈作为一个完整事件（DOC-04 §7.4）。

### 4.4 通知投递 Port

```ts
interface NotificationDeliveryPort {
  deliver(delivery: Delivery): Promise<AttemptResult>;   // SUCCESS / FAILED / UNKNOWN
}
```

约束：至少一次投递，不承诺 exactly-once；`UNKNOWN` 进入协调，不得简单判成功/失败；通知失败不导致 RiskEvent/Proposal 丢失（DOC-01 §11.1）。

### 4.5 Secret Provider Port

```ts
interface SecretProviderPort {
  resolve(ref: SecretReference): Promise<SecretValue>;
}
```

约束：凭证不得明文写入 YAML；凭证不落持久化介质；日志不得输出 secret 内容（DOC-12）。

### 4.6 脱敏 Port

```ts
interface MaskingPort {
  mask(input: unknown, policy: MaskingPolicy): unknown;
  hashPii(value: string, salt?: string): string;      // 加盐单向 hash（仅关联/审计）
}
```

约束：认证凭据/密钥一律 DELETE；PII 按关联 hash / 展示 mask；掩码结果不得反向还原（DOC-01 §10.2）。

### 4.7 EventBus Port

```ts
interface EventBusPort {
  publish(event: DomainEvent): Promise<void>;
  subscribe(type: string, handler: (event: DomainEvent) => void): () => void;
}
```

约束：EventBus 只做内部通知，不代替 Repository 作为事实源；订阅注册是副作用，经 `ctx.effect()`/`ctx.on()`（DOC-02 §5）。

## 5. 事务与幂等边界

- Repository 跨文件操作不承诺 ACID；跨外部系统不承诺 ACID；外部通知不承诺 exactly-once（DOC-01 §13.6）。
- 文件持久化统一由 `PersistenceTransactionCoordinator` 协调（DOC-11）：`PREPARED / DATA_PERSISTED / COMMITTED` 三态；检查点仅在 `DATA_PERSISTED` 后推进。
- 幂等键语义（同 Hash 返回原结果/不同 Hash 冲突/处理中引用/UNKNOWN 协调）由 DOC-11 固化，本文档只订 `findByIdempotencyKey` 查询签名。

## 6. 与下游文档边界与追踪

| 本文档输出 | 下游承接 |
| ---- | ---- |
| Repository 方法签名与查询语义 | MOD-INF-001 JSON Persistence 实现 |
| MySQL/SSH/Log/通知/Secret/脱敏/EventBus Port | 对应 MOD-INF-002～011 Adapter |
| 工具调用链上的 Port 消费者 | DOC-08（Tool 接口契约） |
| 错误分类与事务/幂等/恢复边界 | DOC-11 |
| 租户约束/Secret/脱敏安全落地 | DOC-12 |
| 配置引用与热更新契约 | DOC-14 |

需求追踪：每个 Repository/Port 以能力维度映射回 BR-001～003、SYS-MON-001～008、TOOL-001～009（完整追踪表见 DOC-18）。

## 附录 A：版本与文档状态

| 版本 | 状态 | 说明 |
| ---- | ---- | ---- |
| V1.0-Baseline | Frozen | 冻结基线，开发启动依据 |

本文档已冻结，基线版本 `V1.0-Baseline`，作为开发启动依据。

**文档结束。**