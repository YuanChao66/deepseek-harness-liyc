好的，我们进入正式的 V1 工程设计基线编制阶段。

这次不再继续增加设计问卷，也不重新讨论已经确认的架构决策，而是把前面 282 个问题和五轮架构审查的结果整合成一份工程实施基线。

考虑到你之前明确选择了直接开发 DSH TypeScript 插件，而不是额外建设 Java 工程，文档将以 TypeScript 插件项目为核心。

# DSH 企业级风险监控 Agent V1 工程设计基线

版本：V1.0-Baseline · 架构状态：已冻结 · DSH API：工作树 live 源码已核验

## 1. 项目定位

### 1.1 建设目标

基于 DeepSeek Harness（DSH）构建一个企业级风险监控 Agent，实现两类监控：

- 业务风险监控：客户交易异常、登录失败、API 调用异常、账户风险等。
- 系统运行监控：Java、Tomcat、Redis、MySQL、Nginx、Apache、Docker、ZooKeeper 等组件的运行状态和性能指标。

Agent 负责数据采集、指标计算、规则评估、风险识别、报告生成和处理建议。

V1 不直接执行拦截、限流或其他业务操作，只生成 Action Proposal。

### 1.2 V1 技术决策

| 项目           | 确定方案               |
| -------------- | ---------------------- |
| Agent Runtime  | DeepSeek Harness       |
| DSH 技术基线   | 工作树 live 源码（以源码核验为准） |
| 核验快照       | fcc0ad46（2026-11-04 核验时点，不构成基线锁定） |
| 开发语言       | TypeScript             |
| 部署形态       | 单进程、单插件         |
| Agent 数量     | 单 Agent               |
| Tool 注册      | DSH 原生 Tool Registry |
| 数据采集       | SSH、MySQL、日志读取   |
| 数据存储       | JSON 文件              |
| 配置格式       | YAML                   |
| 报告格式       | JSON、Markdown         |
| 消息队列       | V1 不使用 Kafka        |
| Web UI         | 不建设                 |
| 独立 Java 平台 | 不建设                 |

## 2. 总体架构

采用四层架构。

第一层：Plugin / Tools

DSH 插件入口、Tool 注册、参数校验、Context 适配、启动与资源释放。

第二层：Application

用例编排、任务调度、数据采集、指标计算、风险评估、Proposal、报告、审计和运维。

第三层：Domain

租户、任务、采集、指标、规则、风险、证据、Proposal、报告等领域模型和业务约束。

第四层：Infrastructure

JSON 持久化、MySQL/SSH/Log Adapter、文件操作、安全、备份、通知和可观测性技术实现。

依赖方向：

```
Plugin / Tools
      │
      ▼
Application
      │
      ▼
Domain

Infrastructure ── 实现 Application 定义的 Port
      │
      └── 由 Plugin Composition Root 装配
```

核心约束：

1. Domain 不依赖 Infrastructure 和 DSH。
2. Application 不直接依赖具体 Adapter。
3. Tool Handler 不直接访问 Repository。
4. Infrastructure 不反向依赖 Application Use Case。
5. Composition Root 是唯一负责装配具体 Infrastructure 实现的位置。
6. 模块之间通过公开 `index.ts` API 通信。

## 3. 最终工程目录结构

下面是建议冻结的 V1 目录结构。它是内部工程结构基线，DSH 插件入口与 Tool API 已按工作树 live 源码核验（见 §15）。

```
dsh-risk-agent/
│
├── src/
│   │
│   ├── plugin/
│   │   ├── adapter/
│   │   │   ├── dsh-tool-adapter.ts
│   │   │   ├── dsh-context-adapter.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── registration/
│   │   │   ├── tool-registration.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── composition/
│   │   │   ├── container.ts
│   │   │   ├── dependency-registration.ts
│   │   │   ├── bootstrap.ts
│   │   │   └── index.ts
│   │   │
│   │   └── index.ts
│   │
│   ├── tools/
│   │   ├── collect-business-data/
│   │   ├── collect-system-metrics/
│   │   ├── collect-application-logs/
│   │   ├── calculate-metrics/
│   │   ├── evaluate-risk-rules/
│   │   ├── query-risks/
│   │   ├── manage-action-proposals/
│   │   ├── generate-risk-reports/
│   │   ├── get-monitor-health/
│   │   └── index.ts
│   │
│   ├── application/
│   │   ├── config/
│   │   ├── task/
│   │   ├── workflow/
│   │   ├── scheduler/
│   │   ├── collector/
│   │   ├── metric/
│   │   ├── baseline/
│   │   ├── rule/
│   │   ├── risk/
│   │   ├── evidence/
│   │   ├── proposal/
│   │   ├── report/
│   │   ├── audit/
│   │   ├── notification/
│   │   ├── backup/
│   │   ├── restore/
│   │   ├── migration/
│   │   ├── upgrade/
│   │   ├── maintenance/
│   │   ├── retention/
│   │   ├── resource/
│   │   ├── resilience/
│   │   ├── security/
│   │   ├── health/
│   │   ├── diagnostics/
│   │   ├── observability/
│   │   └── index.ts
│   │
│   ├── domain/
│   │   ├── tenant/
│   │   ├── task/
│   │   ├── workflow/
│   │   ├── schedule/
│   │   ├── collector/
│   │   ├── datasource/
│   │   ├── event/
│   │   ├── metric/
│   │   ├── rule/
│   │   ├── risk/
│   │   ├── evidence/
│   │   ├── proposal/
│   │   ├── report/
│   │   ├── audit/
│   │   ├── notification/
│   │   ├── security/
│   │   └── index.ts
│   │
│   ├── infrastructure/
│   │   ├── persistence/
│   │   │   ├── storage/
│   │   │   ├── json/
│   │   │   ├── repositories/
│   │   │   └── schema/
│   │   │
│   │   ├── datasource/
│   │   │   ├── mysql/
│   │   │   ├── ssh/
│   │   │   └── logs/
│   │   │
│   │   ├── connection/
│   │   ├── security/
│   │   ├── backup/
│   │   ├── restore/
│   │   ├── migration/
│   │   ├── notification/
│   │   ├── observability/
│   │   ├── event-bus/
│   │   ├── process/
│   │   └── index.ts
│   │
│   └── shared/
│       ├── types/
│       ├── constants/
│       ├── errors/
│       ├── utils/
│       └── index.ts
│
├── config/
│   ├── agent.yaml
│   ├── tenants/
│   ├── datasources/
│   ├── metrics/
│   ├── rules/
│   └── workflows/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── architecture/
│   ├── contract/
│   └── acceptance/
│
├── scripts/
│
├── docs/
│   ├── architecture/
│   ├── decisions/
│   ├── development/
│   └── deployment/
│
├── data/
├── state/
├── logs/
├── reports/
├── backups/
├── secrets/
├── tmp/
│
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── eslint.config.js
├── vitest.config.ts
├── .gitignore
└── README.md
```

注意：`data/`、`state/`、`logs/` 等是运行目录，不属于源码构建产物；部署时应与 `dist/` 和依赖包分离。

## 4. 九个 Tool 的工程接口

Tool 层只负责接收参数、调用 Application Use Case、转换返回结果。

| Tool                     | 输入重点               | 返回重点          |
| ------------------------ | ---------------------- | ----------------- |
| collect_business_data    | 数据源、租户、采集范围 | taskId、status    |
| collect_system_metrics   | 主机、组件、指标范围   | taskId、status    |
| collect_application_logs | 日志源、时间范围       | taskId、status    |
| calculate_metrics        | 指标定义、时间窗口     | 计算结果          |
| evaluate_risk_rules      | 规则范围、评估窗口     | 风险评估结果      |
| query_risks              | 风险条件、分页参数     | 风险状态、历史    |
| manage_action_proposals  | Proposal ID、操作类型  | 当前状态          |
| generate_risk_reports    | 报告类型、时间范围     | 报告 ID、文件位置 |
| get_monitor_health       | 组件、数据源范围       | 健康状态          |

所有 Tool 都需要经过统一的安全上下文处理。

对于异步采集：

```
Tool Request
    │
    ▼
Validate Input
    │
    ▼
Build Trusted Context
    │
    ▼
Create Task
    │
    ▼
Persist Task
    │
    ▼
Return taskId
```

不能让长时间采集任务占用 Tool Handler 的同步执行过程。

## 5. 任务与 Workflow 架构

三个模块严格分离：

| 模块            | 职责                               |
| --------------- | ---------------------------------- |
| Scheduler       | 决定何时触发                       |
| Workflow Engine | 决定执行哪些 Stage、顺序和依赖     |
| Task Engine     | 管理单个 Task 的生命周期和执行策略 |

Task Engine 管理：

- 状态机。
- 并发和优先级。
- 超时与取消。
- 重试和退避。
- TaskRecord。
- Checkpoint。
- 崩溃恢复。
- 幂等执行。

Workflow Engine 管理：

- Stage。
- Stage 依赖。
- 执行顺序。
- 失败策略。
- 流程状态。
- 流程级 Checkpoint。

Collector Runner 负责实际 Collector 执行，Collector 本身不管理任务生命周期。

EventBus 只负责内部通知，不承担可靠消息队列职责。Repository 才是持久化事实来源。

## 6. 数据采集架构

V1 采集三类数据：

| 采集类型 | Adapter       | 访问方式     |
| -------- | ------------- | ------------ |
| 业务数据 | MySQL Adapter | 只读连接     |
| 系统指标 | SSH Adapter   | 受控命令     |
| 应用日志 | Log Adapter   | 远程文件读取 |

### 6.1 MySQL 安全要求

- 独立只读账号。
- 表和字段 Allowlist。
- 参数化查询。
- 查询超时。
- 结果数量限制。
- 禁止任意 SQL。
- 增量 Cursor 和 Checkpoint。
- 多租户数据隔离。

### 6.2 SSH 安全要求

- SSH Key 认证。
- Host Fingerprint 校验。
- 低权限账号。
- 命令模板 Allowlist。
- 禁止模型直接生成并执行任意 Shell。
- 设置连接超时和命令执行超时。

### 6.3 日志采集

使用已经确定的日志格式：

```
%d %X{_traceId}:%X{_subjectId} %contextName %p %t %c{40} %M %L: %m%n
```

其中 `_subjectId` 表示登录用户 ID。

日志采集需要处理：

- 增量 offset。
- 文件 identity。
- 日志轮转。
- 文件重命名。
- 文件截断。
- 重启恢复。
- 多行日志。
- 敏感字段脱敏。

## 7. 指标、规则与风险架构

### 7.1 系统指标

| 组件      | V1 指标                                           |
| --------- | ------------------------------------------------- |
| Java      | CPU、Heap、OldGen、GC、Thread、QPS、Error         |
| Tomcat    | Thread Pool、Connections、QPS、ResponseTime、5xx  |
| Redis     | Memory、QPS、HitRate、Connections、SlowLog        |
| MySQL     | CPU、Connections、SlowSQL、Lock、QPS、Replication |
| Nginx     | QPS、4xx、5xx、ResponseTime、Connections          |
| Docker    | Container Status、CPU、Memory、Restart            |
| ZooKeeper | Connections、Session、Latency、Znode              |
| Apache    | QPS、Connection、ResponseTime、5xx                |

### 7.2 指标和规则

Metric DSL 与 Rule DSL 独立。

两套处理流程分别是：

```
Metric DSL
    ↓
Parser
    ↓
Validator
    ↓
Compiler
    ↓
Metric Evaluator
Rule DSL
    ↓
Parser
    ↓
Validator
    ↓
Compiler
    ↓
Rule Evaluator
```

Baseline Engine 独立于普通 Metric Engine，但领域模型归属 Metric。

### 7.3 风险状态

风险状态：

```
Pending
  ↓
Normal
  ↓
Triggered
  ↓
Ongoing
  ↓
Recovered
```

`Unknown` 是独立状态，不代表风险已经恢复。

风险身份：

```
tenantId + ruleId + businessObjectId
```

恢复后重新触发，应创建新的 Risk Cycle，而不是覆盖过去的风险事件。

## 8. Action Proposal

V1 不允许 Agent 直接执行风险处置。

Proposal 状态（七态）：

- GENERATED：已生成。
- PENDING_REVIEW：待审批。
- APPROVED：已审批通过。
- REJECTED：已否决。
- WITHDRAWN：已撤回。
- EXPIRED：已过期。
- SUPERSEDED：已被新版本取代。

状态转换：GENERATED 可转 PENDING_REVIEW / WITHDRAWN / SUPERSEDED；PENDING_REVIEW 可转 APPROVED / REJECTED / WITHDRAWN / EXPIRED / SUPERSEDED；APPROVED、REJECTED 可追加新版本转 SUPERSEDED。REJECTED、EXPIRED、WITHDRAWN、SUPERSEDED 为终态，不再转换；任何状态不得回退到 GENERATED 或 PENDING_REVIEW；已 APPROVED 的 Proposal 不得 WITHDRAWN。

Proposal 使用结构化 DSL 描述建议动作。

禁止将 SQL、Shell、Java 代码或任意可执行表达式作为 Proposal 内容直接执行。

Proposal 必须关联：

- Tenant。
- Risk ID。
- Rule ID。
- Rule Version。
- Evidence。
- 创建时间。
- 审批记录。
- 状态变更历史。

## 9. 配置管理与持久化

### 9.1 配置

YAML 是主要配置格式。

配置变更流程：

```
读取 YAML
   ↓
解析
   ↓
Schema 校验
   ↓
业务校验
   ↓
生成配置版本
   ↓
构建新配置快照
   ↓
原子切换
   ↓
记录审计
```

失败时继续使用 Last Known Good 配置。

已经运行的 Task 使用启动时固定的配置版本。

### 9.2 JSON 持久化

采用：

- 单写者模型。
- 临时文件。
- Flush / Sync。
- 原子替换。
- 完整性校验。
- 必要的文件锁。
- Append-only History。

实际原子替换和同步语义需要在目标操作系统及文件系统上验证。

### 9.3 数据分区

```
data/
├── tenants/
│   └── {tenantId}/
│       ├── tasks/
│       ├── metrics/
│       ├── risks/
│       ├── proposals/
│       ├── reports/
│       └── audit/
```

配置、Secrets、业务数据、日志和备份必须进行权限隔离。

Secrets 不应明文写入 YAML。

## 10. 安全、审计和多租户

关键安全规则：

1. TenantContext 只能由可信入口创建。
2. 模型参数不能伪造租户身份。
3. Authentication 和 Authorization 分离。
4. 每个 Repository 操作必须明确租户范围。
5. Adapter 在资源访问边界再次进行权限检查。
6. Secret Provider 独立。
7. Data Masking Service 统一脱敏。
8. Audit 和 Application Log 分离。

关键操作审计失败时采用 fail-closed 策略。

审计范围包括：

- 身份和权限变化。
- 配置变化。
- 数据采集。
- 风险触发和恢复。
- Proposal 创建和审批。
- 安全策略拒绝。
- 系统维护操作。

## 11. 备份、恢复、迁移与升级

四个能力相互独立：

| 模块      | 职责                   |
| --------- | ---------------------- |
| Backup    | 创建一致性备份         |
| Restore   | 恢复数据               |
| Migration | 数据 Schema 迁移       |
| Upgrade   | 插件版本升级和部署回滚 |

维护操作必须互斥。

恢复和迁移前需要备份；失败时保留可恢复状态。

Retention Manager 统一管理过期数据，但不能删除活跃风险、未完成 Proposal 和有效 Checkpoint。

## 12. Health、Diagnostics、Resource、Resilience

必须区分：

- Plugin Health：插件自身运行状态。
- DataSource Health：外部数据源状态。
- Diagnostics：主动诊断。
- Metrics Registry：插件自身运行指标。
- Metric Engine：业务和系统指标计算。

Resource Manager 管资源配额、资源池和释放。

Resilience Manager 提供：

- Timeout。
- Backoff。
- Circuit Breaker。
- Bulkhead。
- Rate Limiter。
- Recovery Probe。

Task Engine 决定任务是否重试，Resilience Manager 提供弹性策略。

关键风险监控任务优先于报告和清理任务。

## 13. 测试与生产验收

测试目录：

```
tests/
├── unit/
├── integration/
├── architecture/
├── contract/
└── acceptance/
```

生产验收至少包括：

| 测试项      | 验收重点                      |
| ----------- | ----------------------------- |
| 插件启动    | 正确加载、注册和停止          |
| Tool        | 九个 Tool 注册及调用正确      |
| MySQL       | 只读、增量、超时和数据隔离    |
| SSH         | Host 校验、命令限制、失败处理 |
| 日志        | 增量、轮转、恢复              |
| Metric      | 指标计算准确                  |
| Rule        | 复杂表达式和组合规则          |
| Risk        | 触发、持续、恢复、重新触发    |
| Proposal    | 状态变更和审批审计            |
| Persistence | 崩溃恢复和数据完整性          |
| Security    | 越权、跨租户访问、Secret 泄漏 |
| Resource    | 并发限制和资源释放            |
| Backup      | 备份恢复和一致性验证          |
| Performance | 中等规模部署容量测试          |

## 14. 发布与部署

发布流程：

```
Build
  ↓
Test
  ↓
Package
  ↓
Validate
  ↓
Backup
  ↓
Deploy
  ↓
Health Check
  ↓
Success / Rollback
```

依赖版本固定并提交 Lockfile。

插件版本、配置 Schema 版本、数据 Schema 版本独立管理。

## 15. DSH 插件 API 核验结论

基于工作树 live 源码核验（核验快照 fcc0ad46，2026-11-04 核验时点，不构成基线锁定），DSH 插件开发 API 结论如下：

| 核验项目 | 核验结论 |
| --- | --- |
| 插件入口与导出 | 函数插件：命名导出 `name` / `inject` / `Config` / `apply`，无 default export；服务类插件：`export default class extends Service` |
| Tool Registry API | `ctx.tools.register(defineTool({...}), options?)`，注入 `inject = ['tools']`，返回 unregister disposer |
| Tool Schema 格式 | `defineTool({ name, description, parameters, output:{schema,render}, execute(args, exec), ... })` |
| Tool Handler Context | `execute` 第二参数 `exec` 类型为 `ToolRunContext`（含 `agent`、`signal`），无 `ToolExecutionContext` 类型 |
| 插件生命周期 | 无 start/stop 钩子；启动 = `apply`/`constructor` 执行，销毁 = `ctx.effect()` disposer，监听 = `ctx.on()` |
| 配置 Schema | `export interface Config` + `export const Config: z<Config> = z.object({...})`，`z = Schema`（`@deepseek-ai/schemastery`） |
| 依赖注入 | `inject` 声明强依赖；可选依赖 `ctx.get(name)`；`ctx.inject([...], fn)` 启动子 fiber |
| 插件包承载 | 插件包 = `src/index.ts` + `package.json`；cordis.yml 属 bundle 包；resolver manifest `dependencies` 必须列出裸插件名 |

本核验取代此前「v0.2.1-rc.5 + b830ec9」固定 Commit 基线，作为 DOC-02 架构设计的权威 API 依据。

关键源码位置：`packages/core/tools/src/schema.ts`（defineTool）、`packages/core/tools/src/index.ts`（ToolsService/register）、`vendor/cordis/src/registry.ts`（Plugin/Inject）、`vendor/cordis/src/reflect.ts`（provide/get）、`scripts/verify-cordis-config.ts`（裸插件 dependencies 校验）。

## 16. 架构决策冻结原则

后续设计变更采用 ADR（Architecture Decision Record）管理。

建议先建立这些决策记录：

| ADR     | 决策主题                       |
| ------- | ------------------------------ |
| ADR-001 | DSH Runtime 与单插件架构       |
| ADR-002 | 四层架构和依赖规则             |
| ADR-003 | 单 Agent、单插件、模块化       |
| ADR-004 | DSH 原生 Tool Registry         |
| ADR-005 | Task、Workflow、Scheduler 分离 |
| ADR-006 | JSON 持久化与 Storage Engine   |
| ADR-007 | YAML 配置和热更新              |
| ADR-008 | 多租户和安全边界               |
| ADR-009 | Risk 与 Action Proposal        |
| ADR-010 | V1 不执行真实风险动作          |
| ADR-011 | 九类结构化错误与分层错误处理   |
| ADR-012 | Journal / Outbox / Inbox 局部事务协调 |
| ADR-013 | 双 Hash 幂等语义               |
| ADR-014 | 确定性崩溃恢复与故障注入验收   |
| ADR-015 | 分层可观测与 Trace / Correlation 归因 |

最终基线状态：

- 内部架构：可以冻结。
- 工程目录：可以冻结。
- V1 功能范围：可以冻结。
- DSH 插件适配：已按工作树 live 源码核验，可以冻结。

这份内容建立了 V1 工程设计的总体基线。DSH 插件 API 已完成源码核验（见 §15），下一阶段进入 DOC-02 总体架构与模块设计编制，随后进入工程初始化、依赖安装、插件入口和第一个 Tool 的最小闭环验证。