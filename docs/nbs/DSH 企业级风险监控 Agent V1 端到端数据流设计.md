# DSH 企业级风险监控 Agent V1 端到端数据流设计

| 文档属性 | 内容 |
| -------------- | ------------------------------------------ |
| 文档编号 | DSH-RISK-FLOW-V1 |
| 文档名称 | DSH 企业级风险监控 Agent V1 端到端数据流设计 |
| 版本 | V1.0-Baseline |
| 文档状态 | 已冻结（Frozen） |
| 前置输入 | DOC-01（V1.3-Review）；DOC-02（总体架构与模块设计）；DOC-03（领域模型与状态机设计）；DOC-04（采集与编排设计） |
| 下一环节 | DOC-06（DTO 与数据模型）、DOC-07（Ports 与 Repository 契约）、DOC-11（错误/事务/幂等/恢复） |
| 适用范围 | DSH 风险监控 Agent V1 插件工程 |
| 技术基线 | DeepSeek Harness 工作树 live 源码（以源码核验为准） |

## 1. 文档概述

### 1.1 编写目的

本文档定义 V1 风险监控的端到端数据流：数据从采集进入系统，经标准化、指标计算、基线、规则评估、风险判定、证据生成、Proposal 生成，最终输出报告与通知。本文档固化各阶段职责、数据转换关系、贯穿机制（版本、幂等、数据质量、时间时区、租户隔离）与一致性保证。

### 1.2 边界声明

| 主题 | 归属 |
| ---- | ---- |
| 端到端数据流阶段与转换关系 | 本文档 |
| 各阶段对象字段级 DTO | DOC-06 |
| Repository / Port 契约 | DOC-07 |
| 采集执行与任务编排机制 | DOC-04 |
| 领域状态机 | DOC-03 |
| 错误/事务/幂等/恢复边界 | DOC-11 |

### 1.3 前置输入与依据

DOC-01 §4（BR-001～003）、§7（数据采集与事件处理）、§8（Metric/Baseline/Rule）、§9（风险管理）、§10（Evidence 与 Action Proposal）、§11（Notification 与 Report）；DOC-02 §4（模块）；DOC-03（领域模型与状态机）；DOC-04（采集与编排）。

## 2. 数据流总体视图

```
采集（Collection）          ─ DOC-04
   │  原始数据（裸数据源记录）
   ▼
标准化（Standardization）   ─ 事件、幂等、EventState 判定
   │  标准事件（TransactionEvent / LoginEvent / ApiAccessEvent）
   ▼
指标计算（Metric）          ─ MetricResult + DataQuality + Lineage
   │  MetricResult
   ▼
基线（Baseline）            ─ 历史正常表现（Candidate/Active/Frozen）
   │  基线参考
   ▼
规则评估（Rule）            ─ EvaluationResult（规则版本 + 输入指标版本 + 数据质量）
   │  命中/未命中
   ▼
风险判定（Risk）            ─ RiskEvent / RiskCycle / AttackEvent（状态机）
   │  触发/持续/恢复
   ▼
证据 + Proposal             ─ Evidence 快照 + ActionProposal
   │
   ├─► 通知（Notification/Delivery/Attempt）
   └─► 报告（JSON/Markdown，一致性级别）
```

数据流遵循单向分层：上游为下游提供输入，下游不反向改写上游事实；各阶段历史事实不可被后置阶段覆盖（版本化而非覆盖）。

## 3. 数据流阶段定义

### 3.1 采集（Collection）

- 输入：MySQL / SSH / Log 三类数据源。
- 输出：原始数据记录 + CollectionCommit（三态）+ Checkpoint。
- 机制：采集模式（FULL/INCREMENTAL/TIME_RANGE/SNAPSHOT/TAIL）、检查点推进、数据质量归因（采集侧 STALE/ERROR）。
- 详见 DOC-04；此阶段不负责标准化与业务语义。

### 3.2 标准化（Standardization）

- 输入：原始数据记录。
- 输出：标准事件（含公共事件元数据），并判定 EventState。
- 关键动作：
  1. 映射到标准事件 Schema（字段白名单过滤，敏感字段脱敏见 §5.7）。
  2. 生成/校验 `idempotencyKey`，做幂等判定（见 §5.2）。
  3. 时间戳分层：`eventTime ≤ collectedAt ≤ ingestedAt`，UTC 存储（见 §5.4）。
  4. 事件不可原地修改；源版本变化产生新版本，旧版本标记 `SUPERSEDED`（见 §5.1）。
- 事件状态流转（EventState）：
  - `ACCEPTED` → 进入后续计算。
  - `DUPLICATE` → 幂等重复，返回原结果引用，不重复计算。
  - `REJECTED` → 校验失败（非法字段/越权/时机违反）。
  - `QUARANTINED` → 隔离（如幂等结果 `UNKNOWN` 需先协调）。
  - `SUPERSEDED` → 被新版本取代，不参与后续计算但保留来源关系。

### 3.3 指标计算（Metric）

- 输入：标准事件（或系统采集数据）。
- 输出：`MetricResult`（含 metricId/tenantId/dimension/value/unit/sampleCount/windowStart/windowEnd/dataQuality/lineage/calculationVersion）。
- 关键规则：
  1. 指标缺失不自动视为零；非法运算（除零等）产出 `INVALID`。
  2. 记录样本数、数据质量、计算来源（Lineage）与计算版本。
  3. 金额类 value 精确十进制（定点字符串 + scale + 币种）；计数整数；比率/速率/延迟为声明精度的浮点。
  4. 窗口左闭右开 `[start, end)`；业务日按租户时区。
  5. 派生指标走依赖 DAG（多层派生、循环依赖检测），禁止任意动态代码。
  6. 维度治理（Top-K、低频归并、白名单、拒绝、资源预算）不得静默隐藏关键风险对象。

### 3.4 基线（Baseline）

- 输入：历史 MetricResult。
- 输出：Baseline（Candidate / Active / Frozen / 历史统计 / 移动平均 / 分时段 / 版本）。
- 关键规则：
  1. 样本不足不得伪造正常基线。
  2. 异常数据不得无条件进入正常基线；活动风险范围可冻结对应基线。
  3. Baseline 只描述历史正常表现，不直接负责风险判断（风险判定由规则承担）。

### 3.5 规则评估（Rule）

- 输入：MetricResult + Baseline 参考。
- 输出：`EvaluationResult`（记录规则版本、输入指标版本、数据质量）。
- 关键规则：
  1. Rule 采用结构化 DSL/AST（AND/OR/NOT、固定/动态阈值、多指标/多窗口、基线比较）。
  2. 缺失值/NULL/无效值具明确求值语义。
  3. 规则未命中属正常业务结果，不属系统错误。
  4. 禁止任意 JavaScript / SQL。

### 3.6 风险判定（Risk）

- 输入：EvaluationResult。
- 输出：RiskEvent / RiskCycle / AttackEvent（状态机，见 DOC-03 §7.1）。
- 关键规则：
  1. 状态转换由状态机引擎执行，LLM 不得直接指定最终状态。
  2. Risk Score（确定性评分）与 Severity（等级）分离，转换由明确规则定义。
  3. 恢复走 Recovery Rule（连续无异常窗口数 + 评分低于阈值 + 数据质量门槛 + 可选人工确认）。

### 3.7 证据生成（Evidence）

- 输入：风险判定 + 输入快照。
- 输出：Evidence（风险关联标识、来源事件、指标及计算版本、规则及规则版本、关键输入快照、数据质量、判定时间、计算版本、关联关系、来源引用）。
- 关键规则：Evidence 不可无审计覆盖；Hash 可检测内容变化但不单独证明不可篡改。

### 3.8 Proposal 生成

- 输入：RiskEvent/Cycle + Evidence。
- 输出：ActionProposal（七态状态机，见 DOC-03 §7.2）。
- 关键规则：V1 只生成建议不执行动作；相同处置意图追加版本（旧版本 SUPERSEDED），不同意图新建。

### 3.9 通知与报告

- 通知：Notification → Delivery → Attempt，至少一次投递，人工处理闭环。
- 报告：JSON/Markdown；固定数据截止时间、源数据版本、规则版本、计算版本、生成时间、一致性级别。

## 4. 三类业务事件数据流

### 4.1 交易异常（BR-001）

```
MySQL 交易表（白名单表/字段，增量游标）
  → 采集 → 标准化 TransactionEvent → 幂等
  → 交易统计（自然日/滚动24h，租户时区，多币种分别）
  → Metric（金额精确十进制）
  → Baseline（历史正常交易基线）
  → Rule（固定阈值/动态阈值/多条件/基线比较）
  → RiskEvent/Cycle（Triggered）
  → Evidence（含规则版本+指标计算版本）
  → ActionProposal（GENERATED）
  → 通知 / 报告
```

关键约束：退款/冲正保留原交易关系；默认只统计业务成功状态（TransactionStatus SUCCESS 集，数据源配置决定）；跨币种汇总需可靠汇率与换算精度。

### 4.2 登录失败异常（BR-002）

```
认证日志 / 应用日志
  → 采集 → 标准化 LoginEvent → 幂等
  → 认证结果分类（系统/网络故障不计入失败）
  → 统计维度（客户/账号/IP/设备/渠道，固定/滚动/连续窗口）
  → 连续失败计数（真实失败分别计数，重复采集合一）
  → 攻击识别（单主体连续失败/单IP多账号/多IP单账号/分布式/撞库）
  → RiskEvent + AttackEvent（关联多 RiskEvent）
  → Evidence → ActionProposal（预警/审核/建议锁定等）
  → 通知 / 报告
```

关键约束：Subject Relation 记录方向/关系类型/依据/可信度/有效时间/来源；IP 代理识别用可信代理配置；登录成功只能作为重新评估信号，不自动清除风险。

### 4.3 API 调用异常（BR-003）

```
API 网关 / Nginx / Apache / Java 日志 / MySQL 审计
  → 采集 → 标准化 ApiAccessEvent → 幂等
  → 请求阶段串联（requestId 串联四阶段，traceId 跨服务）
  → API 路径模板化（动态参数归一，UNKNOWN_API 标识）
  → 统计指标（总量/成功率/失败率/超时率/P50-P99/独立调用主体数/调用序列）
  → 调用序列/顺序/间隔分析
  → Rule（嵌套 AND/OR/NOT）
  → RiskEvent/Cycle → Evidence → ActionProposal（限流/封禁来源/暂停API等建议）
  → 通知 / 报告
```

关键约束：不同请求阶段不得混合计算同一请求总量（同 requestId 下不同阶段记录不得重复累计）；HTTP 200 不必然代表业务成功。

## 5. 贯穿机制

### 5.1 事件不可变与版本

- 事件不可原地修改；源版本变化产生新版本并标记 `SUPERSEDED`，旧版本不参与后续计算但保留来源关系与旧计算版本供审计/重算追溯。
- 迟到数据进入历史窗口重算时保留旧计算版本与新版本；重算版本保留上限可配置（默认最近 2 个历史版本 + 当前版本），超限归档或清除。

### 5.2 幂等

- 幂等键 = 租户 + 数据源 + 表 + 主键 + 源版本（固定顺序拼接 → 确定性 Hash）。
- 语义：同 Hash 返回原结果或引用；不同 Hash 拒绝冲突；处理中返回引用；UNKNOWN 先协调。
- 同一业务事实重复采集不重复形成统计（对齐 DOC-01 §4.1.7）。

### 5.3 数据质量贯穿

- `DataQuality`（NORMAL/STALE/PARTIAL/ERROR/INVALID）附着于数据/事件，贯穿采集→指标→规则→Evidence 各阶段。
- 与 `CollectionStatus`（执行结果）、`EventState`（事件处理）、覆盖率状态四者分离，不得相互替代（DOC-03 §6.1）。
- 迟到数据：阈值内进入历史窗口重算；超阈值丢弃并产生告警，不触发重算。

### 5.4 时间与时区

- 时间戳分层：`eventTime`（业务时间）≤ `collectedAt`（采集）≤ `ingestedAt`（入库标准化）。时钟偏差/乱序保留原始时间戳并标记，不静默改写。
- 绝对时刻一律 UTC 存储，展示与业务计算按租户时区（IANA tz）换算。
- 业务日切点默认 00:00 租户本地时间，可配置；窗口左闭右开 `[start, end)`；跨时区统计先换算 UTC 再判定。

### 5.5 版本管理贯穿

| 版本 | 含义 | 附着阶段 |
| ---- | ---- | -------- |
| schemaVersion | 事件 Schema 版本 | 标准化 |
| 事件版本（SUPERSEDED） | 源版本变化 | 标准化 |
| calculationVersion | 指标计算版本 | 指标/Evidence |
| Baseline 版本 | 基线版本（Candidate/Active/Frozen） | 基线 |
| ruleVersion | 规则版本 | 规则/Evidence |
| 报告版本（源数据/规则/计算版本） | 报告一致性 | 报告 |

### 5.6 租户隔离贯穿

- 每个阶段（采集 → 标准化 → 指标 → 规则 → 风险 → 报告）的数据访问均具备可信租户约束；Repository 不提供无租户约束入口。
- 跨租户访问显式授权 + 审计。

### 5.7 敏感数据与脱敏

- 采集阶段字段白名单过滤；认证凭据与密钥一律删除；PII 按关联/展示分别 Hash/掩码；详见 DOC-01 §10.2 与 DOC-12。

## 6. 数据流一致性保证

### 6.1 报告一致性级别

| 级别 | 含义 |
| ---- | ---- |
| POINT_IN_TIME | 单一一致时点的快照 |
| BEST_EFFORT | 多来源尽力一致（默认） |
| PARTIAL | 数据不完整，显式标记 |

- 多来源报告默认 `BEST_EFFORT`；数据不完整必须标记 `PARTIAL` 或相应数据质量状态。
- 报告固定：数据截止时间、源数据版本、规则版本、计算版本、生成时间、一致性级别。
- 历史报告不得因源数据后续变化自动修改。

### 6.2 顺序与幂等保证

- 事件按 `ingestedAt` 顺序进入计算；乱序数据标记偏差并保留。
- 幂等在标准化阶段一次性判定，后续阶段不重复判定也不重复计算。

## 7. 数据流错误处理与恢复

- 各阶段错误分类与恢复边界由 DOC-11 定义；本文档定义数据流级的恢复语义：
  1. 采集失败不推进检查点（§3.1）。
  2. 标准化幂等结果 `UNKNOWN` 进入协调，不直接重复执行。
  3. 指标非法运算产出 `INVALID`，不伪造数值；数据质量降级伴随结果传递。
  4. 规则未命中属正常结果；风险判定失败不静默恢复。
  5. 通知失败不导致 RiskEvent/Proposal 丢失。
- 崩溃恢复：从最近已持久化 Checkpoint/Commit 续跑（DOC-04 §8.2）。

## 8. 与下游文档边界

| 本文档 | 下游承接 |
| ------ | -------- |
| 数据流阶段与转换关系 | DOC-06（各对象字段级 DTO） |
| 采集/事件/指标/报告的对象 | DOC-06、DOC-07（Ports/Repository 契约） |
| 数据流错误/事务/幂等/恢复 | DOC-11 |
| 敏感数据与脱敏落地 | DOC-12 |
| 时间时区/度量技术实现 | DOC-06 / DOC-13 |

## 附录 A：数据流阶段与模块映射

| 阶段 | Application 模块（DOC-02） | Domain 模块（DOC-02） |
| ---- | ------------------------- | --------------------- |
| 采集 | MOD-APP-005 Collector | MOD-DOM-005 Collector / 006 DataSource |
| 标准化 | MOD-APP-005（编排） | MOD-DOM-016 Event |
| 指标 | MOD-APP-006 Metric | MOD-DOM-007 Metric |
| 基线 | MOD-APP-007 Baseline | MOD-DOM-007（Baseline 归 Metric 域） |
| 规则 | MOD-APP-008 Rule | MOD-DOM-008 Rule |
| 风险 | MOD-APP-009 Risk | MOD-DOM-009 Risk |
| 证据 | MOD-APP-010 Evidence | MOD-DOM-010 Evidence |
| Proposal | MOD-APP-011 Proposal | MOD-DOM-011 Proposal |
| 报告/通知 | MOD-APP-012/013 | MOD-DOM-012/014 |

## 附录 B：版本与文档状态

| 版本 | 状态 | 说明 |
| ---- | ---- | ---- |
| V1.0-Baseline | Frozen | 冻结基线，开发启动依据 |

本文档已冻结，基线版本 `V1.0-Baseline`，作为开发启动依据。

**文档结束。**