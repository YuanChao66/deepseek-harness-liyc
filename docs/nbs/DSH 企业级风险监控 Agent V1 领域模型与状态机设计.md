# DSH 企业级风险监控 Agent V1 领域模型与状态机设计

| 文档属性 | 内容 |
| -------------- | ------------------------------------------ |
| 文档编号 | DSH-RISK-DOMAIN-V1 |
| 文档名称 | DSH 企业级风险监控 Agent V1 领域模型与状态机设计 |
| 版本 | V1.0-Baseline |
| 文档状态 | 已冻结（Frozen） |
| 前置输入 | DOC-01（DSH-RISK-SRS-V1，V1.3-Review）；DOC-02（总体架构与模块设计） |
| 下一环节 | DOC-06（DTO 与数据模型）、DOC-04（采集与编排）、DOC-07（Ports 与 Repository 契约） |
| 适用范围 | DSH 风险监控 Agent V1 插件工程 |
| 技术基线 | DeepSeek Harness 工作树 live 源码（以源码核验为准） |

## 1. 文档概述

### 1.1 编写目的

本文档定义 DSH 企业级风险监控 Agent V1 的领域模型（实体、值对象、聚合、关联）与状态机（风险状态机、Proposal 状态机等），作为 DTO/数据模型（DOC-06）、采集与编排（DOC-04）、Ports/Repository 契约（DOC-07）的领域依据。

### 1.2 边界声明

| 主题 | 归属 |
| ---- | ---- |
| 领域对象、聚合、关联、不变量 | 本文档 |
| 状态机（风险、Proposal 等）及其转换规则 | 本文档 |
| 枚举值集合 | 本文档 |
| DTO 字段级规格、JSON 表示、类型与精度 | DOC-06 |
| Repository 方法签名与查询语义 | DOC-07 |
| Scheduler/Workflow/Task 编排细节 | DOC-04 |

本文档描述"领域概念模型 + 状态语义"，不进入字段级 DTO 定义（交 DOC-06），也不进入编排执行细节（交 DOC-04）。

### 1.3 前置输入与依据

DOC-01 §7（数据采集与事件）、§8（Metric/Baseline/Rule）、§9（风险管理）、§10（Evidence 与 Action Proposal）、§11（Notification 与 Report）；DOC-02 §4.3（Domain 模块清单）。

## 2. 领域模型总览

DSH 风险监控 Agent 的领域按能力分为以下领域，对应 DOC-02 §4.3 的 Domain 模块：

```
Tenant ────── 租户隔离边界（横切，贯穿所有领域）

Collection ─ 采集（Task/Workflow/Schedule/Collector/DataSource/Commit/Checkpoint）
Metric    ─ 指标与基线（Metric/MetricResult/Baseline/DataQuality）
Rule      ─ 规则与求值（RuleDefinition/EvaluationResult）
Risk      ─ 风险（RiskEvent/RiskCycle/AttackEvent 及关联对象）
Evidence  ─ 证据（Evidence/Evidence引用）
Proposal  ─ 行动建议（ActionProposal/版本）
Notification ─ 通知（Notification/Delivery/Attempt + 人工闭环）
Report    ─ 报告（Report/一致性）
Audit     ─ 审计（AuditRecord）
Security  ─ 安全（Secret 引用/脱敏策略/敏感字段分类）
Event     ─ 事件（公共元数据 + 三业务事件）
```

## 3. 领域对象目录

按聚合 / 实体 / 值对象分类，`◆` 表示聚合根。

| 领域 | 对象 | 类型 | 聚合根 |
| ---- | ---- | ---- | ------ |
| Tenant | Tenant | 实体 | ◆ |
| Tenant | TenantContext | 值对象 | — |
| Collection | Task | 实体（聚合根） | ◆ |
| Collection | CollectionTask | 实体（Task 特化） | — |
| Collection | Workflow | 实体 | ◆ |
| Collection | Schedule | 值对象 | — |
| Collection | Collector | 实体 | — |
| Collection | DataSource | 实体 | ◆ |
| Collection | CollectionCommit | 值对象 | — |
| Collection | Checkpoint | 值对象 | — |
| Metric | MetricDefinition | 实体 | ◆ |
| Metric | MetricResult | 值对象 | — |
| Metric | Dimension | 值对象 | — |
| Metric | DataQuality | 枚举/值对象 | — |
| Metric | Lineage | 值对象 | — |
| Metric | Baseline | 实体 | ◆ |
| Rule | RuleDefinition | 实体 | ◆ |
| Rule | EvaluationResult | 值对象 | — |
| Risk | RiskEvent | 实体 | ◆ |
| Risk | RiskCycle | 实体 | ◆ |
| Risk | AttackEvent | 实体 | ◆ |
| Risk | RiskEventHistory | 实体 | — |
| Risk | RiskRelation | 实体 | — |
| Risk | RiskEvidenceReference | 值对象 | — |
| Risk | RiskImpactScope | 值对象 | — |
| Risk | RiskSuppression | 实体 | — |
| Risk | RiskEvaluationReference | 值对象 | — |
| Risk | RiskScore | 值对象 | — |
| Risk | Severity | 枚举 | — |
| Evidence | Evidence | 实体 | ◆ |
| Proposal | ActionProposal | 实体 | ◆ |
| Notification | Notification | 实体 | ◆ |
| Notification | Delivery | 实体 | — |
| Notification | Attempt | 值对象 | — |
| Report | Report | 实体 | ◆ |
| Audit | AuditRecord | 实体 | — |
| Security | SecretReference | 值对象 | — |
| Security | MaskingPolicy | 值对象 | — |
| Event | EventMetadata | 值对象 | — |
| Event | TransactionEvent / LoginEvent / ApiAccessEvent | 实体 | ◆ |

> 说明：字段级类型、JSON 表示、精度、以及品牌化 ID 的具体定义由 DOC-06 固化；本文档仅给出领域身份、分类与不变量。

## 4. 各领域模型

### 4.1 Tenant 域

- **Tenant**（聚合根）：租户是业务数据与风险数据的隔离基本边界。关键标识：`tenantId`；关键属性：租户时区（IANA tz）、配置引用。
- **TenantContext**（值对象）：可信租户约束上下文，仅由 Application/Security 边界建立，不直接采用 DSH Runtime identity 作为租户事实来源。

**不变量**：
1. 所有租户数据访问必须具备可信租户约束。
2. Repository 不提供无租户约束的通用访问入口。
3. 跨租户访问需显式授权并留审计。

### 4.2 Collection 域

- **Task**（聚合根）：一次可独立管理的业务任务。生命周期由 Task Engine 管理。
- **CollectionTask**（Task 特化，非独立聚合根）：一次采集任务的执行实例，复用 Task 生命周期（Task 状态机），执行结果用 CollectionStatus 表达。状态集合见 §7。
- **Workflow**（聚合根）：由多 Stage 构成的工作流。
- **Schedule**（值对象）：触发规则（频率、时间窗口、租户/目标范围）。
- **Collector**（实体）：实际执行采集的单元；Collector Runner 负责执行，Collector 本身不管理任务生命周期。
- **DataSource**（聚合根）：数据源定义，类型为 MySQL / SSH / Log。
- **CollectionCommit**（值对象）：采集提交事务，三态 `PREPARED / DATA_PERSISTED / COMMITTED`。
- **Checkpoint**（值对象）：采集游标/检查点（如 MySQL 复合游标、日志文件 byteOffset）。

**不变量**：
1. 检查点只能在数据持久化确认（`DATA_PERSISTED`）后推进。
2. 采集部分成功不得伪装为完全成功（`PARTIAL` 与 `SUCCEEDED` 分离）。
3. TAIL 为有限运行模式，须具备超时、取消与资源释放。

### 4.3 Metric 域

- **MetricDefinition**（聚合根）：指标定义；Metric 类型见 §6。
- **MetricResult**（值对象）：一次计算的结果，含 `metricId / tenantId / dimension / value / unit / sampleCount / windowStart / windowEnd / dataQuality / lineage / calculationVersion`。窗口左闭右开。
- **Dimension**（值对象）：聚合维度（客户/账号/IP/设备/渠道等），受维度治理约束。
- **DataQuality**：见 §6（数据可信度，独立于 CollectionStatus）。
- **Lineage**（值对象）：计算来源与依赖追溯。
- **Baseline**（聚合根）：历史正常表现统计。状态候选（Candidate）/ 生效（Active）/ 冻结（Frozen）；支持历史统计、移动平均、分时段统计、最小样本量、版本管理。

**不变量**：
1. 指标缺失不能自动视为零。
2. 除零等非法运算产生 `INVALID` 结果，不伪造数值。
3. 样本不足不得伪造正常基线；异常数据不得无条件进入正常基线。
4. 金额类 value 采用精确十进制（定点字符串 + scale + 币种），禁止二进制浮点落盘或比较。
5. 派生指标支持依赖 DAG，禁止任意 JavaScript 与动态代码执行。

### 4.4 Rule 域

- **RuleDefinition**（聚合根）：结构化 DSL/AST 表达的规则，支持 AND/OR/NOT、固定/动态阈值、多指标/多窗口组合、历史基线比较、租户级配置、版本管理。
- **EvaluationResult**（值对象）：规则执行结果，记录规则版本、输入指标版本、数据质量。

**不变量**：
1. 不得执行任意 JavaScript 或任意 SQL。
2. 缺失值/NULL/无效值必须有明确求值语义。
3. 规则正常执行但未命中属正常业务结果，不属系统错误。

### 4.5 Risk 域（聚合与关联对象）

- **RiskEvent**（聚合根）：某项风险事实及其整体生命周期标识（`tenantId + ruleId + businessObjectId` 维度）。
- **RiskCycle**（聚合根）：一次具体的风险发生周期。恢复后再次发生时复用原 RiskEvent ID、创建新 RiskCycle ID，历史 Cycle 不得重新打开或覆盖。
- **AttackEvent**（聚合根）：多个相关风险主体/行为构成的攻击活动；可关联多个 RiskEvent，但不替代单个风险事件的独立生命周期。
- **RiskEventHistory**（实体）：风险事件状态与判定历史（每次状态转换必须持久化，记录触发事件、规则版本、时间与操作者）。
- **RiskRelation**（实体）：风险主体间关联（方向、类型、依据、可信度、有效时间、来源；区分自动/人工）。
- **RiskEvidenceReference**（值对象）：风险与证据引用。
- **RiskImpactScope**（值对象）：风险影响范围。
- **RiskSuppression**（实体）：风险抑制/例外（维护窗口、人工临时干预，须含有效期，到期自动失效）。
- **RiskEvaluationReference**（值对象）：风险与评估结果引用。
- **RiskScore**（值对象）：确定性计算的评分；与 Severity（等级）分离，两者转换由明确规则定义。
- **Severity**（枚举）：见 §6。

**不变量**：
1. RiskEvent / RiskCycle / AttackEvent 三者不得合并为一个状态实体。
2. 风险恢复不得仅凭单一成功事件或指标短暂下降。
3. LLM 不得直接决定最终风险分数、风险等级或自动执行动作。
4. 人工处置与自动判定事实分离，记录操作者、原因、时间、审批信息。
5. 临时干预不得篡改历史 Evaluation 与 RiskEvent。

### 4.6 Evidence 域

- **Evidence**（聚合根）：风险判断依据。至少含风险关联标识、来源事件、指标及计算版本、规则及规则版本、关键输入快照、数据质量、判定时间、计算版本、关联关系、来源引用。

**不变量**：
1. Evidence 不可无审计覆盖。
2. Hash 可检测内容变化，但不能单独证明数据不可篡改。
3. 日志与 Evidence 不得输出明文敏感字段（脱敏见 §10）。

### 4.7 Proposal 域

- **ActionProposal**（聚合根）：风险处置建议。含 Proposal ID、Tenant、RiskEvent/Cycle、类型、内容、原因、Evidence 引用、适用对象、生成时间、规则版本、状态、审计。七态状态机见 §7。

**不变量**：
1. Proposal 不代表真实动作已执行；APPROVED 不代表动作执行成功。
2. 相同处置意图（同一 RiskEvent + Proposal 类型 + 适用对象）追加版本 → 旧版本 `SUPERSEDED`；不同意图创建新 Proposal。
3. 审批时保存风险快照；关键风险变化触发有效性重新评估；已审批 Proposal 不得静默覆盖。
4. V1 不得通过 Proposal 隐式执行真实拦截/封禁/限流/锁号。

### 4.8 Notification 域

- **Notification**（实体/聚合根）：通知记录。
- **Delivery**（实体）：投递记录。
- **Attempt**（值对象）：投递尝试。
- 人工处理闭环状态：待确认 / 已确认 / 处理中 / 已解决。

**不变量**：
1. Notification / Delivery / Attempt 三者分离，Notification 不确定投递尝试合并。
2. 外部通知至少一次投递，不承诺 exactly-once；UNKNOWN 投递结果进入协调流程。
3. 通知失败不得导致 RiskEvent 或 Proposal 丢失；通知确认不自动关闭风险。

### 4.9 Report 域

- **Report**（实体/聚合根）：报告结果。格式 JSON / Markdown。一致性级别见 §6。

**不变量**：
1. 报告固定数据截止时间、源数据版本、规则版本、计算版本、生成时间、一致性级别。
2. 数据不完整时标记 `PARTIAL` 或相应数据质量状态。
3. 历史报告不得因源数据后续变化而自动修改。

### 4.10 Audit 域 与 Security 域

- **AuditRecord**（实体）：关键操作审计记录（操作者/调用主体、租户、时间、操作对象、结果、来源）。
- **SecretReference**（值对象）：凭证引用，不落明文 YAML，走 Secret 机制。
- **MaskingPolicy**（值对象）：脱敏策略（删除/Hash/掩码），遵循 §10.2。
- 敏感字段分类：认证凭据 / 密钥 / PII 三类。

**不变量**：
1. 关键操作审计失败采用 fail-closed。
2. 认证凭据与密钥在采集、持久化、日志与 Evidence 中一律删除，不以 hash 或掩码保留。
3. PII 跨记录关联用加盐单向 hash；展示用掩码且不可反向还原。

## 5. 事件模型

事件领域对象归属 DOC-02 `MOD-DOM-016 Event`（EventMetadata、TransactionEvent、LoginEvent、ApiAccessEvent、EventState）。

### 5.1 公共事件元数据（EventMetadata）

所有标准事件共享的元数据：

`eventId / tenantId / eventType / schemaVersion / eventTime / collectedAt / ingestedAt / sourceId / sourceType / sourceReference / idempotencyKey / traceId / correlationId / producer / tags`

时间戳分层与顺序约束：`collectedAt ≥ eventTime`，`ingestedAt ≥ collectedAt`（存在时钟偏差/乱序时保留原始时间戳并标记偏差，不静默改写）。

关联标识语义：
- `traceId`：端到端调用链标识，跨服务、跨阶段贯穿，由最上游生成。
- `requestId`：单次请求标识，网关/服务入口生成，用于同一请求内多阶段串联。
- `correlationId`：业务关联标识，关联无直接调用关系的多个相关请求/事件。

**不变量**：事件不可原地修改；源版本变化产生新版本并标记 `SUPERSEDED`（旧版本不参与后续计算但保留来源关系），新版本作为独立事件进入处理。

### 5.2 业务事件

| 事件 | 关键字段 | 对应需求 |
| ---- | -------- | -------- |
| TransactionEvent | 事件标识/租户/客户/账户/交易标识/金额/币种/交易状态/交易时间/采集时间/交易类型/退款冲正关联/来源引用 | BR-001（DOC-01 §4.1.3） |
| LoginEvent | eventId/tenantId/subjectId/accountId/result/failureReason/sourceIp/deviceId/channel/eventTime/collectedAt/applicationId/traceId/sourceReference | BR-002（DOC-01 §4.2.3） |
| ApiAccessEvent | eventId/tenantId/requestId/traceId/apiId/apiPath/httpMethod/apiCategory/requestStage/subjectId/accountId/sourceIp/deviceId/channel/authResult/responseStatus/businessResult/latencyMs/timeout/eventTime/collectedAt/sourceId/sourceReference | BR-003（DOC-01 §4.3.4） |

> 字段级类型、必填与校验由 DOC-06 定义；本文档仅登记事件对象与关键字段集合。

## 6. 枚举全集

本文档是枚举的权威定义处（DOC-06 只做 JSON/类型落地）。枚举字面值沿用既有约定：RiskCycleStatus（DOC-01 §9.4）与 BaselineState（DOC-09 §15.2）用 CamelCase，其余枚举（含 Severity、ProposalStatus）用 UPPER_SNAKE。

| 枚举 | 值域 | 生命周期/语义归属 |
| ---- | ---- | ----------------- |
| TransactionStatus | SUCCESS / FAILED / PENDING / PROCESSING / REVERSED / REFUNDED / CANCELLED / UNKNOWN | 交易事件 |
| TransactionType | DEBIT / CREDIT / TRANSFER / REFUND / CHARGEBACK / ADJUSTMENT | 交易事件 |
| 币种 | ISO-4217 三位字母（CNY/USD/EUR…） | 交易/金额 |
| AuthenticationResult | SUCCESS / AUTH_FAILURE / ACCOUNT_REJECTED / MFA_FAILURE / CAPTCHA_FAILURE / SYSTEM_FAILURE / NETWORK_FAILURE / UNKNOWN | 登录事件 |
| RequestStage | REQUEST_RECEIVED / AUTHENTICATED / BUSINESS_STARTED / BUSINESS_COMPLETED | API 事件 |
| CollectionMode | FULL / INCREMENTAL / TIME_RANGE / SNAPSHOT / TAIL | 采集任务 |
| CollectionStatus | SUCCEEDED / PARTIAL / FAILED / CANCELLED / TIMED_OUT | Collection Task |
| CollectionCommit | PREPARED / DATA_PERSISTED / COMMITTED | 采集提交事务 |
| TaskType | COLLECT_BUSINESS_DATA / COLLECT_SYSTEM_METRICS / COLLECT_APPLICATION_LOGS | Collection Task |
| DataQuality | NORMAL / STALE / PARTIAL / ERROR / INVALID | Data / Event |
| EventState | ACCEPTED / DUPLICATE / REJECTED / QUARANTINED / SUPERSEDED | Event |
| MonitoringCoverage | 未配置 / 未启用 / 采集失败 / 数据过期 / 规则缺失 / 正常 | 监控覆盖率 |
| MetricType | COUNTER / GAUGE / RATE / RATIO / DISTRIBUTION / DERIVED | Metric |
| BaselineState | Candidate / Active / Frozen | Baseline |
| Severity | INFO / LOW / MEDIUM / HIGH / CRITICAL | 风险等级 |
| ReportConsistency | POINT_IN_TIME / BEST_EFFORT / PARTIAL | Report |
| 关联关系类型 | RELATED_TO / CAUSED_BY / TRIGGERED_BY / AFFECTS / PART_OF / DUPLICATE_OF | 风险关联 |
| 通知闭环状态 | 待确认 / 已确认 / 处理中 / 已解决 | 通知人工闭环 |
| DeliveryStatus | PENDING / SENT / FAILED / UNKNOWN | Delivery |
| NotificationKind | RISK_NOTIFICATION / MAINTENANCE | Notification |
| ProposalType | SUPPRESS / ESCALATE / NOTIFY | Action Proposal |

风险状态机与 Proposal 状态枚举（`RiskCycleStatus`、`ProposalStatus`）不在本表内联，其值域与转换见 §7 状态机。

### 6.1 四套状态枚举的区分

| 枚举 | 回答的问题 | 生命周期归属 |
| ---- | ---------- | ------------ |
| CollectionStatus | 采集执行结果如何 | Collection Task |
| DataQuality | 已采集数据是否可信 | Data / Event |
| EventState | 事件如何被处理 | Event |
| MonitoringCoverage | 监控是否覆盖 | 监控覆盖 |

四者分属不同生命周期，不得相互替代。"数据过期"（覆盖率）与 `DataQuality.STALE` 语义相近但作用域不同：前者面向监控对象覆盖，后者面向已采集数据的新鲜度。

## 7. 状态机

### 7.1 风险状态机（RiskCycle）

状态集合：`Pending / Normal / Triggered / Ongoing / Recovered / Unknown`。

`Unknown` 是诊断态，独立于正常顺序，不进入正常生命周期序列。

转换规则：

| 当前态 | 事件/条件 | 目标态 |
| ------ | --------- | ------ |
| Pending | 首次评估无异常 | Normal |
| Pending | 首次评估确认异常 | Triggered |
| Normal | 检测到异常 | Triggered |
| Triggered | 持续命中或升级 | Ongoing |
| Triggered | 满足恢复条件 | Recovered |
| Ongoing | 满足恢复条件 | Recovered |
| Recovered | 再次异常 | 新 RiskCycle（新 Pending） |
| 任意 | 数据不足或人工标记 | Unknown |
| Unknown | 数据质量恢复或人工确认后按当前评估 | 对应生命周期状态 |

**约束**：
1. 状态转换推断由状态机引擎执行，不得由 LLM 直接指定最终状态。
2. 每次状态转换必须持久化 `RiskEventHistory`（触发事件、规则版本、时间、操作者）。
3. 恢复条件（Recovery Rule）可配置、可版本化：连续无异常窗口数 + 风险评分低于恢复阈值 + 数据质量门槛 + 可选人工确认；规则未满足时保持 Ongoing/Triggered，不得静默恢复。
4. 恢复后再次发生：复用原 RiskEvent ID、创建新 RiskCycle ID，历史 Cycle 不重新打开。

### 7.2 Proposal 状态机（七态）

状态集合：`GENERATED / PENDING_REVIEW / APPROVED / REJECTED / WITHDRAWN / EXPIRED / SUPERSEDED`。

转换规则（未列出的转换均为非法）：

| 当前态 | 触发事件 | 目标态 |
| ------ | -------- | ------ |
| GENERATED | 提交审批 | PENDING_REVIEW |
| GENERATED | 生成者撤回 | WITHDRAWN |
| GENERATED | 追加新版本 | SUPERSEDED |
| PENDING_REVIEW | 审批通过 | APPROVED |
| PENDING_REVIEW | 审批否决 | REJECTED |
| PENDING_REVIEW | 生成者撤回 | WITHDRAWN |
| PENDING_REVIEW | 超时未处理 | EXPIRED |
| PENDING_REVIEW | 追加新版本 | SUPERSEDED |
| APPROVED | 追加新版本 | SUPERSEDED |
| REJECTED | 追加新版本 | SUPERSEDED |

**约束**：
1. `REJECTED / EXPIRED / WITHDRAWN / SUPERSEDED` 为终态，不再转换。
2. 任何状态不得回退到 `GENERATED` 或 `PENDING_REVIEW`。
3. 已 `APPROVED` 的 Proposal 不得 `WITHDRAWN`。
4. `EXPIRED` 触发：`PENDING_REVIEW` 超过可配置超时阈值（默认 72 小时）未处理，由定时任务置为 `EXPIRED`。
5. `SUPERSEDED` 判定：同一 RiskEvent + Proposal 类型 + 适用对象构成同一处置意图，追加版本时旧版本置为 `SUPERSEDED`。

### 7.3 采集/任务/事件状态（关联说明）

以下状态机的**完整**转换规则由 DOC-04 细化，本文档登记状态集合与归属，避免与编排细节耦合：

| 对象 | 状态集合 | 细化归属 |
| ---- | -------- | -------- |
| CollectionTask | CollectionStatus 五态 | DOC-04 |
| Task（业务任务） | 任务生命周期状态 | DOC-04 |
| Workflow | 流程状态 + Stage 状态 | DOC-04 |
| Event 处理 | EventState 五态 | DOC-05 |

Event 处理状态语义（本文档定义值域）：
- `ACCEPTED`：接受并进入处理。
- `DUPLICATE`：幂等判定为重复。
- `REJECTED`：校验失败拒绝。
- `QUARANTINED`：隔离（待人工/协调，例如幂等结果 UNKNOWN 时先协调）。
- `SUPERSEDED`：被新版本取代，不参与后续计算。

### 7.4 状态持久化要求

所有状态转换必须持久化状态变更记录（如 `RiskEventHistory`、Proposal 状态历史），记录触发事件、规则版本、时间与操作者；记录不可无审计覆盖。

## 8. 关联关系模型

### 8.1 关联类型

`RELATED_TO / CAUSED_BY / TRIGGERED_BY / AFFECTS / PART_OF / DUPLICATE_OF`。

### 8.2 关联属性

每条关联必须保存：方向、关系类型、依据、可信度、有效时间、来源；自动关联与人工关联必须能够区分。

### 8.3 关键关联

| 关联 | 语义 |
| ---- | ---- |
| RiskEvent ↔ RiskCycle | RiskCycle 属于一次 RiskEvent 的发生周期 |
| AttackEvent ↔ RiskEvent | 一个 AttackEvent 关联多个 RiskEvent |
| RiskEvent ↔ Evidence | 经 RiskEvidenceReference 引用 |
| RiskEvent ↔ Evaluation | 经 RiskEvaluationReference 引用 |
| Subject Relation | 记录方向、关系类型、依据、可信度、有效时间、来源（登录失败维度关联） |

## 9. 领域不变量（汇总）

跨领域的不变量集中如下，作为 DOC-06/DOC-07/状态机实现的守卫要点：

1. 租户隔离：所有租户数据访问具备可信租户约束。
2. 事件不可变：事件不可原地修改，源版本变化产生新版本并 `SUPERSEDED`。
3. 幂等：幂等键（租户+数据源+表+主键+源版本）→ 确定性 Hash；同一业务事实重复采集不重复形成业务统计。
4. 金额精确十进制：金额以定点字符串 + scale + 币种表示，禁止二进制浮点落盘/比较。
5. 时间统一 UTC 存储、租户时区计算；窗口左闭右开 `[start, end)`。
6. 数据质量与业务结果、采集状态分离；指标缺失不为零、非法运算为 `INVALID`。
7. 风险/周期/攻击、评分/等级分离；恢复不凭单一成功事件。
8. Proposal 七态、风险六态按本文档转换表执行，非法转换拒绝。
9. 文件持久化非 ACID；检查点仅在数据持久化确认后推进。
10. LLM 不直接决定最终风险分数/等级/执行动作；状态转换由状态机引擎执行。
11. V1 只生成 Proposal，不执行真实动作。

## 10. 敏感字段与脱敏（领域语义）

敏感字段三类：认证凭据（删除）、密钥（删除）、PII（Hash/掩码）。详细脱敏算法与输出策略见 DOC-01 §10.2（权威定义）与 DOC-12（横切设计落地）。

## 11. 与 DOC-06 的边界

| 本文档（领域模型） | DOC-06（DTO 与数据模型） |
| ------------------ | ------------------------ |
| 领域对象、聚合根、身份维度 | 字段级 DTO、类型、必填、校验规则 |
| 枚举值集合 | 枚举的 TS 类型与 JSON 序列化约定 |
| 状态机状态/转换语义 | 状态枚举的存储表示与迁移 |
| 关联关系类型与属性要求 | 关联 DTO 结构 |
| 金额精度语义 | 定点十进制具体序列化/比较实现 |

## 附录 A：版本与文档状态

| 版本 | 状态 | 说明 |
| ---- | ---- | ---- |
| V1.0-Baseline | Frozen | 冻结基线，开发启动依据 |

本文档已冻结，基线版本 `V1.0-Baseline`，作为开发启动依据。

**文档结束。**