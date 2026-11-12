# DSH 企业级风险监控 Agent V1 总体架构与模块设计

| 文档属性       | 内容                                       |
| -------------- | ------------------------------------------ |
| 文档编号       | DSH-RISK-ARCH-V1                           |
| 文档名称       | DSH 企业级风险监控 Agent V1 总体架构与模块设计 |
| 版本           | V1.0-Baseline                              |
| 文档状态       | 已冻结（Frozen）                            |
| 前置输入       | DOC-01（DSH-RISK-SRS-V1，V1.3-Review）；《V1 工程设计基线》§15（DSH 插件 API 核验结论） |
| 下一环节       | DOC-03（领域模型与状态机）、DOC-04（采集与编排）、DOC-05（端到端数据流）、DOC-06（DTO 与数据模型）、DOC-07（Ports 与 Repository 契约） |
| 适用范围       | DSH 风险监控 Agent V1 插件工程             |
| 技术基线       | DeepSeek Harness 工作树 live 源码（以源码核验为准） |
| 核验快照       | fcc0ad46（2026-11-04 核验时点，不构成基线锁定） |

## 1. 文档概述

### 1.1 编写目的

本文档定义 DSH 企业级风险监控 Agent V1 的总体架构、模块划分、模块职责与边界、模块依赖关系、DSH 集成架构、运行时与部署架构，以及横切关注点的架构级安排。

本文档是 DOC-03～DOC-07 的架构依据，也是开发启动前必须冻结的 P0 架构基线之一。

### 1.2 边界声明

本文档只描述"总体架构 + 模块设计"，不进入以下下游文档的职责范围：

| 主题 | 归属文档 |
| ---- | -------- |
| 领域模型（实体、值对象、聚合）与状态机（风险状态机、Proposal 状态机） | DOC-03 |
| Scheduler / Workflow / Task 的编排细节、Stage 依赖、失败策略 | DOC-04 |
| 端到端数据流（采集 → 标准化 → 指标 → 规则 → 风险 → 报告） | DOC-05 |
| DTO 与数据模型规格（字段级） | DOC-06 |
| Ports 与 Repository 契约（方法签名、语义） | DOC-07 |
| 架构决策记录（ADR）正文 | ADR-xxx（独立编号，贯穿全程） |

本文档引用上述文档，不重复其内容；仅在此处固化跨模块的架构事实（分层、模块清单、依赖规则、接缝）。

### 1.3 前置输入与依据

1. DOC-01《需求规格说明书》（V1.3-Review）：§3 架构要求、§7 数据采集与事件、§12 多租户与安全、§13 存储与事务、§14 运行时与并发、§15 错误与可观测、附录 A 核心设计原则。
2. 《V1 工程设计基线》（V1.0-Draft）：§2 总体架构、§3 工程目录、§5～§12 各能力架构、§15 DSH 插件 API 核验结论。
3. DeepSeek Harness 工作树 live 源码核验结论（以《工程设计基线》§15 为权威 API 依据；后续源码更新不视为自动变更基线）。

### 1.4 术语

本文档复用 DOC-01 §1.3 术语表；新增下列架构术语：

| 术语 | 定义 |
| ---- | ---- |
| Capability Seam | 能力接缝：由 Service Definition / Service Provider / Consumer 三种角色构成的一个完整能力边界 |
| Service Definition | 能力定义：声明能力契约（接口、协议、事件）的位置，不提供实现 |
| Service Provider | 能力提供者：实现 Service Definition 的具体方 |
| Consumer | 能力消费者：依赖并调用该能力的方 |
| Port | Application 层定义的外部能力接口（同 Service Definition 在 Application 侧的名称） |
| Adapter | Infrastructure 层对 Port 的具体适配实现（同 Service Provider 在 Infrastructure 侧的名称） |
| Composition Root | 唯一负责装配具体 Infrastructure 实现到 Port 上的位置 |
| ToolExecutionContext | 本设计自有类型，作为 Plugin/Application 边界 DTO，由 DSH 的 ToolRunContext 适配而来，两者不得混用 |
| ToolRunContext | DSH Tool Handler 第二参数（含 agent、signal），属 DSH 类型 |

## 2. 架构设计目标与原则

### 2.1 设计目标

1. 领域逻辑与 DSH Runtime、外部系统解耦，业务规则可独立测试。
2. 模块职责单一、边界清晰，模块间通过公开 `index.ts` API 通信。
3. 外部依赖全部通过 Port/Adapter 隔离，可替换、可测试、可隔离故障。
4. 安全与多租户约束在架构层内建，而非运行时追加。
5. 满足 V1 单进程、单实例、单插件、单 Agent 的运行约束，不引入不必要的分布式基础设施。

### 2.2 核心架构原则（承接 DOC-01 附录 A）

1. Agent-first；DSH 是底层 Agent Runtime。
2. V1 单 Agent、单插件、单进程、单实例。
3. 直接使用 DSH 原生 Tool Registry，不另建 MCP Tool Server，不自行实现 Tool Registry。
4. 四层架构，Domain 与 DSH 及 Infrastructure 解耦。
5. 事件不可变，源数据变化保留版本（SUPERSEDED）。
6. 数据质量与业务结果、采集状态分离（四套状态枚举独立）。
7. 风险事实（RiskEvent）、风险周期（RiskCycle）、攻击活动（AttackEvent）分离。
8. V1 只生成 Action Proposal，不执行真实动作。
9. 文件持久化不冒充 ACID 数据库；不承诺跨外部系统 exactly-once。
10. 所有租户数据访问具备可信租户约束。
11. 配置热更新不改变已启动任务固定的配置快照。
12. LLM 不作为最终风险判定和评分的唯一依据。

## 3. 总体架构

### 3.1 四层架构

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1  Plugin / Tools                                     │
│  DSH 插件入口 · Tool 注册 · 参数校验 · Context 适配 · 生命周期│
└──────────────────────────┬──────────────────────────────────┘
                           │ 调用 Use Case（Port 消费者）
┌──────────────────────────▼──────────────────────────────────┐
│  Layer 2  Application（用例编排层）                          │
│  采集编排 · 指标 · 规则 · 风险 · 报告 · 审计 · 运维          │
│  定义 Port（Service Definition）                              │
└──────────────┬────────────────────────────┬─────────────────┘
               │ 依赖 Domain                  │ Port 契约
┌──────────────▼────────┐      ┌─────────────▼────────────────┐
│  Layer 3  Domain       │      │  Layer 4  Infrastructure     │
│  租户/任务/采集/指标/  │      │  持久化/数据源/安全/备份/通知 │
│  规则/风险/证据/报告   │      │  （实现 Port，Adapter）        │
│  （纯领域，无外部依赖） │      │                              │
└────────────────────────┘      └──────────────────────────────┘
                 Composition Root（唯一装配点）
```

### 3.2 依赖方向规则

1. Plugin / Tools 调用 Application Use Case。
2. Application 依赖 Domain。
3. Application 定义所需 Port（Service Definition）。
4. Infrastructure 实现 Application Port（Service Provider/Adapter）。
5. Domain 不依赖 Infrastructure、Plugin 或 DSH。
6. Application 不依赖具体 Adapter（只依赖 Port 契约）。
7. Infrastructure 不反向依赖 Application Use Case。
8. Composition Root 是唯一负责装配具体 Infrastructure 实现的位置。
9. 跨模块能力一律通过公开模块入口（`index.ts`）暴露。

### 3.3 分层边界硬约束

1. 使用 DSH 原生 Tool Registry，不另建 MCP Tool Server。
2. Tool Handler 不直接访问 Repository。
3. DSH 相关 API 只出现在 Plugin Adapter。
4. DSH Runtime 对象（如 ToolRunContext）不得直接成为 Domain Model。
5. Tool Schema、Application DTO、Domain Model 三者分离（字段级规格见 DOC-06）。
6. ToolExecutionContext 作为 Plugin/Application 边界 DTO，由 ToolRunContext 适配而来，两者不得混用。
7. TenantContext 属于 Application/Security 边界，不直接使用 DSH Runtime identity 作为租户事实来源。

## 4. 模块划分总览

模块按层划分，使用 `MOD-*` 编号以便 RTM-02（需求与设计追踪）引用。物理目录结构与《工程设计基线》§3 对齐（仅 Domain 层 `MOD-DOM-*` 与 `src/domain/` 目录一一对应，其余层为逻辑分组、与物理目录非一一对应，本文档固化"模块"这一逻辑粒度）。

### 4.1 Plugin / Tools 层

| 模块编号 | 模块 | 职责 |
| -------- | ---- | ---- |
| MOD-PLG-001 | Plugin Entry | 插件入口（函数插件 `name/inject/Config/apply` 或服务类插件），启动装配与资源释放 |
| MOD-PLG-002 | Tool Registration | 通过 `ctx.tools.register(defineTool(...))` 注册九个模型工具，返回注销函数 |
| MOD-PLG-003 | DSH Adapter | `dsh-tool-adapter`（ToolRunContext → ToolExecutionContext 适配、Tool Response 映射、错误映射）、`dsh-context-adapter`（上下文建立） |
| MOD-PLG-004 | Composition Root | `container` / `dependency-registration` / `bootstrap`：唯一装配点 |
| MOD-TL-001～009 | Tool Handlers | 九个模型工具的 Handler，仅做入参校验 → 调用 Use Case → 转换返回 |

九个模型工具与 DOC-01 §6.1 一致：`collect_business_data / collect_system_metrics / collect_application_logs / calculate_metrics / evaluate_risk_rules / query_risks / manage_action_proposals / generate_risk_reports / get_monitor_health`。异步采集类（前三个）遵循"验证入参 → 建立可信上下文 → 创建并持久化 Task → 返回 taskId"，不占用 Tool Handler 同步执行。

### 4.2 Application 层（用例编排）

| 模块编号 | 模块 | 职责 |
| -------- | ---- | ---- |
| MOD-APP-001 | Config | 配置加载、校验、不可变快照、原子切换、版本与审计（Schema 见 DOC-14） |
| MOD-APP-002 | Task | Task 生命周期、并发/优先级、超时/取消、重试退避、Checkpoint、崩溃恢复、幂等执行 |
| MOD-APP-003 | Workflow | Stage、Stage 依赖、执行顺序、失败策略、流程状态、流程级 Checkpoint |
| MOD-APP-004 | Scheduler | 决定何时触发（触发决策与执行决策分离） |
| MOD-APP-005 | Collector | 采集用例编排、Collector Runner、采集事务（Collection Commit 三态）、检查点推进 |
| MOD-APP-006 | Metric | 指标计算编排、派生指标 DAG、维度治理、数据质量归因 |
| MOD-APP-007 | Baseline | 基线管理编排（Candidate/Active/Frozen、版本、样本量门槛） |
| MOD-APP-008 | Rule | 规则解析/校验/编译/评估编排，规则版本与求值语义 |
| MOD-APP-009 | Risk | 风险用例编排（触发/持续/恢复/评分），不直接指定状态（状态机在 DOC-03、由状态机引擎执行） |
| MOD-APP-010 | Evidence | 判定依据快照、Evidence 引用、不可无审计覆盖 |
| MOD-APP-011 | Proposal | Action Proposal 用例、版本与审批流程（七态状态机在 DOC-03） |
| MOD-APP-012 | Report | 报告生成（JSON/Markdown）、一致性级别、版本固定 |
| MOD-APP-013 | Notification | 通知/投递/尝试编排、至少一次投递、人工处理闭环 |
| MOD-APP-014 | Audit | 关键操作审计、fail-closed |
| MOD-APP-015 | Security | 安全上下文、脱敏编排、授权（Secret 由 Port 隔离） |
| MOD-APP-016 | Health | 插件健康、数据源健康、监控覆盖率聚合（TOOL-009） |
| MOD-APP-017 | Diagnostics | 主动诊断 |
| MOD-APP-018 | Observability | 结构化日志、Trace/Correlation ID、耗时与错误分类归因 |
| MOD-APP-019 | Resource | 资源配额、资源池、背压 |
| MOD-APP-020 | Resilience | Timeout / Backoff / Circuit Breaker / Bulkhead / Rate Limiter / Recovery Probe |
| MOD-APP-021 | Backup | 一致性备份编排 |
| MOD-APP-022 | Restore | 恢复编排 |
| MOD-APP-023 | Migration | 数据 Schema 迁移 |
| MOD-APP-024 | Upgrade | 插件版本升级与部署回滚 |
| MOD-APP-025 | Maintenance | 维护窗口编排（采集继续、抑制判定/升级/通知） |
| MOD-APP-026 | Retention | 过期数据保留策略，不删除活跃风险与未完成 Proposal |

### 4.3 Domain 层（纯领域）

| 模块编号 | 模块 | 职责 |
| -------- | ---- | ---- |
| MOD-DOM-001 | Tenant | 租户边界、租户身份、租户约束 |
| MOD-DOM-002 | Task | 任务领域模型、状态与约束 |
| MOD-DOM-003 | Workflow | 工作流领域模型 |
| MOD-DOM-004 | Schedule | 调度领域模型 |
| MOD-DOM-005 | Collector | 采集领域模型、CollectionStatus |
| MOD-DOM-006 | DataSource | 数据源领域模型（MySQL/SSH/Log） |
| MOD-DOM-007 | Metric | 指标领域模型（含 MetricType、DataQuality、Lineage） |
| MOD-DOM-008 | Rule | 规则领域模型（DSL/AST、版本） |
| MOD-DOM-009 | Risk | 风险领域模型（RiskEvent/RiskCycle/AttackEvent 分离、评分与等级分离） |
| MOD-DOM-010 | Evidence | 证据领域模型 |
| MOD-DOM-011 | Proposal | 行动建议领域模型（七态） |
| MOD-DOM-012 | Report | 报告领域模型（一致性级别） |
| MOD-DOM-013 | Audit | 审计领域模型 |
| MOD-DOM-014 | Notification | 通知领域模型（Notification/Delivery/Attempt 分离） |
| MOD-DOM-015 | Security | 安全领域模型（脱敏策略、敏感字段分类） |
| MOD-DOM-016 | Event | 事件领域模型（EventMetadata、TransactionEvent/LoginEvent/ApiAccessEvent、EventState） |

> 说明：Baseline 的领域归属按《工程设计基线》§7.2 归入 Metric 领域，不单列模块；风险关联对象（RiskEventHistory / RiskRelation / RiskEvidenceReference / RiskImpactScope / RiskSuppression / RiskEvaluationReference）的细化由 DOC-03 定义。

### 4.4 Infrastructure 层（Adapter 实现）

| 模块编号 | 模块 | 职责 |
| -------- | ---- | ---- |
| MOD-INF-001 | Persistence | JSON/JSONL 存储引擎、Repositories、Schema、原子替换、崩溃恢复 |
| MOD-INF-002 | DataSource-MySQL | 只读采集 Adapter（表字段白名单、参数化查询、增量游标） |
| MOD-INF-003 | DataSource-SSH | SSH 采集 Adapter（Host Key 校验、受控命令模板、超时） |
| MOD-INF-004 | DataSource-Logs | 日志采集 Adapter（offset、轮转、截断、多行） |
| MOD-INF-005 | Connection | 连接管理（MySQL/SSH 连接池与生命周期） |
| MOD-INF-006 | Security | Secret Provider、脱敏服务实现 |
| MOD-INF-007 | Backup / Restore / Migration | 运维能力的技术实现 |
| MOD-INF-008 | Notification | Webhook/SMTP/IM 渠道 Adapter 与 Secret 引用 |
| MOD-INF-009 | Observability | 日志、指标采集技术实现 |
| MOD-INF-010 | EventBus | 内部事件通知（仅通知，不代替 Repository 作为事实源） |
| MOD-INF-011 | Process | 进程级能力（文件锁、目录互斥、信号处理） |

### 4.5 Shared 层

| 模块编号 | 模块 | 职责 |
| -------- | ---- | ---- |
| MOD-SHR-001 | Types | 共享类型（品牌化 ID 等） |
| MOD-SHR-002 | Constants | 共享常量 |
| MOD-SHR-003 | Errors | 结构化错误类型（对齐 DOC-11） |
| MOD-SHR-004 | Utils | 零依赖工具（幂等 Hash、定点十进制序列化等） |

## 5. 模块依赖关系

### 5.1 依赖规则

1. 只允许高层依赖低层或同层：Tool → Application → Domain；Application → Port（由 Infrastructure 实现）。
2. Domain 不依赖任何其他层的具体实现（可依赖 Shared）。
3. Infrastructure 仅实现 Port，不依赖 Application Use Case、不依赖 Domain 之外的编排逻辑。
4. EventBus 只做内部通知；持久化事实源是 Repository，事件通知不得成为数据的唯一传播路径。
5. 任务/工作流启动时固定配置快照；RiskEvent、Proposal History 等历史事实不因配置热更新被覆盖。

### 5.2 依赖方向图

```
Tool Handlers ──► Application Use Cases ──► Domain
                       │
                       │ 依赖 Port 契约（Service Definition）
                       ▼
                  Infrastructure（Adapter 实现 Port）
                       │
                       └── 由 Composition Root 装配
```

### 5.3 模块依赖矩阵（摘要）

| 依赖方 \ 被依赖方 | Domain | Application | Infrastructure | Shared |
| ----------------- | ------ | ----------- | -------------- | ------ |
| Plugin / Tools    | ×      | ✓（Use Case） | ×（仅装配）| ✓ |
| Application       | ✓      | ✓（同层编排） | 仅 Port 契约 | ✓ |
| Domain            | ✓      | × | × | ✓ |
| Infrastructure    | ✓（实现 Port 所需的领域类型） | × | ✓ | ✓ |

> "×"表示禁止依赖；"仅 Port 契约"表示只依赖接口定义，不依赖具体 Adapter。

## 6. Capability Seam（能力接缝）

按 AGENTS.md 约定，每个外部/跨模块能力必须构成完整接缝（Service Definition / Service Provider / Consumer 三角色），不单落一个角色。主要接缝如下：

| 接缝 | Service Definition（Port） | Service Provider（Adapter） | Consumer |
| ---- | -------------------------- | --------------------------- | -------- |
| 持久化 | Repository 契约（DOC-07） | MOD-INF-001 JSON Persistence | Application Use Cases |
| MySQL 采集 | MySQL 采集 Port | MOD-INF-002 | MOD-APP-005 Collector |
| SSH 采集 | SSH 采集 Port | MOD-INF-003 | MOD-APP-005 Collector |
| 日志采集 | Log 采集 Port | MOD-INF-004 | MOD-APP-005 Collector |
| 通知投递 | Notification Port | MOD-INF-008 | MOD-APP-013 Notification |
| Secret | Secret Provider Port | MOD-INF-006 | 需要凭证的 Use Cases |
| 脱敏 | Masking Port | MOD-INF-006 | 采集/日志/报告/Evidence |
| 事件通知 | EventBus Port | MOD-INF-010 | 需要内部通知的 Use Cases |

每个接缝的字段级契约（方法签名、异常、幂等语义）由 DOC-07 定义；本文档只固化接缝清单与角色分配。

## 7. DSH 集成架构

### 7.1 插件模型（依据《工程设计基线》§15 核验结论）

- 插件入口采用函数插件：命名导出 `name` / `inject` / `Config` / `apply`，无 default export；或服务类插件 `export default class extends Service`。
- 生命周期：启动 = `apply` / `constructor` 执行；销毁 = `ctx.effect()` 返回的 disposer；监听 = `ctx.on()`（注册是副作用，必须经 `ctx.effect()`/`ctx.on()`）。
- 依赖注入：`inject` 声明强依赖；可选依赖 `ctx.get(name)`；子 fiber `ctx.inject([...], fn)`。

### 7.2 Tool 注册

- `ctx.tools.register(defineTool({ ... }), options?)`，注入 `inject = ['tools']`，返回注销 disposer。
- `defineTool({ name, description, parameters, output: { schema, render }, execute(args, exec), ... })`。
- 九个模型工具逐一注册，Handler 只做"入参校验 → 建立可信上下文 → 调用 Use Case → 转换返回"。

### 7.3 Context 适配边界

- DSH Handler 第二参数 `exec` 类型为 `ToolRunContext`（含 `agent`、`signal`），无 `ToolExecutionContext` 类型。
- `dsh-context-adapter` 将 `ToolRunContext` 映射为本设计自有类型 `ToolExecutionContext`（Plugin/Application 边界 DTO），二者不得混用。
- `tenantId` 不得直接信任模型传入值：由可信 Application/Security 边界建立 `TenantContext`，Tool 参数中的 `tenantId` 仅作范围提示，最终以可信上下文为准。

### 7.4 Tool Response 与错误映射

- Tool 输出结构化数据与模型可见内容分离（`output.schema` 与 `output.render`）。
- 错误分层：Infrastructure 原始异常 → Application Error → Use Case 处理 → Plugin Adapter 映射 DSH Response（错误分类见 DOC-11 §3；具体映射由 DOC-16 定义）。
- Domain 不依赖 DSH 错误类型。

### 7.5 配置

- `export interface Config` + `export const Config: z<Config> = z.object({...})`（`z = Schema`，来自 `@deepseek-ai/schemastery`）。
- 配置热更新按 DOC-01 §14.4：读取 → 校验 → 不可变快照 → 原子切换 → 失败回退 Last Known Good → 审计；已启动 Task/Workflow 继续使用启动时快照。

### 7.6 插件包与 resolver

- 插件包 = `src/index.ts` + `package.json`。
- 裸插件名必须出现在 resolver manifest 的 `dependencies` 中（`verify-cordis-config` 校验）；插件一级入口为 ESM。

## 8. 运行时与进程模型

### 8.1 运行形态

单进程、单实例、单插件、单 Agent，模块化运行。无多实例、无分布式、无独立 Web UI、无独立 Java 平台。

### 8.2 生命周期

启动初始化 → 配置加载 → 依赖装配 → 持久化恢复 → Tool 注册 → 对外开放 → 正常运行 → 优雅关闭 → 资源释放。恢复完成后再开放相关业务 Tool。

### 8.3 并发预算

采用分层并发预算、有限队列、租户公平调度和背压。初始建议值（不构成容量承诺，最终值以压测为准，DOC-01 TBD-002）：

| 项目 | 建议并发 |
| ---- | -------- |
| 全局 Task | 8 |
| Workflow | 4 |
| Workflow 节点 | 3 |
| Collection | 3 |
| Metric | 2 |
| Rule | 2 |
| Notification | 2 |
| Report | 1 |
| 单租户 Task | 3 |
| 单数据源采集 | 2 |

### 8.4 取消与超时

协作式取消：执行体配合 `AbortSignal` 在检查点自行退出并释放资源，不承诺强杀。区分 UNKNOWN / Timeout / Cancellation。取消验收断言：取消请求发出后 5 秒内执行体停止推进检查点并释放资源（供应商能力与 DSH 一致性见 DOC-16）。

## 9. 部署架构

### 9.1 部署形态

- Linux 直接部署。
- Docker 部署。

### 9.2 运行目录

区分：配置目录、数据目录、日志目录、临时目录、备份目录、Secrets 目录。数据目录按租户分区（`data/tenants/{tenantId}/...`）。Secrets 不落 YAML，走 Secret 机制。

### 9.3 运行权限

运行账号遵循最小权限；SSH、MySQL、文件访问权限分别控制。

## 10. 横切架构关注点

以下关注点贯穿各模块，此处固化架构级安排，字段/契约级细节交由下游文档：

| 关注点 | 架构安排 | 细化归属 |
| ------ | -------- | -------- |
| 多租户隔离 | 租户是隔离基本边界；Repository 不提供无租户约束的通用入口；跨租户访问显式授权+审计 | DOC-07 / DOC-12 |
| 错误处理 | 分层错误、结构化失败、业务结果与错误/数据质量分离 | DOC-11 |
| 幂等 | 幂等键（租户+数据源+表+主键+源版本）→ 确定性 Hash；同 Hash 返回原结果、不同 Hash 拒绝冲突 | DOC-05 / DOC-11 |
| 事件不可变 | 事件不可原地修改；源版本变化产生新版本并标记 SUPERSEDED | DOC-03 / DOC-05 |
| 事务与持久化 | PersistenceTransactionCoordinator 协调文件持久化；非 ACID；Journal/Outbox/Inbox | DOC-11 |
| 可观测性 | 结构化日志、Trace/Correlation ID、Task/Workflow ID、Tenant ID（脱敏）、错误分类 | DOC-13 |
| 配置 | YAML + Schema 校验 + 版本 + 原子切换 + 失败回滚 | DOC-14 |
| 安全与脱敏 | 认证/授权分离、Secret Provider、Data Masking Service 统一脱敏、Audit 与 App Log 分离 | DOC-12 |

## 11. 架构决策记录（ADR 映射）

本文档对应的架构决策由 ADR 独立编号记录（贯穿全程，P0）。计划建立的决策记录与本文档章节映射如下：

| ADR | 决策主题 | 本文档对应 |
| --- | -------- | ---------- |
| ADR-001 | DSH Runtime 与单插件架构 | §7 |
| ADR-002 | 四层架构和依赖规则 | §3 |
| ADR-003 | 单 Agent、单插件、模块化 | §8 |
| ADR-004 | DSH 原生 Tool Registry | §7.2 |
| ADR-005 | Task / Workflow / Scheduler 分离 | §4.2 |
| ADR-006 | JSON 持久化与 Storage Engine | §10 |
| ADR-007 | YAML 配置和热更新 | §7.5 / §10 |
| ADR-008 | 多租户和安全边界 | §10 |
| ADR-009 | Risk 与 Action Proposal 分离 | §4.2 / §4.3 |
| ADR-010 | V1 不执行真实风险动作 | §2.2 / §4.2 |

ADR 正文记录于《DSH 企业级风险监控 Agent V1 架构决策记录（ADR）.md》（`docs/nbs/`），本文档不展开正文。

## 12. 与下游文档的追踪关系

| 本文档输出 | 下游承接 |
| ---------- | -------- |
| 分层与依赖规则、模块清单、接缝 | DOC-06（DTO/数据模型）、DOC-07（Ports/Repository 契约） |
| 领域模块清单（Risk/Proposal 等） | DOC-03（领域模型与状态机） |
| 采集/任务/工作流/调度模块划分 | DOC-04（采集与编排） |
| 采集 → 标准化 → 指标 → 规则 → 风险 → 报告流向 | DOC-05（端到端数据流） |
| 错误/事务/幂等/恢复架构 | DOC-11 |
| 安全/多租户架构 | DOC-12 |
| 可观测架构 | DOC-13 |
| 配置架构 | DOC-14 |
| DSH 集成架构 | DOC-16 |

模块编号（`MOD-*`）供 RTM-02（需求与设计追踪）引用；业务需求（BR-001～003、SYS-MON-001～008、TOOL-001～009）应能追踪到对应模块（总追踪表见 DOC-18）。

## 附录 A：模块缩写速查

| 层 | 缩写 | 全称 |
| -- | ---- | ---- |
| Plugin / Tools | PLG / TL | Plugin / Tool |
| Application | APP | Application Use Case |
| Domain | DOM | Domain Model |
| Infrastructure | INF | Infrastructure Adapter |
| Shared | SHR | Shared Utility |

## 附录 B：版本与文档状态

| 版本 | 状态 | 说明 |
| ---- | ---- | ---- |
| V1.0-Baseline | Frozen | 冻结基线，开发启动依据 |

本文档已冻结，基线版本 `V1.0-Baseline`，作为开发启动依据。

**文档结束。**