# DSH 企业级风险监控 Agent V1 配置文件规格

| 文档属性 | 内容 |
| -------------- | ------------------------------------------ |
| 文档编号 | DSH-RISK-CONFIG-V1 |
| 文档名称 | DSH 企业级风险监控 Agent V1 配置文件规格 |
| 版本 | V1.0-Baseline |
| 文档状态 | 已冻结（Frozen） |
| 前置输入 | DOC-01（DSH-RISK-SRS-V1，V1.3-Review，§16）；DOC-02（总体架构与模块设计，MOD-APP-001、§7.5）；DOC-06（DTO 与数据模型规格：`ConfigSnapshotRef`/`configRef`）；另对 ADR-007（YAML 配置和热更新）、DOC-11（重试/超时/保留）、DOC-12（Secret/脱敏）、DOC-13（采样/告警）保持一致性引用 |
| 下一环节 | DOC-15（测试与验收）、DOC-16（DSH 适配设计规格）、DOC-17（部署设计规格） |
| 适用范围 | DSH 风险监控 Agent V1 插件工程 |
| 技术基线 | DeepSeek Harness 工作树 live 源码（以源码核验为准） |
| 核验快照 | fcc0ad46（2026-11-04 核验时点，不构成基线锁定） |

## 1. 文档概述

### 1.1 编写目的

本文档定义 V1 风险监控 Agent 的配置 Catalog 与 YAML Schema：配置格式与承载、顶层配置项清单（全局/租户/数据源/采集/并发/保留/可观测/安全）、校验规则、不可变快照与版本管理、热更新与失效回退语义，以及与领域定义对象的装载边界。

本文档是 DOC-01 §16（配置要求）的 Schema 落地，是 ADR-007 的展开；DOC-02 MOD-APP-001 标明「Schema 见 DOC-14」。

### 1.2 边界声明

| 主题 | 归属 |
| ---- | ---- |
| Config 接口与 schemastery Schema、YAML 结构、校验、快照、热更新 | 本文档 |
| 并发预算、重试/退避/超时、保留周期、采样/告警阈值等取值项 Schema | 本文档 |
| 领域定义对象（MetricDefinition/RuleDefinition/Baseline/Risk/Notification/Report）的字段 | DOC-06 |
| 领域定义对象在 YAML 中的装载/引用形式与校验 | 本文档（引用 DOC-06 字段） |
| Secret 引用/脱敏/审计的安全语义 | DOC-12 §6/§8 |
| 采样/告警/保留的观测语义 | DOC-13 |
| 重试/超时/保留的事务语义 | DOC-11 |

本文档只定义「配置怎么表达与校验」；各配置项「如何被消费」由对应领域/横切文档定义。

### 1.3 前置输入与依据

DOC-01 §16；DOC-02 §4.2 MOD-APP-001、§7.5、§9.2、§10；DOC-06 §2/§3（`ConfigSnapshotRef`、`configRef`）；ADR-007；DOC-11（重试/超时/保留周期）；DOC-12（Secret/脱敏）；DOC-13（抽样/告警阈值）。

### 1.4 术语

复用 DOC-01 §1.3、DOC-11/12/13 §1.4 术语，新增：

| 术语 | 定义 |
| ---- | ---- |
| Config Snapshot | 校验通过后生成的不可变配置快照 |
| ConfigSnapshotRef | 快照版本引用（`Branded<string, 'ConfigSnapshotRef'>`，DOC-06） |
| Last Known Good（LKG） | 最后一次校验通过并成功生效的快照，热更新失败时回退目标 |
| 原子切换 | 快照一次性替换、运行中只读旧或新快照、不出现中间态 |
| 引用完整性 | 配置项间引用（configRef、datasourceId、metricId、ruleId、channelId 等）必须指向已存在对象 |

## 2. 配置设计目标与原则

1. **YAML 唯一主要格式**（DOC-01 §16.1、ADR-007）。
2. **声明式 + 强 Schema**：`export interface Config` + schemastery `Schema` 共同声明（DOC-02 §7.5），schemastery 负责结构/类型/必填校验。
3. **一次性校验、不可变快照**：读取 → Schema 校验 → 业务校验 → 不可变快照 → 原子切换 → 审计。
4. **失败回退 Last Known Good**：热更新失败不改变当前生效配置。
5. **快照固定语义**：已启动 Task/Workflow 继续使用启动时快照；历史事实不被热更新覆盖（DOC-01 §16.4、ADR-007）。
6. **秘密不落 YAML**：认证凭据/密钥以 `SecretReference` 引用，走 Secret 机制（DOC-12 §6）。
7. **版本前瞻**：Schema 演进需版本化，可校验旧快照（ADR-007；DOC-06 `ConfigSnapshotRef`）。
8. **引用完整性**：跨对象引用必须可解析，缺失引用在加载期失败（参照 AGENTS.md「Misconfiguration fails loud」）。

## 3. 配置格式与承载

### 3.1 YAML 为唯一主要格式

配置以 YAML 承载；遵循 cordis.yml 约定，插件逐项校验自身 `Config`（DOC-01 §16.1、DOC-02 §7.5）。YAML 中不出现明文秘密，敏感项一律 `SecretReference`（DOC-12 §6）。

### 3.2 Config 接口与 Schema

顶层形态（schemastery）：

```ts
import { Schema } from '@deepseek-ai/schemastery';

export interface Config {
  global: GlobalConfig;
  tenants?: TenantConfig[];            // 缺省=单租户，见 §4.2
  dataSources?: DataSourceConfig[];     // 采集数据源
  concurrencyBudget: ConcurrencyBudgetConfig;
  retention: RetentionConfig;
  observability: ObservabilityConfig;
  security?: SecurityConfig;
}

export const Config: Schema<Config> = Schema.object({
  global: Schema.object({ /* §4.1 */ }),
  tenants: Schema.array(Schema.object({ /* §4.2 */ })).optional(),
  dataSources: Schema.array(Schema.object({ /* §4.3 */ })).optional(),
  concurrencyBudget: Schema.object({ /* §4.12 */ }),
  retention: Schema.object({ /* §4.12 */ }),
  observability: Schema.object({ /* §4.13 */ }),
  security: Schema.object({ /* §4.13 */ }).optional(),
});
```

领域定义对象（Metric/Rule/Baseline/Risk/Notification/Report）不作为 `Config` 字段整体内联，而以 `configRef`/定义文件引用装载；其字段 Schema 由 DOC-06 定义，本文档在 §4.7～§4.11 规定装载与引用形式。

### 3.3 配置目录布局

配置目录与数据/日志/临时/备份/Secrets 目录分离（DOC-02 §9.2）：

| 目录 | 内容 |
| ---- | ---- |
| 配置目录 | 有效 `config.yml` + 领域定义（metric/rule/baseline/notification/report） |
| Secrets 目录 | Secret 值（经 Secret 机制，权限 `0600`，禁止落 YAML） |
| 数据目录 | `data/tenants/{tenantId}/...`（租户分区） |
| 日志目录 | 业务日志（DOC-13） |
| 备份目录 | 快照/数据备份（DOC-17） |

## 4. 配置项清单（顶层 Schema）

各表「默认值」列均为建议默认；凡是 `Config` 字段，运行期可改属于「热更新项」，固定不动者标注「协议常量」或「启动期项」。

### 4.1 全局运行配置（`global`）

| 字段 | 类型 | 必填 | 默认 | 约束 | 消费 |
| ---- | ---- | ---- | ---- | ---- | ---- |
| timezone | `Timezone` | N | `Asia/Shanghai` | 合法 TZ | 业务日/窗口换算（DOC-07 §2.3） |
| logLevel | `LogLevel` | N | `INFO` | DOC-13 §4.1 分级 | 日志 |
| retry.maxRetries | `number` | N | `3` | ≥0（0=不重试） | 瞬时失败重试（DOC-11 §3.2） |
| retry.backoffBaseMs | `number` | N | `200` | >0 | 退避基数 |
| retry.backoffMaxMs | `number` | N | `5000` | ≥ base | 退避上限 |
| timeout.collectionMs | `number` | N | `30000` | >0 | 采集超时（DOC-04） |
| timeout.ruleEvalMs | `number` | N | `10000` | >0 | 规则评估超时 |
| timeout.notificationMs | `number` | N | `15000` | >0 | 通知投递超时 |
| reconciliation.interval | `Duration` | N | `1h` | >0 | Journal/数据全量对账周期（DOC-11 §6.3） |
| proposal.expiryTimeout | `Duration` | N | `72h` | >0 | Proposal 审批超时窗：PENDING_REVIEW 超时未处理→EXPIRED（DOC-01 §10.3，定时任务消费） |

### 4.2 租户配置（`tenants[]`）

| 字段 | 类型 | 必填 | 默认 | 约束 | 消费 |
| ---- | ---- | ---- | ---- | ---- | ---- |
| tenantId | `TenantId` | Y | — | 全局唯一，品牌化 | 隔离边界（DOC-12 §3） |
| enabled | `boolean` | N | `true` | — | 租户启停 |
| timezone | `Timezone` | N | 继承 `global` | — | 业务日换算 |

缺省 `tenants` 未配置时视为单租户模式；租户身份仍由可信边界建立，不信任 Tool 入参（DOC-12 §3.2）。

### 4.3 数据源配置（`dataSources[]`）

| 字段 | 类型 | 必填 | 默认 | 约束 | 消费 |
| ---- | ---- | ---- | ---- | ---- | ---- |
| dataSourceId | `DataSourceId` | Y | — | 唯一 | 采集（DOC-04/05） |
| tenantId | `TenantId` | Y | — | 存在 | 租户归属 |
| type | `'mysql'\|'ssh'\|'log'` | Y | — | 枚举 | Adapter 路由 |
| enabled | `boolean` | N | `true` | — | 启停 |
| schedule | `Schedule`（cron 或轮询间隔） | Y | — | 互斥 | Task 调度（DOC-04） |
| cursor | 复合游标字段（如 `updated_at+pk`） | Y | — | — | Checkpoint（DOC-04） |
| connection | `SecretReference` | Y | — | 不落明文 | 凭证（DOC-12 §6） |
| collectionConfig | 按 `type` 分派的采集参数 | Y | — | §4.4～4.6 | 采集 |

### 4.4 MySQL 采集配置（`collectionConfig.mysql`）

| 字段 | 类型 | 必填 | 默认 | 约束 | 消费 |
| ---- | ---- | ---- | ---- | ---- | ---- |
| host/port | `string`/`number` | Y | — | — | 连接 |
| database | `string` | Y | — | 白名单 | 库 |
| tableWhitelist | `string[]` | Y | — | 非空 | 表白名单（DOC-01 §16.2） |
| columnWhitelist | `Record<table, string[]>` | Y | — | 非空 | 字段白名单 |
| accountRef | `SecretReference` | Y | — | 只读账号 | 凭证 |
| queryTimeoutMs | `number` | N | `20000` | >0 | 查询超时（DOC-07 §4.1） |
| resultLimit | `number` | N | `10000` | >0 | 结果上限 |
| parameterize | `boolean` | N | `true` | 恒真 | 参数化（禁止任意 SQL） |

### 4.5 SSH 采集配置（`collectionConfig.ssh`）

| 字段 | 类型 | 必填 | 默认 | 约束 | 消费 |
| ---- | ---- | ---- | ---- | ---- | ---- |
| host/port/user | `string`/`number`/`string` | Y | — | — | 连接 |
| knownHosts | `string[]`（或引用） | Y | — | 非空 | Host Key 校验（DOC-12 §7） |
| keyRef | `SecretReference` | Y | — | 不落明文 | 私钥/口令 |
| commandTemplateWhitelist | `string[]` | Y | — | 非空 | 命令模板白名单（DOC-07 §4.2） |
| paramWhitelist | `Record<template, string[]>` | Y | — | — | 参数白名单 |
| execTimeoutMs | `number` | N | `15000` | >0 | 执行超时 |
| outputLimitBytes | `number` | N | `1048576` | >0 | 输出长度限制 |

### 4.6 日志采集配置（`collectionConfig.log`）

| 字段 | 类型 | 必填 | 默认 | 约束 | 消费 |
| ---- | ---- | ---- | ---- | ---- | ---- |
| path | `string` | Y | — | — | 日志路径（DOC-01 §16.2） |
| parseRules | `ParseRule[]` | Y | — | 非空 | 解析规则 |
| multilinePattern | `string` | N | 无 | — | 多行堆栈（DOC-04 §7.4） |
| encoding | `string` | N | `utf-8` | — | 编码 |
| tailFrom | `'begin'\|'end'` | N | `end` | — | 起始 |

### 4.7 指标 / Baseline 配置（装载 `metric`/`baseline` 定义）

领域定义经定义文件或 `configRef` 装载，字段 Schema 见 DOC-06（`MetricDefinition`、`Baseline`），语义（指标 DSL / Baseline Spec）见 DOC-09。本文档规定：

1. `metric` 定义文件：`metrics/*.yml`，含 `metricId`、`name`、`target`、`type`、`unit`、采集方式、周期、聚合、窗口、数据质量、阈值/基线策略、租户与实例范围（DOC-01 §5.2）。
2. `baseline` 定义文件：`baselines/*.yml`，关联 `metricId`、版本（`DefinitionVersion`）；基线状态机/样本量/统计量算法权威见 DOC-09 §15。
3. 引用完整性：`metricId`/`baseline` 必须可解析；缺失则加载期失败。

### 4.8 Rule 配置（装载 `rule` 定义）

领域字段见 DOC-06 `RuleDefinition`。装载要求（DOC-01 §16.2「Rule 定义」）：

1. `rules/*.yml`：`ruleId`、`enabled`、输入指标引用（`metricId`@版本）、条件、阈值、严重度。
2. 指标引用版本固定（不随热更新漂移）；规则启用/禁用可热更新（DOC-04 §5）。

### 4.9 Risk 配置（装载 `risk` 定义）

领域字段见 DOC-06（RiskCycle、RiskSuppression、RiskRelation 等）。装载要求（DOC-01 §16.2「Risk 配置」）：

1. 默认抑制/优先级/关注策略；跨租户威胁关联启用的显式授权开关（DOC-12 §3.4）。
2. 历史事实（RiskEventHistory）不因热更新覆盖（ADR-007）。

### 4.10 Notification 配置（装载 `notification` 定义）

领域字段见 DOC-06（NotificationChannel 等）。装载要求（DOC-01 §16.2「Notification 配置」）：

1. 渠道类型（webhook/smtp/im）、`SecretReference`（凭证不落 YAML，DOC-12 §6.3）、模板、重试。
2. 重试参数回落到 `global.retry`（可覆盖）。

### 4.11 Report 配置（装载 `report` 定义）

领域字段见 DOC-06（Report 等）。装载要求（DOC-01 §16.2「Report 配置」）：

1. 生成计划、格式/模板、覆盖范围、保留周期引用 `retention.report`。

### 4.12 并发预算与保留周期

**并发预算（`concurrencyBudget`）**（DOC-01 §14.5 分层并发预算 + 背压；载体验证见 DOC-02 §8.3、DOC-04 §7.1）：

10 项均为**不同维度的独立上限**（编排层 / 业务层 / 公平层），并非从单一 global 池中切分，故不存在「各层之和 ≤ global」的约束。

| 字段 | 类型 | 必填 | 默认 | 约束 |
| ---- | ---- | ---- | ---- | ---- |
| globalTask | `number` | N | `8` | >0，全局 Task 上限 |
| workflow | `number` | N | `4` | >0，Workflow 上限 |
| workflowNode | `number` | N | `3` | >0，Workflow 节点上限 |
| collection | `number` | N | `3` | >0，Collection 上限（单源另受 perDataSourceCollection 约束） |
| metric | `number` | N | `2` | >0 |
| rule | `number` | N | `2` | >0 |
| notification | `number` | N | `2` | >0 |
| report | `number` | N | `1` | >0 |
| perTenantTask | `number` | N | `3` | ≤ globalTask，单租户 Task 上限（租户公平，防饿死） |
| perDataSourceCollection | `number` | N | `2` | ≤ collection，单数据源采集上限 |
| queueBacklog | `number` | N | 待压测 | 有限队列（背压）上限，取值以压测为准 |

> 默认值回源 DOC-01 §14.5，仅为初始建议（不构成容量承诺）；最终值以目标环境压测为准（DOC-01 TBD-002）。

**保留周期（`retention`）**（DOC-11 §4.3、DOC-13 §6.3）：

| 字段 | 类型 | 必填 | 默认 | 约束 |
| ---- | ---- | ---- | ---- | ---- |
| journal | `Duration` | N | `7d` | Journal 归档阈值 |
| log | `Duration` | N | `30d` | 业务日志保留 |
| metric | `Duration` | N | `90d` | 领域指标保留 |
| report | `Duration` | N | `90d` | 报告保留 |
| backup | `Duration` | N | `90d` | 备份保留 |

### 4.13 可观测与安全配置

**可观测（`observability`）**（DOC-13）：

| 字段 | 类型 | 必填 | 默认 | 约束 |
| ---- | ---- | ---- | ---- | ---- |
| traceSamplingRate | `number`(0~1) | N | `1.0` | 采样率（关键事件强制采样） |
| logSamplingRate | `number`(0~1) | N | `1.0` | 日志采样 |
| forcedSampleEvents | `string[]` | N | `error/alert/recovery/config/authorization` | 强制采样事件清单 |
| alertThresholds | `Record<string, number>` | N | `{}` | 告警阈值 |
| alertCooldown | `Duration` | N | `5m` | 告警去重窗口 |
| metricReportTarget | `string` | N | 无 | 指标上报目标 |

**安全（`security`，可选）**（DOC-12；Schema 校验含安全约束）：

| 字段 | 类型 | 必填 | 默认 | 约束 |
| ---- | ---- | ---- | ---- | ---- |
| maskingProfiles | `Record<entity, MaskingPolicy[]>` | N | 默认严格 | 脱敏策略引用 DOC-06 §6.11 |
| audit.enabled | `boolean` | N | `true` | fail-closed 要求恒真 |
| secretProvider | `string` | N | 平台默认 | Secret Provider 标识 |

## 5. 校验

### 5.1 Schema 校验

schemastery 负责：结构校验、类型校验、必填项校验、枚举取值、数值范围（DOC-01 §16.3）。合法但超出范围或格式不合法即拒绝加载。

### 5.2 业务校验与引用完整性

Schema 校验通过后执行业务校验（ADR-007「业务校验」）：

1. 引用完整性：`configRef`/`dataSourceId`/`metricId`/`ruleId`/`channelId`/`secretRef` 等必须指向已存在对象，缺失即失败。
2. 约束互斥：如 `schedule` 的 cron 与轮询互斥二选一。
3. 一致性：`perTenantTask ≤ globalTask`；`perDataSourceCollection ≤ collection`；`backoffMaxMs ≥ backoffBaseMs`。

### 5.3 安全约束校验

1. 认证凭据/密钥不得以明文出现在 YAML（只允许 `SecretReference`），违反即拒绝（DOC-01 §16.3「安全约束校验」、DOC-12 §6）。
2. 脱敏策略必须自洽；未知敏感字段默认最严删除（DOC-12 §5.3）。
3. 审计必须启用（`audit.enabled` fail-closed，DOC-12 §9.2）。

## 6. 不可变快照与版本管理

### 6.1 ConfigSnapshotRef

1. 校验/业务校验通过的配置生成**不可变快照**，分配 `ConfigSnapshotRef`（品牌化字符串，DOC-06）。
2. 快照不可原地修改；后续变更生成新快照 + 新引用。
3. `TenantContext.configSnapshotRef`、`ServerAgentRecord.configSnapshotRef` 等持有启动时快照引用（DOC-06 §4/§6），保证运行期可追溯所依据的配置版本。

### 6.2 版本演进

1. 配置 Schema 演进需版本化（ADR-007）；旧快照可被校验/解释或明确拒绝。
2. Schema 兼容性变更需提供迁移或缺省策略；不破坏已落盘的 `configSnapshotRef`（DOC-11 §6 恢复加载 LKG）。
3. 版本号变更遵循 DOC-06 `DefinitionVersion` 约定。

## 7. 热更新与生效

### 7.1 热更新流程

按 ADR-007、DOC-02 §7.5：

```
读取 → Schema 校验 → 业务校验 → 生成不可变快照 → 原子切换 → 记录审计
```

任何一步失败即中止，不影响当前生效配置。

### 7.2 失败回退 Last Known Good

1. 热更新失败时继续使用上次校验通过的 LKG 快照（ADR-007；DOC-11 §6.2 LKG 恢复加载）。
2. 回退事件记入审计与可观测（DOC-13 §8.2）。
3. 配置不可处于半切换状态：原子切换保证只读旧或新快照。

### 7.3 快照固定语义

1. 已启动的 Task/Workflow 继续使用启动时固定的配置快照（DOC-01 §16.4）。
2. 历史事实（RiskEvent、RiskEventHistory、Proposal History）不因后续热更新被覆盖（ADR-007）。
3. 权限相关变更（如规则启用/禁用）需区分「影响新任务」与「不影响在跑任务」，不得回写历史。

## 8. 秘密与敏感配置

1. 秘密项（MySQL 账号、SSH 私钥/口令、通知渠道凭证、PII 加盐密钥）一律 `SecretReference`，不落明文 YAML（DOC-12 §6）。
2. Secret 解析经 `SecretProviderPort`（DOC-07 §4.5）；日志不输出 secret 内容（DOC-13 §4.3）。
3. 样板 `secretProvider` 指定 Provider 标识；越权读取 secret 走审计（DOC-12 §9.1）。

## 9. 与下游文档边界

| 本文档输出 | 下游承接 |
| ---- | ---- |
| YAML Schema 与校验规则 | DOC-16（DSH 适配：插件 Config 装配与 schemastery 接线） |
| 配置/热更新/回退/LKG 测试矩阵 | DOC-15（测试与验收规格） |
| 配置目录、Secrets 目录、备份/保留落在部署 | DOC-17（部署设计规格） |
| 采样/告警阈值、重试/超时/保留的消费语义 | DOC-11/12/13（已规定，本文档定取值项） |

需求追踪：本文档落实 DOC-01 §16（配置）、§14.5（并发预算），承接 MOD-APP-001 Config（DOC-02 §4.3/§7.5）与 ADR-007；领域定义（Metric/Rule/Baseline/Risk/Notification/Report）字段引用 DOC-06（完整追踪表见 DOC-18）。

## 附录 A：版本与文档状态

| 版本 | 状态 | 说明 |
| ---- | ---- | ---- |
| V1.0-Baseline | Frozen | 冻结基线，开发启动依据 |

本文档已冻结，基线版本 `V1.0-Baseline`，作为开发启动依据。

**文档结束。**