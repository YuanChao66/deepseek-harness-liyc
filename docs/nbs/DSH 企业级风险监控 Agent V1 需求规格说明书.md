# DSH 企业级风险监控 Agent V1 需求规格说明书

| 文档属性       | 内容                                       |
| -------------- | ------------------------------------------ |
| 文档编号       | DSH-RISK-SRS-V1                            |
| 文档名称       | DSH 企业级风险监控 Agent V1 需求规格说明书 |
| 版本           | V1.3-Baseline                               |
| 文档状态       | 已冻结（Frozen）                            |
| 前置版本       | V1.2-Review                                |
| 适用范围       | DSH 风险监控 Agent V1                      |
| 技术基线       | DeepSeek Harness 工作树 live 源码（以源码核验为准） |
| 核验快照       | fcc0ad46（2026-11-04 核验时点，不构成基线锁定）     |

## 1. 文档概述

### 1.1 编写目的

本文档定义 DSH 企业级风险监控 Agent V1 的业务需求、功能需求、非功能需求、系统边界、技术约束、验收原则及需求追踪要求。

本文档作为后续总体架构设计、模块设计、数据模型设计、接口契约设计、测试设计和部署设计的需求依据。

### 1.2 项目背景

本项目面向一个中型 Java 企业应用，建设基于 DeepSeek Harness（以下简称 DSH）的风险监控 Agent。

系统需要同时关注：

1. 客户业务风险。
2. 系统运行状态和技术指标。

系统通过数据库、日志和 SSH 等方式采集数据，经过标准化、指标计算、基线分析和规则评估，识别异常并生成风险事件、证据及行动建议。

### 1.3 术语

| 术语            | 定义                                     |
| --------------- | ---------------------------------------- |
| DSH             | DeepSeek Harness，Agent Runtime          |
| Agent           | 基于 DSH 运行的风险监控智能体            |
| Tool            | DSH 原生注册和调用的工具                 |
| Tenant          | 租户，是业务数据和风险数据隔离的基本边界 |
| Task            | 一次可独立管理的业务任务                 |
| Workflow        | 由多个处理步骤构成的工作流               |
| Event           | 经过标准化的业务或系统事件               |
| Metric          | 从事件或系统数据计算得到的指标           |
| Baseline        | 对历史正常表现的统计描述                 |
| Rule            | 用于识别风险条件的结构化规则             |
| RiskEvent       | 风险事实及其生命周期                     |
| RiskCycle       | 一次具体的风险发生周期                   |
| AttackEvent     | 多个相关风险事件构成的攻击活动           |
| Evidence        | 支撑风险判断的证据及判定快照             |
| Action Proposal | 系统生成的风险处置建议                   |
| DataQuality     | 数据质量状态                             |
| Port            | Application 层定义的外部能力接口         |
| Adapter         | 对外部系统或技术设施的适配实现           |
| Risk Score | 确定性计算得出的风险评分 |
| Severity | 风险等级，统一字典 INFO/LOW/MEDIUM/HIGH/CRITICAL |
| Metric Type | 指标类型，含 COUNTER/GAUGE/RATE/RATIO/DISTRIBUTION/DERIVED |
| CollectionStatus | 采集任务的执行结果状态 |
| Collection Commit | 采集提交事务，区分 PREPARED/DATA_PERSISTED/COMMITTED 三态 |
| EventState | 事件标准化后的处理状态 |
| ReportConsistency | 报告数据一致性级别，区分 POINT_IN_TIME/BEST_EFFORT/PARTIAL |
| PersistenceTransactionCoordinator | 统一协调文件持久化操作的组件 |
| RTM | Requirement Traceability Matrix，需求追踪矩阵 |
| TBD | To Be Determined，待确认事项 |
| DSH-ADP | DSH 适配要求编号 |
| DSH-RUN | DSH 运行验证编号 |

## 2. 项目范围与系统边界

### 2.1 V1 建设目标

V1 实现以下能力：

- 业务数据和系统指标采集。
- 多源数据标准化。
- 事件管理和幂等处理。
- 指标计算。
- 历史基线管理。
- 规则定义、执行和评估。
- 风险事件及攻击事件管理。
- 风险证据管理。
- Action Proposal 生成。
- 风险通知和报告生成。
- 多租户隔离。
- YAML 配置和热更新。
- 文件持久化、运行恢复、审计和可观测性。

### 2.2 V1 不建设的内容

以下能力不属于 V1 正式交付范围：

1. 独立 Web 管理平台。
2. 独立 Java 风险平台。
3. 真实业务拦截和自动执行动作。
4. 多 Agent 协同。
5. 多实例分布式运行。
6. Kafka 消息体系。
7. 独立 MCP Tool Server。
8. 自建 Tool Registry。
9. 复杂日志智能分析平台。
10. 独立服务器监控 Agent。

未来可以扩展，但不得以预留扩展为由提前引入不必要的基础设施。

### 2.3 技术环境

| 类型          | 技术             |
| ------------- | ---------------- |
| Agent Runtime | DeepSeek Harness |
| 插件语言      | TypeScript       |
| 运行环境      | Node.js（开发约束 node >=24.9） |
| 业务应用      | Java             |
| 应用容器      | Tomcat           |
| 缓存          | Redis            |
| 数据库        | MySQL            |
| 协调服务      | ZooKeeper        |
| 容器          | Docker           |
| Web 服务      | Apache、Nginx    |
| 远程采集      | SSH              |
| 配置格式      | YAML             |
| 主要持久化    | JSON / JSONL     |
| 报告格式      | JSON / Markdown  |

### 2.4 部署方式

支持：

- Linux 直接部署。
- Docker 部署。

V1 使用单进程、单实例运行模式。

## 3. 总体架构要求

### 3.1 架构模式

采用四层架构：

1. Plugin / Tools
2. Application
3. Domain
4. Infrastructure

### 3.2 依赖方向

- Plugin / Tools 调用 Application。
- Application 依赖 Domain。
- Application 定义所需 Ports。
- Infrastructure 实现 Application Ports。
- Domain 不依赖 Infrastructure、Plugin 或 DSH。
- Application 不依赖具体 Adapter。
- Composition Root 负责依赖装配。

### 3.3 DSH 集成约束

1. 使用 DSH 原生 Tool Registry。
2. 通过 DSH 插件机制注册工具。
3. 不另建 MCP Tool Server。
4. 不自行实现一套 Tool Registry。
5. Tool Handler 不直接访问 Repository。
6. DSH 相关 API 只出现在 Plugin Adapter。
7. DSH Runtime 对象不得直接成为 Domain Model。
8. Tool Schema、Application DTO、Domain Model 分离。
9. ToolExecutionContext 作为 Plugin/Application 边界 DTO（本设计自有类型，由 DSH 的 ToolRunContext 适配而来，二者不得混用）。
10. TenantContext 属于 Application/Security 边界，不直接使用 DSH Runtime identity 作为租户事实来源。

### 3.4 模块设计原则

- 单进程、单插件、单 Agent。
- 模块化设计。
- 直接调用为主要交互方式。
- 使用接口抽象外部依赖。
- 仅在必要位置使用内部事件通知。
- EventBus 负责通知，不代替 Repository 作为事实源。
- 通过公开模块入口暴露跨模块能力。
- 任务和工作流启动时固定配置快照。
- Risk Event、Proposal History 等历史事实不因配置热更新而被覆盖。

## 4. 业务功能需求

### 4.1 BR-001：客户日交易金额异常监控

#### 4.1.1 需求描述

系统应监控客户在指定统计周期内的交易金额，识别超过配置阈值或历史正常基线的异常情况。

#### 4.1.2 数据来源

- MySQL 业务交易表。
- 仅采集平台配置授权的表和字段。
- 不允许任意访问未授权业务表。

#### 4.1.3 事件标准化

转换为 TransactionEvent，至少支持：

- 事件标识。
- 租户标识。
- 客户标识。
- 账户标识。
- 交易标识。
- 交易金额。
- 交易币种。
- 交易状态。
- 交易时间。
- 采集时间。
- 交易类型。
- 退款或冲正关联信息。
- 数据源和来源记录信息。

交易状态（TransactionStatus）枚举：

- SUCCESS：业务成功。
- FAILED：业务失败。
- PENDING：待处理。
- PROCESSING：处理中。
- REVERSED：已冲正。
- REFUNDED：已退款。
- CANCELLED：已取消。
- UNKNOWN：无法判定。

业务成功集默认仅含 SUCCESS；其余状态不计入默认统计，具体状态映射由数据源配置决定。

交易类型（TransactionType）枚举按资金方向维度定义：

- DEBIT：借记。
- CREDIT：贷记。
- TRANSFER：转账。
- REFUND：退款。
- CHARGEBACK：拒付。
- ADJUSTMENT：调账。

交易币种采用 ISO-4217 三位字母代码（如 CNY、USD、EUR）。

金额使用精确十进制语义，不使用浮点数作为金额事实的存储和比较基础。金额在 JSON 中以定点字符串表示（如 "123.45"），伴随 scale（小数位数）与币种；禁止以二进制浮点数落盘或比较金额。

#### 4.1.4 交易统计要求

支持：

- 自然日统计。
- 滚动 24 小时统计。
- 按租户时区计算业务日期。
- 按客户、账户等维度聚合。
- 多币种分别统计。

跨币种汇总必须明确汇率来源、汇率有效时间、版本和换算精度。未配置可靠换算规则时不得直接相加。

退款、冲正应保留原始交易关系，不得直接覆盖原交易事实。

默认只统计符合业务成功状态的交易；具体状态映射由数据源配置决定。

#### 4.1.5 风险判断

支持：

- 固定阈值。
- 动态阈值。
- 多条件组合。
- 历史基线。
- 多条规则同时命中。
- 一条规则产生多个 Action Proposal。

历史基线不得因已识别的异常数据而被无条件污染。

#### 4.1.6 数据质量和迟到数据

支持 NORMAL、STALE、PARTIAL、ERROR、INVALID。

迟到数据以可配置的迟到阈值区分：阈值内迟到数据进入历史窗口重算；超过阈值的迟到数据丢弃并产生告警，不触发重算。

迟到数据进入历史窗口重算时，应保留原有计算版本及新计算版本，不得无审计地覆盖历史判定依据。重算版本保留上限可配置（默认保留最近 2 个历史版本与当前版本），超限版本归档或清除。

#### 4.1.7 幂等

幂等键应包含租户、数据源、表、主键和源版本等必要信息。幂等键按固定顺序拼接各字段值并做确定性 Hash，以 Hash 结果作为幂等判定依据；Hash 与冲突语义见 §13.4。

同一业务事实的重复采集不得重复形成交易统计。

#### 4.1.8 验收

AT-001～AT-020。

实际交易表结构、字段映射、采集周期、阈值、基线样本量和保留期限列为 TBD。

### 4.2 BR-002：客户登录失败异常监控

#### 4.2.1 需求描述

系统应识别客户、账号、IP、设备及其组合维度上的异常认证行为，包括连续失败、暴力破解和分布式撞库等。

#### 4.2.2 数据来源

- MySQL。
- 认证日志。
- 应用日志。
- 未来可扩展 HTTP 事件接入。

#### 4.2.3 Login Event

标准事件至少包括：

- eventId
- tenantId
- subjectId
- accountId
- result
- failureReason
- sourceIp
- deviceId
- channel
- eventTime
- collectedAt
- applicationId
- traceId
- sourceReference

#### 4.2.4 认证结果

至少支持：

- SUCCESS
- AUTH_FAILURE
- ACCOUNT_REJECTED
- MFA_FAILURE
- CAPTCHA_FAILURE
- SYSTEM_FAILURE
- NETWORK_FAILURE
- UNKNOWN

系统内部错误和网络故障默认不得计入认证失败次数。

UNKNOWN 不得未经明确配置就被视为认证失败。

#### 4.2.5 统计维度

支持：

- 客户。
- 账号。
- IP。
- 设备。
- 渠道。
- 多维组合。

支持固定窗口、滚动窗口和连续窗口。

真实发生的多次失败应分别计数；重复采集同一事实只计数一次。

多源关联不确定时，不得随意合并事件。

#### 4.2.6 攻击识别

支持：

- 单主体连续失败。
- 单 IP 多账号失败。
- 多 IP 针对单账号攻击。
- 分布式暴力破解。
- 撞库行为。
- 多维关联异常。

Subject Relation 必须记录方向、关系类型、依据、可信度、有效时间和来源。

IP 代理识别必须使用可信代理配置，不得无条件信任 X-Forwarded-For。

地理信息只能作为辅助特征，必须记录来源和可信度。

#### 4.2.7 风险评分

使用确定性规则计算风险评分。

LLM 不得直接决定最终风险分数、风险等级或自动执行动作。

登录成功只能作为重新评估信号，不自动清除既有风险。

#### 4.2.8 风险和攻击关系

RiskEvent 与 AttackEvent 分开管理。

一个 AttackEvent 可以关联多个主体的 RiskEvent。

#### 4.2.9 Action Proposal

支持生成：

- 登录异常预警。
- 账号审核建议。
- 建议锁定账号。
- 建议封禁 IP。
- 设备限制建议。
- MFA 强化建议。
- 调查建议。

V1 不执行真实锁号、封禁或拦截。

#### 4.2.10 恢复策略

支持根据以下条件综合判断：

- 连续无异常时间。
- 连续评估结果。
- 恢复阈值。
- 攻击来源是否停止。
- 数据质量。
- 人工确认。

不得仅因为一次登录成功就自动恢复风险。

#### 4.2.11 安全

敏感字段与脱敏遵循 §10.2。

跨租户威胁关联必须经过显式授权、脱敏和审计。

#### 4.2.12 验收

AT-021～AT-044。

### 4.3 BR-003：API 调用频率与接口滥用监控

#### 4.3.1 需求描述

系统应识别异常 API 调用频率、接口滥用、异常访问序列、异常调用主体及潜在攻击行为。

#### 4.3.2 数据来源

- API 网关。
- Nginx。
- Apache。
- Java 应用日志。
- MySQL 审计数据。
- 未来可扩展 HTTP 事件接入。

#### 4.3.3 请求阶段

至少区分：

- REQUEST_RECEIVED
- AUTHENTICATED
- BUSINESS_STARTED
- BUSINESS_COMPLETED

不同请求阶段不得混合计算同一请求总量。同一请求的多个阶段以 requestId 串联、跨服务同一次调用以 traceId 串联（见 §7.9）；"不得混合计算"的判定依据是同一 requestId 下的不同阶段记录不得重复累计总量。

#### 4.3.4 ApiAccessEvent

至少包括：

- eventId
- tenantId
- requestId
- traceId
- apiId
- apiPath
- httpMethod
- apiCategory
- requestStage
- subjectId
- accountId
- sourceIp
- deviceId
- channel
- authResult
- responseStatus
- businessResult
- latencyMs
- timeout
- eventTime
- collectedAt
- sourceId
- sourceReference

#### 4.3.5 API 规范化

支持 API 路径模板化，识别动态参数。

无法识别的接口使用 UNKNOWN_API 等明确标识。

#### 4.3.6 敏感数据

使用字段白名单采集。

敏感字段与脱敏遵循 §10.2。

#### 4.3.7 统计指标

至少支持：

- 请求总数。
- 成功率。
- 失败率。
- 超时率。
- 平均响应时间。
- 最大响应时间。
- P50、P90、P95、P99 延迟。
- 独立调用主体数。
- 调用序列。
- 调用时间间隔。

成功和失败口径由数据源配置决定。HTTP 200 不必然代表业务成功。

#### 4.3.8 风险识别

支持：

- 固定阈值。
- 滚动窗口。
- 连续窗口。
- 历史均值。
- 移动平均。
- 分时段基线。
- API 调用序列。
- 调用顺序。
- 调用间隔。
- 业务操作组合。
- 异常业务流程。

Rule DSL 支持嵌套 AND、OR、NOT。

风险评分采用确定性算法，LLM 不直接决定最终分数。

#### 4.3.9 Action Proposal

支持建议：

- 限流。
- 封禁来源。
- 限制客户或账号。
- 暂停 API。
- 强化认证。
- 安全调查。

V1 只生成建议，不执行真实动作。

#### 4.3.10 验收

AT-045～AT-076。

## 5. 系统监控需求

### 5.1 系统监控范围

V1 系统监控对象：

| 需求编号    | 对象      | 指标范围                                          |
| ----------- | --------- | ------------------------------------------------- |
| SYS-MON-001 | Java      | CPU、Heap、OldGen、GC、Thread、QPS、Error         |
| SYS-MON-002 | Tomcat    | Thread Pool、Connections、QPS、ResponseTime、5xx  |
| SYS-MON-003 | Redis     | Memory、QPS、HitRate、Connections、SlowLog        |
| SYS-MON-004 | MySQL     | CPU、Connections、SlowSQL、Lock、QPS、Replication |
| SYS-MON-005 | Nginx     | QPS、4xx、5xx、ResponseTime、Connections          |
| SYS-MON-006 | Docker    | Container Status、CPU、Memory、Restart            |
| SYS-MON-007 | ZooKeeper | Connections、Session、Latency、Znode              |
| SYS-MON-008 | Apache    | QPS、Connection、ResponseTime、5xx                |

SYS-MON-009（主机级资源监控）和 SYS-MON-010（监控系统自身健康度）作为补充需求候选登记，未完成范围确认前不作为新增强制监控对象。

### 5.2 指标要求

每个指标应明确：

- 指标标识。
- 指标名称。
- 监控对象。
- 数据类型。
- 单位。
- 采集方式。
- 采集周期。
- 聚合方式。
- 统计窗口。
- 数据质量。
- 阈值或基线策略。
- 适用租户和实例范围。

### 5.3 采集方式

- 通过 SSH 执行受控命令。
- 通过已有日志采集。
- 通过明确配置的服务查询方式。

不得要求被监控服务器安装独立监控 Agent。

### 5.4 数据存储

V1 使用文件持久化保存指标和相关状态。

后续可以扩展其他存储方式，但不将其作为 V1 必须条件。

### 5.5 容量要求

系统采集频率、保留周期、指标数量和容量规划列为 TBD，必须通过目标环境压测和实际数据量估算确定。

### 5.6 监控覆盖率

按 Target、组件、Metric、Rule 和 Collection Task 统计预期与实际覆盖。

状态至少区分：

- 未配置。
- 未启用。
- 采集失败。
- 数据过期。
- 规则缺失。
- 正常。

未配置监控不得视为健康；覆盖率下降应产生运行告警。

### 5.7 维护窗口

支持按租户、目标、组件、Metric、Rule 和时间范围设置维护窗口。

维护期间：

- 继续采集。
- 可抑制判定、升级和通知。
- 保留证据。
- 关键安全风险可设置豁免。
- 维护变化必须审计。
- 维护结束后重新评估。

抑制不等于风险恢复。

## 6. 模型工具需求

本节定义 Agent 通过 DSH 原生 Tool Registry 对外暴露的九个模型工具。工具属于 Plugin / Tools 层，职责是接收参数、校验、调用 Application Use Case、转换返回结果；Tool Handler 不直接访问 Repository（见 §3.3）。每个工具的入参、出参、幂等与错误语义构成工具契约，详细 DTO 与 Schema 由 DOC-06、DOC-07 定义，本文档给出一致的需求基线。

### 6.1 工具清单

| 编号 | 工具名 | 用途 | 返回重点 | 验收编号 |
| ---- | ------ | ---- | -------- | -------- |
| TOOL-001 | collect_business_data | 采集业务数据 | taskId、status | AT-TOOL-001 |
| TOOL-002 | collect_system_metrics | 采集系统指标 | taskId、status | AT-TOOL-002 |
| TOOL-003 | collect_application_logs | 采集应用日志 | taskId、status | AT-TOOL-003 |
| TOOL-004 | calculate_metrics | 计算指标 | 计算结果 | AT-TOOL-004 |
| TOOL-005 | evaluate_risk_rules | 评估风险规则 | 风险评估结果 | AT-TOOL-005 |
| TOOL-006 | query_risks | 查询风险 | 风险状态、历史 | AT-TOOL-006 |
| TOOL-007 | manage_action_proposals | 管理行动建议 | 当前状态 | AT-TOOL-007 |
| TOOL-008 | generate_risk_reports | 生成风险报告 | 报告 ID、文件位置 | AT-TOOL-008 |
| TOOL-009 | get_monitor_health | 获取监控健康 | 健康状态 | AT-TOOL-009 |

异步采集类工具（TOOL-001～003）遵循"验证入参 → 建立可信上下文 → 创建并持久化 Task → 返回 taskId"的流程，不得让长时间采集占用 Tool Handler 同步执行（见设计基线 §4）。

所有工具都必须经过统一的安全上下文处理：tenantId 不得直接信任模型传入值（见 §12.2）。

### 6.2 TOOL-009 get_monitor_health（完整示例）

#### 6.2.1 用途

查询监控系统整体健康状态，覆盖插件自身健康、数据源健康与监控覆盖率，供 Agent 判断当前监控是否正常运转。

#### 6.2.2 输入参数

| 字段 | 类型 | 必填 | 约束 |
| ---- | ---- | ---- | ---- |
| components | string[] | 否 | 要查询的组件，取值 SYS-MON-001～008；缺省查询全部 |
| dataSources | string[] | 否 | 数据源范围；缺省查询全部 |
| tenantId | string | 否 | 缺省取可信 TenantContext；不得直接信任模型传入值 |

#### 6.2.3 输出（canonical）

```json
{
  "health": "HEALTHY | DEGRADED | UNHEALTHY | UNKNOWN",
  "plugin": { "status": "...", "uptimeSec": 0 },
  "dataSources": [
    { "sourceId": "...", "status": "...", "lastCheckedAt": "...", "message": "..." }
  ],
  "coverage": { "configured": 0, "enabled": 0, "normal": 0, "degraded": 0 }
}
```

覆盖率统计对齐 §5.6 的覆盖率状态。

#### 6.2.4 幂等与错误语义

- 只读无副作用；同一时点重复调用返回一致结果。
- 单个数据源不可达返回 DEGRADED，不得整体报错；全部不可达或状态未知返回 UNHEALTHY/UNKNOWN。
- 组件取值非法或 tenantId 越权，返回 Validation/Authorization 错误（见 §15.2）。

#### 6.2.5 验收

> AT-TOOL-009（示例）：注入一个数据源故障，调用后 `health=DEGRADED` 且该数据源 `status` 非正常；故障恢复后二次调用为 `HEALTHY`。通过判据：状态随数据源状态正确变化、无副作用、越权 tenantId 被拒绝。

### 6.3 其余工具契约骨架

- **TOOL-001 collect_business_data**：入参 `dataSources`、`tenantId`、`collectionRange`；出参 `{ taskId, status }`；异步返回 taskId。
- **TOOL-002 collect_system_metrics**：入参 `hosts`、`components`、`metricScope`；出参 `{ taskId, status }`。
- **TOOL-003 collect_application_logs**：入参 `logSources`、`timeRange`；出参 `{ taskId, status }`。
- **TOOL-004 calculate_metrics**：入参 `metricDefinitions`、`timeWindow`；出参计算结果（对齐 §8.1 MetricResult）。
- **TOOL-005 evaluate_risk_rules**：入参 `ruleScope`、`evaluationWindow`；出参风险评估结果（含规则版本、输入指标版本、数据质量）。
- **TOOL-006 query_risks**：入参 `riskConditions`、`pagination`；出参风险状态与历史（分页、稳定排序）。
- **TOOL-007 manage_action_proposals**：入参 `proposalId`、`operationType`；出参当前 Proposal 状态（对齐 §10.3 七态状态机）。
- **TOOL-008 generate_risk_reports**：入参 `reportType`、`timeRange`；出参 `{ reportId, fileLocation }`（JSON/Markdown）。

详细入参/出参 Schema、DTO 与 Repository 契约由 DOC-06、DOC-07 定义，验收用例明细由 DOC-15 定义。

## 7. 数据采集与事件处理

### 7.1 数据源

- MySQL。
- SSH。
- 日志文件。

未来可扩展 HTTP 事件接入。

### 7.2 MySQL 采集要求

1. 仅允许访问平台授权的表和字段。
2. 表名、字段名必须经过白名单校验。
3. 查询值必须使用参数绑定。
4. 优先采用 updated_at + primary_key 等复合游标。
5. 必须明确时间字段精度和并列记录处理方式。
6. 增量游标无法发现物理删除，V1 通过定期全量对账兜底（对账周期可配置）；对账发现缺失的记录标记为删除或缺失，不得静默忽略。
7. 采集检查点必须在数据持久化确认后推进。

### 7.3 SSH 采集要求

- 受控命令模板。
- 参数白名单。
- Host Key 校验。
- 连接超时。
- 命令执行超时。
- 输出长度限制。
- 并发限制。
- 敏感信息保护。
- 命令执行审计。

禁止将未经校验的外部输入直接拼接为 Shell 命令。

### 7.4 日志采集要求

支持：

- 追加写入。
- 日志轮转。
- 文件截断。
- 多行日志。
- 编码异常。
- 断点续采。
- 迟到日志。
- 文件身份识别。
- 游标恢复。

日志游标至少包含文件身份和 byteOffset 等必要信息。

多行堆栈应作为一个完整事件处理，不得无条件拆成多个独立业务事件。

### 7.5 采集模式

支持：

- FULL
- INCREMENTAL
- TIME_RANGE
- SNAPSHOT
- TAIL

TAIL 为有限运行模式，必须具备超时、取消和资源释放机制。

### 7.6 CollectionStatus

支持：

- SUCCEEDED
- PARTIAL
- FAILED
- CANCELLED
- TIMED_OUT

### 7.7 DataQuality

支持：

- NORMAL
- STALE
- PARTIAL
- ERROR
- INVALID

DataQuality 不得与 CollectionStatus 混为一谈。

四套状态枚举的区分：

| 枚举 | 回答的问题 | 值域 | 生命周期归属 |
| --- | --- | --- | --- |
| CollectionStatus | 采集执行结果如何 | SUCCEEDED / PARTIAL / FAILED / CANCELLED / TIMED_OUT | Collection Task |
| DataQuality | 已采集数据是否可信 | NORMAL / STALE / PARTIAL / ERROR / INVALID | Data / Event |
| Event 状态 | 事件如何被处理 | ACCEPTED / DUPLICATE / REJECTED / QUARANTINED / SUPERSEDED | Event |
| 覆盖率状态 | 监控是否覆盖 | 未配置 / 未启用 / 采集失败 / 数据过期 / 规则缺失 / 正常 | Monitoring Coverage |

四者分属不同生命周期，不得相互替代；"数据过期"（覆盖率）与 DataQuality.STALE 语义相近但作用域不同，前者面向监控对象覆盖，后者面向已采集数据的新鲜度。

### 7.8 Collection Commit

提交记录至少区分：

- PREPARED
- DATA_PERSISTED
- COMMITTED

检查点只能在数据持久化确认后推进。

### 7.9 Event 标准化

公共事件元数据至少包含：

- eventId
- tenantId
- eventType
- schemaVersion
- eventTime
- collectedAt
- ingestedAt
- sourceId
- sourceType
- sourceReference
- idempotencyKey
- traceId
- correlationId
- producer
- tags

公共事件元数据中的关联标识语义：

- traceId：一次端到端调用链的追踪标识，跨服务、跨阶段贯穿，由最上游服务生成。
- requestId：单次请求的标识，在网关或服务入口生成，用于同一请求内多个阶段（§4.3.3）的串联。
- correlationId：业务关联标识，用于关联无直接调用关系的多个相关请求或事件。

同一请求的多个阶段共享同一 requestId；跨服务同一次调用共享同一 traceId；业务相关的多个请求或事件共享同一 correlationId。

事件不可原地修改。

源版本变化应产生新版本或修订记录，并保留来源关系。旧版本事件标记为 SUPERSEDED，不参与后续计算，但保留旧版本与来源关系以供审计与重算追溯；新版本作为独立事件进入处理。

### 7.10 Event 状态

支持：

- ACCEPTED
- DUPLICATE
- REJECTED
- QUARANTINED
- SUPERSEDED

### 7.11 时间与时区规范

本节为全文时间与时区约定的权威定义，§4.1.4、§8.1、§13.2 中的相关条目为局部归纳，均以本节为准。

时间戳分层（公共事件元数据）：

- eventTime：事件发生的业务时间。
- collectedAt：数据被采集的时间。
- ingestedAt：数据进入系统并完成标准化的时间。

三者顺序约束：collectedAt 不早于 eventTime，ingestedAt 不早于 collectedAt。存在时钟偏差或乱序数据时，保留原始时间戳并标记偏差，不静默改写。

时区标识统一采用 IANA tz 数据库（如 Asia/Shanghai），由统一库处理 DST 与历史时区规则。绝对时刻一律以 UTC 存储，展示与业务计算按租户时区换算。

业务日切点默认 00:00 租户本地时间，可配置（如 23:00 切日）。自然日、滚动窗口与业务日均在租户时区下判定。

窗口采用左闭右开语义：[start, end)。跨时区统计或比较时，先将各时刻换算为 UTC 绝对时刻，再按统一窗口判定，避免本地时区换算导致的重复或遗漏。

## 8. Metric、Baseline 与 Rule

### 8.1 Metric

Metric 从标准事件或系统数据中计算。

要求：

- 指标定义与计算实现分离。
- 聚合语义明确。
- 时间窗口明确。
- 时间统一以 UTC 存储。
- 业务日按租户时区计算。
- 指标缺失不能自动视为零。
- 除零等非法运算应产生明确的 INVALID 结果。
- 必须记录样本数、数据质量和计算来源。

Metric 类型：

- COUNTER：累计计数。
- GAUGE：瞬时观测值。
- RATE：速率。
- RATIO：比例。
- DISTRIBUTION：分布。
- DERIVED：由其他指标派生的指标。

派生指标支持依赖 DAG、四则运算、条件表达式、受控函数、多级派生和循环依赖检测；禁止任意 JavaScript 和动态代码执行。维度治理覆盖全局、租户、Metric 和维度组合，支持 Top-K、低频归并、白名单、拒绝和资源预算；治理不得静默隐藏关键风险对象。

MetricResult 至少包括：

- metricId
- tenantId
- dimension
- value
- unit
- sampleCount
- windowStart
- windowEnd
- dataQuality
- lineage
- calculationVersion

value 按指标类型区分：

- 金额类：定点字符串（如 "123.45"），伴随 scale（小数位数）与币种；禁止二进制浮点落盘或比较。
- 计数类（COUNTER 等）：整数。
- 比率、速率、延迟类（RATE、RATIO、DISTRIBUTION 等）：有限精度浮点，并声明精度位数。

窗口采用左闭右开语义：[start, end)。

### 8.2 Baseline

Baseline 用于描述历史正常表现，不直接负责风险判断。

支持：

- Candidate。
- Active。
- 历史统计。
- 移动平均。
- 分时段统计。
- 最小样本量要求。
- 基线版本管理。

样本不足时不得伪造正常基线。

异常数据不得无条件进入正常基线。

对于活动风险范围，可冻结对应基线更新，避免异常持续污染历史参考值。

### 8.3 Rule

规则采用结构化 DSL / AST 表达。

支持：

- AND。
- OR。
- NOT。
- 嵌套表达式。
- 固定阈值。
- 动态阈值。
- 多指标组合。
- 多窗口组合。
- 历史基线比较。
- 规则版本管理。
- 租户级规则配置。

不得执行任意 JavaScript 或任意 SQL 作为规则表达式。

缺失值、NULL、无效值必须具有明确的求值语义。

Rule 正常执行但没有命中属于正常业务结果，不属于系统错误。

规则执行结果应记录规则版本、输入指标版本和数据质量。

## 9. 风险管理

### 9.1 风险实体

区分：

- RiskEvent。
- RiskCycle。
- AttackEvent。

三者不得合并成一个状态实体。

### 9.2 RiskEvent

表示某项风险事实及其整体生命周期。

### 9.3 RiskCycle

表示一次具体的风险发生周期。

风险恢复后再次发生时：

- 可以复用原 RiskEvent ID。
- 必须创建新的 RiskCycle ID。
- 历史 Cycle 不得重新打开或覆盖。

### 9.4 风险状态机

RiskCycle 生命周期状态：

- Pending：待评估（已识别但尚未确认）。
- Normal：正常。
- Triggered：已触发。
- Ongoing：持续（风险继续存在或升级）。
- Recovered：已恢复。
- Unknown：数据不足或无法判定，独立于生命周期。

状态转换：

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

Unknown 是诊断态，不进入正常顺序；数据质量恢复或人工确认后，按当前评估转入对应生命周期状态。

状态转换推断由状态机引擎执行，不得由 LLM 直接指定最终状态。每个状态转换必须持久化状态变更记录（RiskEventHistory），记录触发事件、规则版本、时间与操作者。

### 9.5 AttackEvent

表示多个相关风险主体或行为构成的攻击活动。

AttackEvent 可以关联多个 RiskEvent，但不能替代单个风险事件的独立生命周期。

### 9.6 风险评分

Risk Score 与 Severity 分离。

- Score 表示确定性计算得出的风险评分。
- Severity 表示风险等级。
- 两者转换关系必须由明确规则定义。

严重程度统一字典：

- INFO。
- LOW。
- MEDIUM。
- HIGH。
- CRITICAL。

等级映射统一，用于通知、报告和查询；各领域保留独立评分和判定策略。

LLM 不得直接决定最终风险分数或自动处置动作。

### 9.7 风险恢复

风险恢复必须有明确的恢复条件。

不得仅凭单一成功事件或指标短暂下降就认定风险结束。

恢复判定采用配置化恢复规则（Recovery Rule），由以下输入共同决定：

- 连续无异常窗口数。
- 风险评分低于恢复阈值。
- 数据质量门槛（恢复评估期间数据质量须达到要求）。
- 可选人工确认。

恢复规则可配置、可版本化，不得硬编码具体数值；规则未满足时保持 Ongoing/Triggered，不得静默恢复。

### 9.8 风险实体细化与关联关系

风险领域建议维护的补充对象：

- RiskEventHistory：风险事件状态与判定历史。
- RiskRelation：风险主体间关联。
- RiskEvidenceReference：风险与证据的引用。
- RiskImpactScope：风险影响范围。
- RiskSuppression：风险抑制或例外。
- RiskEvaluationReference：风险与评估结果引用。

关联关系支持：

- RELATED_TO。
- CAUSED_BY。
- TRIGGERED_BY。
- AFFECTS。
- PART_OF。
- DUPLICATE_OF。

关联关系必须保存方向、关系类型、依据、可信度、有效时间和来源；自动关联与人工关联必须能够区分。

### 9.9 人工处置

支持：

- 确认误报。
- 接受风险。
- 确认真实风险。
- 要求进一步调查。
- 人工关闭。
- 重新打开风险周期。

人工处置与自动判定事实分离，必须记录操作者、原因、时间和审批信息。

### 9.10 人工临时干预

支持：

- 临时重点关注主体。
- 临时风险抑制或例外。
- 人工调整监控优先级。

临时干预必须指定有效期、原因、操作者和审批要求，到期自动失效；干预不得篡改历史 Evaluation 和 Risk Event。

## 10. Evidence 与 Action Proposal

### 10.1 Evidence

Evidence 用于记录风险判断的依据。

至少包含：

- 风险关联标识。
- 来源事件。
- 指标及计算版本。
- 规则及规则版本。
- 关键输入快照。
- 数据质量。
- 判定时间。
- 计算版本。
- 关联关系。
- 必要的来源引用。

Evidence 不可无审计覆盖。

Hash 可用于检测内容变化，但不能单独证明数据不可篡改。

### 10.2 敏感字段与脱敏规范

本节为全文敏感字段与脱敏约定的权威定义，§4.2.11、§4.3.6 均引用本节。

敏感字段全集分三类：

- 认证凭据：密码、验证码、Token、Cookie、Authorization、会话凭证等。
- 密钥：私钥、SSH 私钥内容、数据库或服务密码、API Key、证书私钥等。
- PII：身份证号、手机号、银行卡号、地址、邮箱、真实姓名等可识别个人的信息。

脱敏算法：

- 删除：认证凭据与密钥类在采集、持久化、日志与 Evidence 中一律删除，不以 hash 或掩码保留。
- Hash：PII 在需要跨记录关联时使用加盐单向 hash，仅用于关联与审计，禁止明文。
- 掩码：PII 在展示时使用掩码（如 138****5678），掩码结果不得反向还原。

输出策略：采集阶段以字段白名单过滤；日志与 Evidence 不得输出任何明文敏感字段；PII 仅在必要时以 hash 或掩码形式出现；凭证与密钥不落任何持久化介质。

### 10.3 Action Proposal

V1 只生成 Action Proposal。

Proposal 至少包含：

- Proposal ID。
- Tenant ID。
- Risk Event / Cycle。
- Proposal 类型。
- 建议内容。
- 建议原因。
- Evidence 引用。
- 适用对象。
- 生成时间。
- 规则版本。
- 状态。
- 审计信息。

Proposal 类型（`ProposalType`）在此集中定义，作为 DOC-06 §6.7 的唯一权威依据：

- `SUPPRESS`：抑制/降噪，处置意图为降低误报噪音，不产生对外处置动作。
- `ESCALATE`：升级，需要提升关注层级或触发人工/流程介入的强处置。
- `NOTIFY`：通知介入，需要通知相关方关注或跟进的处置。

`ProposalType` 与各业务场景处置建议（§4.2.9 登录异常、§4.3.9 API 滥用）的对应关系见下表；本节为三分类抽象，§4.2.9/§4.3.9 为具体处置动作清单，二者处于不同分类层级。

| ProposalType | 语义 | 对应处置建议（§4.2.9 / §4.3.9） |
| --- | --- | --- |
| SUPPRESS | 抑制/降噪 | 无（内部降噪，不产生对外动作） |
| ESCALATE | 升级 | 建议锁定账号、建议封禁 IP、限流、封禁来源、限制客户或账号、暂停 API |
| NOTIFY | 通知介入 | 登录异常预警、账号审核建议、设备限制建议、MFA 强化建议、调查建议、强化认证、安全调查 |

Proposal 不代表真实动作已经执行。

Proposal 被接受不代表动作执行成功。

Proposal 生命周期状态：

- GENERATED：已生成。
- PENDING_REVIEW：待审批。
- APPROVED：已审批通过。
- REJECTED：已否决。
- WITHDRAWN：已撤回。
- EXPIRED：已过期。
- SUPERSEDED：已被新版本取代。

APPROVED 只代表审批通过，不代表动作执行成功。

Proposal 具有独立身份和版本：相同处置意图追加版本，不同处置意图创建新 Proposal；审批时保存风险快照；关键风险变化触发有效性重新评估；已审批 Proposal 不得静默覆盖。

状态转换规则（未列出的转换均为非法）：

| 当前态 | 触发事件 | 目标态 |
| --- | --- | --- |
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

REJECTED、EXPIRED、WITHDRAWN、SUPERSEDED 为终态，不再转换；任何状态不得回退到 GENERATED 或 PENDING_REVIEW；已 APPROVED 的 Proposal 不得 WITHDRAWN。

EXPIRED 触发：PENDING_REVIEW 超过可配置超时阈值（默认 72 小时）未处理，由定时任务置为 EXPIRED。

SUPERSEDED 判定：同一 RiskEvent + Proposal 类型 + 适用对象 构成同一处置意图；追加版本时旧版本置为 SUPERSEDED，新版本成为当前版本。不同处置意图创建新 Proposal，不触发 SUPERSEDED。

V1 不得通过 Proposal 工具隐式执行真实业务拦截、封禁、限流或锁号。

## 11. Notification 与 Report

### 11.1 Notification

区分：

- Notification。
- Delivery。
- Attempt。

通知记录、投递记录和投递尝试分别管理。

外部通知采用至少一次投递语义，不承诺 exactly-once。

UNKNOWN 投递结果必须进入协调流程，不能简单认定成功或失败。

通知失败不得导致 RiskEvent 或 Proposal 丢失。

V1 通知渠道：

- Webhook：通用 HTTP 回调。
- 邮件：SMTP。
- IM：飞书、钉钉、企业微信等机器人。

每个渠道配置至少包括：目标地址、超时、重试策略、凭证存放位置。凭证不得明文写入 YAML，统一走 Secret 机制。

通知人工处理闭环：

- 待确认。
- 已确认。
- 处理中。
- 已解决。

闭环保存接收人、确认人、处理人、时间、备注和结果，支持超时升级和转交；不建设复杂工单系统。通知确认不自动关闭风险。

### 11.2 Report

支持：

- JSON。
- Markdown。

基础报告由确定性结构化数据生成，不依赖 LLM 才能完成。

报告必须固定：

- 数据截止时间。
- 源数据版本。
- 规则版本。
- 计算版本。
- 报告生成时间。
- 数据一致性级别。

### 11.3 报告一致性

支持：

- POINT_IN_TIME。
- BEST_EFFORT。
- PARTIAL。

多来源报告默认采用 BEST_EFFORT。

数据不完整时必须标记 PARTIAL 或相应的数据质量状态。

历史报告不得因源数据后续变化而自动修改。

## 12. 多租户与安全

### 12.1 租户隔离

租户是业务数据和风险数据的基本隔离边界。

所有租户数据访问必须具备可信的租户约束。

Repository 不允许提供无租户约束的通用访问入口，例如无条件的 findById(id) 或 findAll()。

跨租户访问必须显式授权并留下审计记录。

### 12.2 TenantContext

TenantContext 由可信的 Application/Security 边界建立。

不得直接信任 Tool 参数中传入的 tenantId 作为授权依据。

### 12.3 配置安全

- 敏感配置必须安全保存。
- 日志不得输出秘密内容。
- 配置读取和修改应有审计。
- 配置热更新必须校验权限。

### 12.4 采集安全

- MySQL 采用授权账号和表字段白名单。
- SSH 使用受控账号和 Host Key 校验。
- Shell 命令禁止不安全拼接。
- 日志解析采用敏感字段过滤。
- 外部输入必须经过验证。

### 12.5 审计

重要操作应记录操作者或调用主体、租户、时间、操作对象、操作结果和必要的来源信息。

## 13. 存储与事务

### 13.1 存储方式

V1 主要使用 JSON / JSONL 文件。

SQLite 可作为未来扩展方向，不属于 V1 必须依赖。

### 13.2 Repository

Repository 负责领域对象的持久化访问。

要求：

- 所有租户数据查询具备租户约束。
- 支持分页。
- 支持稳定排序。
- 支持版本控制。
- 支持必要的幂等查询。
- 时间查询采用左闭右开区间。
- 持久化时间统一使用 UTC。

### 13.3 版本管理

区分：

- Entity Version。
- Definition Version。
- Schema Version。

更新应使用 expectedVersion 等机制避免静默覆盖。

### 13.4 幂等

同一幂等键：

- 同 Hash：返回原结果或原结果引用。
- 不同 Hash：拒绝冲突。
- 正在处理中：返回处理中引用或明确状态。
- UNKNOWN：先进行协调，不得直接重复执行。

### 13.5 文件持久化

必须支持：

- 安全写入。
- 原子替换适用范围内的文件。
- 索引重建。
- 崩溃恢复。
- 单实例目录互斥。
- 备份和恢复。

### 13.6 事务边界

使用统一 PersistenceTransactionCoordinator 协调文件持久化操作。

它不是完整 ACID 数据库事务。

V1 不承诺：

- 跨文件 ACID。
- 跨外部系统 ACID。
- 外部通知 exactly-once。
- 不具备协调机制的自动重复执行。

### 13.7 Journal / Outbox / Inbox

通过局部 Journal、Outbox、Inbox 和幂等机制支持必要的提交、恢复和重复消息处理。

具体记录格式、提交顺序、恢复算法和故障注入要求由 DOC-11 定义。

### 13.8 数据导入导出

支持受控的配置、报告、统计结果、风险数据、Evidence 和审计数据导入导出。

导入前必须执行 Schema、版本、租户归属、安全检查和差异预览；导入不得直接覆盖已有风险事实。

导出必须执行权限过滤、字段脱敏、资源限制、高风险审批、元数据记录、有效期设置、重新鉴权和审计。

## 14. 运行时、生命周期与并发

### 14.1 运行模式

- 单进程。
- 单实例。
- 单 Agent。
- 单插件。
- 模块化运行。

### 14.2 生命周期

必须明确：

- 启动初始化。
- 配置加载。
- 依赖装配。
- 持久化恢复。
- Tool 注册。
- 对外开放。
- 正常运行。
- 优雅关闭。
- 资源释放。

必须在恢复完成后再开放相关业务 Tool。

### 14.3 取消和超时

支持 Deadline、Cancellation 和资源释放。

必须区分：

- UNKNOWN。
- Timeout。
- Cancellation。

取消与超时采用协作式语义，不承诺强杀：同进程内不能强制终止任意代码，执行体必须配合 AbortSignal 在检查点自行退出并释放资源。

取消验收断言：取消请求发出后 5 秒内，执行体停止推进检查点并释放资源；超时未退出则升级为异常或资源泄漏告警。

### 14.4 配置热更新

配置修改后要求立即生效。

热更新必须：

1. 读取新配置。
2. 进行完整校验。
3. 形成不可变配置快照。
4. 校验通过后原子切换。
5. 校验失败时继续使用旧配置。
6. 记录配置版本和变更审计。
7. 已启动 Task / Workflow 继续使用启动时固定的配置快照。

### 14.5 并发预算

采用分层并发预算、有限队列、租户公平调度和背压。

初始建议值：

| 项目          | 建议并发 |
| ------------- | -------- |
| 全局 Task     | 8        |
| Workflow      | 4        |
| Workflow 节点 | 3        |
| Collection    | 3        |
| Metric        | 2        |
| Rule          | 2        |
| Notification  | 2        |
| Report        | 1        |
| 单租户 Task   | 3        |
| 单数据源采集  | 2        |

以上仅为初始工程建议值，不构成容量承诺。

最终值必须通过目标环境压测确定。

## 15. 错误处理与可观测性

### 15.1 错误分层

采用：

Infrastructure 原始异常 → Application Error → Use Case 处理 → Plugin Adapter 映射 DSH Response。

Domain 不直接依赖 DSH 错误类型。

### 15.2 错误分类

区分：

- Validation Error。
- Authorization Error。
- Not Found。
- Conflict。
- Timeout。
- Cancellation。
- Persistence Error。
- External Dependency Error。
- Internal Error。

### 15.3 业务结果与错误

Error、DataQuality 和 Business Result 必须分开。

规则未命中属于正常业务结果。

采集部分成功不应伪装为完全成功。

UNKNOWN 必须保留不确定状态。

### 15.4 可观测性

应具备：

- 结构化日志。
- Trace ID。
- Correlation ID。
- Task / Workflow ID。
- Tenant ID（遵循脱敏策略）。
- 关键业务操作记录。
- 采集和计算耗时。
- 错误分类。
- 持久化恢复日志。
- 配置变更记录。

不得在日志中输出敏感凭证。

## 16. 配置要求

### 16.1 配置格式

YAML 为主要配置格式。

### 16.2 配置范围

至少支持：

- 全局运行配置。
- 租户配置。
- 数据源配置。
- MySQL 表和字段白名单。
- SSH 主机和命令模板。
- 日志路径和解析规则。
- 监控指标配置。
- Metric 定义。
- Baseline 配置。
- Rule 定义。
- Risk 配置。
- Notification 配置。
- Report 配置。
- 并发预算。
- 保留周期。

上述配置项的具体 Schema 结构由 DOC-14 定义，本文档仅列配置范围、不定义 Schema。

### 16.3 配置校验

配置必须具备：

- Schema 校验。
- 类型校验。
- 必填项校验。
- 引用关系校验。
- 安全约束校验。
- 版本管理。
- 失败回滚。

### 16.4 配置生效

配置修改后立即生效，但不改变已经启动的 Task / Workflow 所固定的配置快照。

## 17. 非功能需求

### 17.1 可靠性

- 采集失败不得无条件推进检查点。
- 持久化失败不得报告提交成功。
- 重复数据不得重复产生业务事实。
- 通知失败不得影响风险事实保存。
- 系统异常退出后必须具备恢复机制。

### 17.2 安全性

- 默认租户隔离。
- 最小权限。
- 秘密信息保护。
- 采集命令限制。
- 敏感字段过滤。
- 重要操作审计。

### 17.3 可维护性

- 模块职责明确。
- 领域模型与基础设施解耦。
- 外部依赖通过 Port 隔离。
- 关键状态机可单独测试。
- 配置具有明确 Schema 和版本。

### 17.4 可扩展性

预留未来：

- 多 Agent。
- 多实例。
- Kafka。
- 其他持久化介质。
- HTTP 事件接入。
- 更多监控对象。
- 更多通知渠道。

预留不代表 V1 必须实现。

### 17.5 性能

具体吞吐量、延迟、数据规模、资源占用和恢复时间指标列为 TBD。

必须通过性能测试确定目标环境下的合理值。

## 18. 测试与验收要求

### 18.1 测试类型

- Unit Test。
- Contract Test。
- Integration Test。
- E2E Test。
- Acceptance Test。
- Performance Test。
- Security Test。
- Recovery Test。

### 18.2 测试基础设施

至少支持：

- TestClock。
- Fixture。
- Builder。
- Fake。
- Temporary Storage。
- 故障注入。
- 并发测试。
- 多租户测试。

### 18.3 DSH 独立契约测试

DSH 适配必须独立验证：

- 插件加载。
- Tool 注册。
- Tool 发现与调用。
- Schema 校验。
- Handler Context。
- Tool Response。
- 错误映射。
- 生命周期。
- 注销和资源释放。
- Timeout / Cancellation。
- 配置重载。

### 18.4 验收覆盖

业务验收：

- AT-001～AT-020：交易异常。
- AT-021～AT-044：登录失败异常。
- AT-045～AT-076：API 滥用。

测试编号必须与需求编号和测试用例保持关联。

上述 AT 编号仅在本文档登记与 BR 的映射关系；用例明细（前置条件、操作输入、预期输出、通过判据）由 DOC-15 定义。

可量化验收示例（示范粒度）：

> AT-EXAMPLE-001（交易异常）：前提为已配置 BR-001 固定阈值且租户 T1 采集窗口为自然日。输入 T1 某客户当日合计金额大于阈值的流水（数据质量 NORMAL）。预期生成 1 条 RiskEvent 进入 Triggered，并生成 1 条 GENERATED 状态的 Action Proposal。通过判据：RiskEvent 数量 = 1；Proposal 状态 = GENERATED；重复注入同批流水不产生第二条 RiskEvent。

> AT-EXAMPLE-002（监控健康）：前提为已注册 TOOL-009 get_monitor_health。输入一个数据源故障后调用。预期 health=DEGRADED 且该数据源 status 非正常。通过判据：健康状态随数据源状态正确变化、无副作用、越权 tenantId 被拒绝。

### 18.5 测试编号管理

建议采用：

- TST-UNIT。
- TST-CONTRACT。
- TST-INT。
- TST-E2E。
- TST-ACC。
- TST-PERF。
- TST-SEC。
- TST-REC。

具体测试编号应由 DOC-15 统一登记，分配前进行去重。

历史编号缺失时使用 ID_PENDING，不得冒充此前已经分配的编号。

### 18.6 覆盖率目标

初始建议：

- Domain：90%。
- Application：80%。
- 关键状态机、租户隔离、幂等分支：90%。

最终覆盖率目标由 DOC-15 根据代码结构和测试可行性校准。

## 19. 部署要求

### 19.1 部署形态

支持 Linux 直接部署和 Docker 部署。

### 19.2 运行目录

应明确区分：

- 配置目录。
- 数据目录。
- 日志目录。
- 临时目录。
- 备份目录。

### 19.3 运行权限

运行账号遵循最小权限原则。

SSH、MySQL 和文件访问权限应分别控制。

### 19.4 数据备份

必须提供备份和恢复方案。

备份需要明确：

- 备份范围。
- 一致性边界。
- 备份周期。
- 保留周期。
- 恢复步骤。
- 恢复验证。

具体参数列为 TBD。

## 20. 需求追踪与 TBD 管理

### 20.1 需求编号

需求编号必须唯一、稳定，不因文档章节调整而随意改变。

至少维护：

- BR：业务需求。
- TOOL：模型工具需求。
- SYS-MON：系统监控需求。
- AT：验收用例。
- TST：测试用例。
- TBD：待确认事项。
- DSH-ADP：DSH 适配要求。
- DSH-RUN：DSH 运行验证。

### 20.2 历史编号

对于已存在历史记录但当前无法完整还原的 Rule / Proposal 验收编号：

- 标记 ID_PENDING。
- 不得虚构历史编号。
- 在正式追踪表中重新分配管理编号。
- 保留与原设计决策的关联说明。
编号类型变更记录：CONS（一致性约束）、DIFF（设计差异）、CR（变更记录）、GAP（需求缺口）原声明于需求编号清单，但全文无实例；已从需求编号清单移除，归入设计评审与变更管理文档（DOC-02 及后续变更记录）管理。


### 20.3 RTM

必须维护以下追踪关系：

1. RTM-01：需求追踪表。
2. RTM-02：需求与设计追踪表。
3. RTM-03：需求与测试追踪表。
4. RTM-04：需求与验收追踪表。
5. RTM-05：变更影响追踪表。

业务需求应能追踪到 Collection、Event、Metric、Baseline、Rule、Risk、Evidence、Proposal、Notification / Report 等模块。

横向能力包括：

- Tenant。
- Repository。
- Error。
- Idempotency。
- Journal。
- Outbox / Inbox。
- Lifecycle。
- Concurrency。
- Config Reload。
- Backup / Restore。
- Observability。

### 20.4 TBD 总登记表

所有待确认事项必须进入统一登记表。

字段：

- TBD-ID。
- 待确认事项。
- 类别。
- 影响需求。
- 影响模块。
- 影响测试。
- 风险。
- 优先级。
- 是否阻塞开发。
- 建议解决阶段。
- 当前建议。
- 决策依据。
- 状态。

优先级：

- P0：阻塞需求基线冻结或关键安全边界。
- P1：阻塞对应模块详细设计或验收。
- P2：后续工程完善。
- P3：优化项。

状态：

- OPEN。
- UNDER_REVIEW。
- DECIDED。
- DEFERRED。
- BLOCKED。
- RESOLVED。

不得将建议值写成已经确认的正式参数。

当前已识别的待确认事项（TBD 汇总）：

| TBD-ID | 待确认事项 | 影响需求 | 影响模块 | 优先级 | 状态 |
| ------ | ---------- | -------- | -------- | ------ | ---- |
| TBD-001 | 交易表结构、字段映射、采集周期、阈值、基线样本量、保留期限 | BR-001 | Collection / Baseline / Rule | P1 | Open |
| TBD-002 | 采集频率、保留周期、指标数量、容量规划 | SYS-MON | Collection / Metric | P1 | Open |
| TBD-003 | 吞吐量、延迟、数据规模、资源占用、恢复时间 | 非功能 | 性能 / 可靠性 | P1 | Open |
| TBD-004 | 备份范围、周期、保留周期、恢复步骤参数 | 部署 | Backup / Restore | P1 | Open |

上述 TBD 均为 P1（阻塞对应模块详细设计或验收），不阻塞需求基线冻结；确认结果须回填 DOC-19 并同步更新本文档引用。

### 20.5 已确认决策登记

本项目已完成 RISK-INT-01～175 的用户确认，决策分组如下：

| 编号范围 | 主题 |
| ------- | ---- |
| 01～30 | 模块交互、持久化、事务和查询 |
| 31～50 | 查询契约、安全、DTO、API 和错误处理 |
| 51～70 | Task、Workflow、Scheduler、配置管理 |
| 71～80 | 生命周期、资源管理和韧性 |
| 81～90 | 可观测性、诊断和运行告警 |
| 91～110 | 安全、Secret、SSH、备份恢复和运维治理 |
| 111～115 | 全局一致性审查和需求追踪 |
| 116～130 | 运行策略、Metric、Rule、Risk 和 Evidence |
| 131～145 | 可靠性、采集、数据质量、多租户和备份 |
| 146～155 | 安全策略、DSH 适配、监控目标和依赖 |
| 156～165 | 覆盖率、报告、通知、部署和交付准入 |
| 166～175 | 人工干预、配置影响、导入导出、集成和变更治理 |

上述决策是已确认的设计依据。正式工程接口和具体字段仍应以对应模块契约和后续技术设计文件为准。

## 21. DSH 适配专项要求

### 21.1 技术基线

- 基线来源：DeepSeek Harness 仓库工作树 live 源码，以源码核验为准。
- 历史参考：v0.2.1-rc.5（b830ec9）仅为早期固定版本记录，不作为当前开发依据。
- 核验快照：fcc0ad46（2026-11-04 核验时点，后续源码更新不视为自动变更基线）。

当前适配依据以工作树源码核验结论为准，不得以历史的 rc.5 表述代替当前核验结果。

### 21.2 静态源码核验结果

第一轮静态源码核验已确认：

- Tool Runtime 位于 `packages/core/tools/src/index.ts`。
- 相关包名为 `@deepseek-ai/dsh-tools`。
- 通过 Cordis Context 的 `ctx.tools` 访问 Tool Runtime。
- 使用 `ctx.tools.register(definition)` 注册工具。
- 注册返回注销函数。
- Tool Definition 通过 `defineTool()` 构建。
- 插件采用 Cordis Loader 机制。
- 官方 tool-bash 插件结构包含 `name`、`inject`、`Config` 和 `apply(ctx, config)`。
- Tool Definition 包含名称、描述、参数、输出 Schema、渲染和 execute 等定义。
- Handler 执行上下文包含调用标识、Agent Context 和 AbortSignal 等信息。
- Tool 输出结构化数据与模型可见内容分离。
- 注册和注销能力已在源码层面确认。
- Timeout 属于协作式机制，不能假定能够强制终止同进程任意代码。
- 工作树源码使用 ESM。
- DSH 根项目 engines 声明为 `^22.19.0 || >=24.0.0`，pnpm 版本为 `11.28.5`；本插件开发环境约束为 Node.js `>=24.9`（见 AGENTS.md）。

以上是静态源码核验结论，不等于插件运行验证完成。

### 21.3 适配核验矩阵

| 编号        | 核验项目           | 当前状态   |
| ----------- | ------------------ | ---------- |
| DSH-ADP-001 | 插件入口和导出     | 源码已确认 |
| DSH-ADP-002 | 原生 Tool Registry | 源码已确认 |
| DSH-ADP-003 | Tool Schema        | 源码已确认 |
| DSH-ADP-004 | Tool Handler       | 源码已确认 |
| DSH-ADP-005 | Handler Context    | 源码已确认 |
| DSH-ADP-006 | Tool Response      | 源码已确认 |
| DSH-ADP-007 | Error              | 部分确认   |
| DSH-ADP-008 | Config             | 源码已确认 |
| DSH-ADP-009 | Lifecycle          | 部分确认   |
| DSH-ADP-010 | Build / Package    | 源码已确认 |
| DSH-ADP-011 | 动态注册和卸载     | 部分确认   |
| DSH-ADP-012 | Cancel / Timeout   | 部分确认   |

### 21.4 运行验证清单

以下项目必须通过真实 DSH 运行验证：

- DSH-RUN-001：自定义插件加载。
- DSH-RUN-002：Tool 发现与调用。
- DSH-RUN-003：非法参数处理。
- DSH-RUN-004：非法输出 Schema 处理。
- DSH-RUN-005：插件卸载和 Tool 注销。
- DSH-RUN-006：Context 销毁和资源清理。
- DSH-RUN-007：超时与取消。
- DSH-RUN-008：配置重载。
- DSH-RUN-009：初始化失败。
- DSH-RUN-010：构建和部署兼容性。

静态核验与运行验证必须分别记录证据、执行环境、结果和缺陷。

## 22. 交付物

V1 设计文档交付清单按「生成节点 → 生成顺序 → 优先级」编排，编号即生成顺序；ADR 独立编号，随决策贯穿记录。

| 节点 | 名称 | 含义 |
| --- | --- | --- |
| G0 | 需求冻结 | 需求基线定稿 |
| G1 | 架构设计 | 架构骨架、状态机、编排、数据流 |
| G2 | 详细设计 | 数据模型、契约、规则与指标 |
| G3 | 横切设计 | 可靠性、安全、可观测、配置 |
| G4 | 测试与追踪 | 测试规格、RTM 收口、TBD 收敛 |
| G5 | 集成与部署 | DSH 适配、部署设计 |
| — | 贯穿全程 | ADR 随每个决策即时记录 |

优先级：P0=开发启动前必须冻结（阻塞）；P1=开发启动时可并行；P2=开发中后期完成。

| 编号 | 层级 | 文档名称 | 生成节点 | 优先级 | 主要前置输入 |
| --- | --- | --- | --- | --- | --- |
| DOC-01 | 需求 | 需求规格说明书 | G0 | P0 | 业务需求 |
| DOC-02 | 架构 | 总体架构与模块设计 | G1 | P0 | DOC-01 |
| DOC-03 | 架构 | 领域模型与状态机设计 | G1 | P0 | DOC-01、DOC-02 |
| DOC-04 | 架构 | 采集与编排设计（Scheduler/Workflow/Task） | G1 | P0 | DOC-02 |
| DOC-05 | 架构 | 端到端数据流设计 | G1 | P0 | DOC-02 |
| DOC-06 | 详细·数据 | DTO 与数据模型规格 | G2 | P0 | DOC-02、DOC-03 |
| DOC-07 | 详细·契约 | Ports 与 Repository 契约 | G2 | P0 | DOC-06 |
| DOC-08 | 详细·契约 | Tool 接口契约规格（九个模型工具） | G2 | P0 | DOC-01、DOC-06 |
| DOC-09 | 详细·规则 | 指标与基线规格 | G2 | P0 | DOC-01、DOC-06 |
| DOC-10 | 详细·规则 | 规则与风险评分规格 | G2 | P0 | DOC-01、DOC-09 |
| DOC-11 | 横切·可靠性 | 错误、事务、幂等与恢复规格 | G3 | P0 | DOC-01、DOC-02、DOC-05、DOC-06 |
| DOC-12 | 横切·安全 | 安全与多租户设计 | G3 | P0 | DOC-01、DOC-02、DOC-06 |
| DOC-13 | 横切·可观测 | 可观测性设计 | G3 | P0 | DOC-01、DOC-02、DOC-05、DOC-11、DOC-12 |
| DOC-14 | 横切·配置 | 配置文件规格 | G3 | P0 | DOC-01、DOC-02、DOC-04、DOC-06、DOC-07、DOC-08、DOC-11、DOC-12、DOC-13 |
| DOC-15 | 测试·追踪 | 测试与验收规格 | G4 | P1 | 全部 P0 设计 |
| DOC-16 | 集成 | DSH 适配设计规格 | G5 | P1 | DOC-02 及 DSH 源码核验 |
| DOC-17 | 部署 | 部署设计规格 | G5 | P2 | DOC-14、DOC-16 |
| DOC-18 | 管理 | RTM 需求追踪矩阵 | G4 | P1 | 全程 |
| DOC-19 | 管理 | TBD 总登记表 | G0~G4 | P0 | 全程 |
| ADR-xxx | 决策 | 架构决策记录 | 贯穿 | P0 | 各项设计 |

开发启动前必须先冻结 DOC-01～DOC-14（14 份）与 ADR；DOC-15、DOC-16、DOC-18 可在开发启动后并行推进；DOC-17 最后完成。

## 23. 基线冻结条件

正式冻结 DOC-01 前，必须满足：

1. BR-001～003 需求范围无冲突。
2. SYS-MON 正式需求范围已登记。
3. 所有正式需求具备唯一编号。
4. 历史编号缺失项已明确标记。
5. TBD 已建立统一登记表。
6. P0 冻结阻塞项已关闭，或由明确的正式决策批准例外。
7. 四层架构及依赖方向已确定。
8. V1 范围边界无未授权扩大。
9. 安全和多租户要求完整。
10. 状态语义无相互冲突。
11. 数据持久化和事务能力边界明确。
12. 需求追踪关系已建立。
13. 评审意见和变更记录已归档。

DSH 源码核验与运行验证作为工程适配验收门禁单独跟踪；未通过之前，不得宣称 DSH 适配已完成，也不得将未验证能力作为已实现功能。

## 附录 A：核心设计原则

1. Agent-first。
2. DSH 是底层 Agent Runtime。
3. V1 单 Agent、单插件、单进程、单实例。
4. 直接使用 DSH 原生 Tool Registry。
5. 不建设独立 Web UI 或 Java 风险平台。
6. YAML 配置，支持安全热更新。
7. Domain 与 DSH 解耦。
8. 采用四层架构。
9. 事件不可变，源数据变化保留版本。
10. 数据质量与业务结果分离。
11. 风险事实、风险周期、攻击活动分离。
12. Evidence 保留完整判定依据。
13. V1 只生成 Action Proposal，不执行真实动作。
14. 文件持久化不冒充 ACID 数据库。
15. 不承诺跨外部系统 exactly-once。
16. 所有租户数据访问具备可信租户约束。
17. 配置热更新不得改变已启动任务的配置快照。
18. 不把 LLM 作为最终风险判定和评分的唯一依据。

## 附录 B：版本与文档状态说明

| 版本          | 状态       | 说明                       |
| ------------- | ---------- | -------------------------- |
| V1.0-Review   | 历史评审稿 | 初始需求规格               |
| V1.1-Review   | 历史评审稿 | 纳入完整性和一致性审查修订 |
| V1.2-Review   | 历史评审稿 | 并入《Java 企业级风险监控 Agent》独有内容，并完成评审整改（技术基线、模型工具需求、风险状态机等） |
| V1.3-Baseline | Frozen     | 冻结基线，开发启动依据 |

本文档已冻结。

任何未确认的参数、实现细节和运行验证结果，均不得因本文档修订而被视为已经完成。

**文档结束。**