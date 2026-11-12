# DSH 企业级风险监控 Agent V1 采集与编排设计（Scheduler/Workflow/Task）

| 文档属性 | 内容 |
| -------------- | ------------------------------------------ |
| 文档编号 | DSH-RISK-ORCH-V1 |
| 文档名称 | DSH 企业级风险监控 Agent V1 采集与编排设计（Scheduler/Workflow/Task） |
| 版本 | V1.0-Baseline |
| 文档状态 | 已冻结（Frozen） |
| 前置输入 | DOC-01（V1.3-Review）；DOC-02（总体架构与模块设计）；DOC-03（领域模型与状态机设计） |
| 下一环节 | DOC-05（端到端数据流）、DOC-06（DTO 与数据模型）、DOC-07（Ports 与 Repository 契约） |
| 适用范围 | DSH 风险监控 Agent V1 插件工程 |
| 技术基线 | DeepSeek Harness 工作树 live 源码（以源码核验为准） |

## 1. 文档概述

### 1.1 编写目的

本文档定义采集子系统与任务编排子系统的设计：Scheduler（触发决策）、Workflow Engine（Stage 编排）、Task Engine（任务生命周期与执行策略）三者分离的协作方式，采集模式、采集事务（Collection Commit 三态）、Checkpoint 管理，以及上述对象的执行状态机与并发/取消/重试/幂等/恢复机制。

### 1.2 边界声明

| 主题 | 归属 |
| ---- | ---- |
| Scheduler/Workflow/Task 编排与状态机 | 本文档 |
| 采集模式、Collection Commit、Checkpoint | 本文档 |
| 端到端数据流（标准化→指标→规则→风险→报告） | DOC-05 |
| 编排对象字段级 DTO | DOC-06 |
| Repository / 采集 Port 方法签名 | DOC-07 |
| 三类数据源适配实现细节 | DOC-06 / DOC-07（契约）；DOC-16（DSH 集成） |

### 1.3 前置输入与依据

DOC-01 §6（工具）、§7（数据采集与事件处理）、§14（运行时与并发）；DOC-02 §4.2（APP-002/003/004/005）、§8（运行时）；DOC-03 §4.2、§7.3（采集/任务/事件状态值域登记）。

## 2. 设计目标与原则

1. **三引擎分离**：Scheduler 决定"何时触发"、Workflow Engine 决定"执行哪些 Stage、顺序与依赖"、Task Engine 管理"单个 Task 的生命周期与执行策略"，互不耦合，可独立替换（见 ADR-005）。
2. **异步采集不占用 Tool Handler**：采集类工具"验证入参 → 建立可信上下文 → 创建并持久化 Task → 返回 taskId"，长时间采集由后台执行。
3. **检查点仅在数据持久化确认后推进**：采集提交遵循 `PREPARED / DATA_PERSISTED / COMMITTED` 三态。
4. **协作式取消**：执行体配合 `AbortSignal` 在检查点退出并释放资源，不承诺强杀。
5. **持久化是事实源**：EventBus 只做内部通知，不代替 Repository；任务/工作流启动时固定配置快照。

## 3. 采集与编排整体视图

```
Scheduler（触发决策）
    │  产生 Workflow 触发请求
    ▼
Workflow Engine（编排：Stage 顺序/依赖/失败策略）
    │  逐 Stage 派生 Task
    ▼
Task Engine（Task 生命周期/并发/重试/超时/取消/幂等）
    │  调度到 Collector Runner
    ▼
Collector（三类 Adapter 执行采集）
    │  产生标准化 Event + Commit + Checkpoint
    ▼
Repository（持久化事实源）  +  EventBus（内部通知，非事实源）
```

职责边界：

| 引擎 | 职责 | 不负责 |
| ---- | ---- | ------ |
| Scheduler | 何时触发（时间/定时/事件） | 执行哪些 Stage、执行策略 |
| Workflow Engine | Stage、依赖、顺序、失败策略、流程级 Checkpoint | 单个 Task 执行策略 |
| Task Engine | Task 状态机、并发/优先级、超时/取消、重试退避、TaskRecord、幂等 | Stage 拓扑 |
| Collector Runner | 实际执行 Collector | 任务生命周期（Collector 自身不管理） |

## 4. 采集子系统设计

### 4.1 采集统一抽象

采集一经标准化为以下对象（字段级见 DOC-06）：

| 对象 | 职责 |
| ---- | ---- |
| Collector | 某类数据源（MySQL/SSH/Log）的采集执行单元 |
| CollectionTask | 一次采集的执行实例（用 Task 状态机执行生命周期，结果用 CollectionStatus 表达） |
| Checkpoint | 采集游标/检查点（MySQL 复合游标、日志 byteOffset 等） |
| CollectionCommit | 采集提交事务记录（三态） |
| DataQuality | 已采集数据可信度（独立于执行结果） |

### 4.2 采集模式

| 模式 | 语义 | 关键约束 |
| ---- | ---- | -------- |
| FULL | 全量采集 | 需配合全量对账兜底物理删除 |
| INCREMENTAL | 增量（基于游标） | 游标 = updated_at + primary_key 复合；明确时间精度与并列记录处理 |
| TIME_RANGE | 时间范围采集 | 左闭右开 `[start, end)` |
| SNAPSHOT | 快照采集 | 记录快照时点 |
| TAIL | 有限尾部跟踪 | 必须具备超时、取消、资源释放 |

增量游标无法发现物理删除：V1 通过定期全量对账兜底（周期可配置）；对账发现缺失的记录标记为删除或缺失，不得静默忽略。

### 4.3 三类数据源采集流程

统一骨架：确定模式/游标 → 建立连接/读取 → 拉取数据 → 标准化 → 幂等判定 → 持久化 → 推进 Checkpoint → 提交 → 返回结果。

**MySQL**（只读采集）：
1. 表名/字段名白名单校验；查询值参数绑定；禁止任意 SQL。
2. 优先复合游标（updated_at + primary_key）；明确时间字段精度与并列记录处理。
3. 查询超时、结果数量限制；只读账号。
4. 增量采完推进 Checkpoint；定期全量对账兜底物理删除。

**SSH**（受控命令）：
1. 命令模板白名单；参数白名单；禁止外部输入直接拼接 Shell。
2. Host Key 校验；连接超时与命令执行超时；输出长度限制；并发限制。
3. 敏感信息保护；命令执行审计。

**日志**（远程文件读取）：
1. 游标 = 文件身份 + byteOffset；支持追加、轮转、截断、多行、编码异常、断点续采、迟到日志。
2. 多行堆栈作为一个完整事件，不无条件拆分成多个事件。
3. 轮转/重命名/截断按文件身份识别与游标恢复；敏感字段脱敏。

### 4.4 Collection Commit 三态事务

采集提交按以下顺序推进，记录三态：

```
PREPARED ──► DATA_PERSISTED ──► COMMITTED
（已准备）     （数据已持久化）     （已提交）
```

规则：
1. 检查点只能在 `DATA_PERSISTED` 之后推进。
2. 持久化失败不得推进检查点，不得报告提交成功。
3. `PREPARED → DATA_PERSISTED → COMMITTED` 顺序固定，不得倒转；崩溃恢复时依据最后一次已持久化的 Commit 状态续跑（见 §8.2）。

### 4.5 Checkpoint 管理

- Checkpoint 至少含数据源身份、游标字段（MySQL 复合游标 / 日志文件身份 + byteOffset）、游标值、时间精度、并列记录处理策略。
- Checkpoint 推进前必须确认对应数据已持久化（`DATA_PERSISTED`）。
- 崩溃恢复从最近一个已持久化 Checkpoint 续采，不重复、不越过。

## 5. 编排子系统设计

### 5.1 Scheduler（触发决策）

- 触发来源：定时触发、事件触发、手工触发（工具）。
- 触发决策与执行决策分离：Scheduler 产出"触发请求"，不直接创建执行逻辑。
- 触发请求携带固定配置快照引用，供后续 Workflow/Task 使用（热更新不影响已触发任务）。

### 5.2 Workflow Engine（Stage 编排）

- Workflow 由 Stage 组成，Stage 之间声明依赖与执行顺序。
- 失败策略：`ABORT`（失败即流程失败）/ `CONTINUE`（记录失败继续）/ `RETRY`（重试失败 Stage）。
- 流程级 Checkpoint：记录已完成的 Stage，崩溃后从断点续跑。
- 每个 Stage 派生一个或多个 Task，交由 Task Engine 执行。

### 5.3 Task Engine（任务生命周期与执行策略）

管理（对齐 DOC-01 §14、基线 §5）：

| 关注点 | 机制 |
| ------ | ---- |
| 状态机 | §6.1 |
| 并发/优先级 | 分层并发预算 + 优先级调度 |
| 超时/取消 | 协作式（§7.2），区分 UNKNOWN/Timeout/Cancellation |
| 重试退避 | 可配置重试次数与退避策略（§7.3） |
| TaskRecord | 每次执行的记录与状态变更历史 |
| Checkpoint | 持久化进展点 |
| 崩溃恢复 | 依据已持久化 TaskRecord/Checkpoint 续跑 |
| 幂等执行 | 幂等键→Hash；重复执行返回原结果（§8.1） |

### 5.4 三引擎协作

```
Scheduler 触发 → 创建 Workflow 实例（固定配置快照）
Workflow Engine → 编排 Stage 顺序/依赖 → 逐 Stage 派生 Task
Task Engine → 管理 Task 生命周期 → 调度 Collector Runner 执行
Collector Runner → 执行 Collector（采集）→ 持久化 → 推进 Checkpoint → 提交
```

## 6. 状态机

### 6.1 Task 状态机（通用业务任务）

状态集合：`PENDING / QUEUED / RUNNING / SUCCEEDED / FAILED / CANCELLED / TIMED_OUT`。

| 当前态 | 事件/条件 | 目标态 |
| ------ | --------- | ------ |
| PENDING | 调度器分配 | QUEUED |
| PENDING | 取消 | CANCELLED |
| QUEUED | 获得并发配额 | RUNNING |
| QUEUED | 取消 | CANCELLED |
| QUEUED | 排队超时（可配置） | TIMED_OUT |
| RUNNING | 执行成功 | SUCCEEDED |
| RUNNING | 执行失败（不可重试或重试耗尽） | FAILED |
| RUNNING | 取消（协作式退出并释放资源） | CANCELLED |
| RUNNING | 超时 | TIMED_OUT |
| FAILED | 可重试且未达上限（退避后） | QUEUED |

约束：
1. `SUCCEEDED / CANCELLED / TIMED_OUT / FAILED` 为终态，不再转换（重试通过 FAILED → QUEUED 回退，属受控重试而非历史覆盖）。
2. 执行结果不确定（无法判定成功/失败/超时）时，保留 `UNKNOWN` 结果标注并进入协调流程，不得静默归为 SUCCEEDED/FAILED（对齐 DOC-01 §13.4、§15.3）。
3. 重试次数、退避记录于 TaskRecord/Attempt，不得无审计覆盖。
4. 取消为协作式：执行体在检查点配合 `AbortSignal` 退出；取消请求发出后 5 秒内停止推进检查点并释放资源，超时未退出升级为异常或资源泄漏告警。

### 6.2 Workflow 状态机

Workflow 实例状态：`PENDING / RUNNING / SUCCEEDED / FAILED / CANCELLED`。

| 当前态 | 事件/条件 | 目标态 |
| ------ | --------- | ------ |
| PENDING | 开始执行 | RUNNING |
| PENDING | 取消 | CANCELLED |
| RUNNING | 所有 Stage 完成 | SUCCEEDED |
| RUNNING | 失败策略 ABORT 触发 | FAILED |
| RUNNING | 取消 | CANCELLED |

Stage 状态：`PENDING / RUNNING / SUCCEEDED / FAILED / SKIPPED`。

| 当前态 | 事件/条件 | 目标态 |
| ------ | --------- | ------ |
| PENDING | 依赖满足并开始 | RUNNING |
| PENDING | 上游失败致跳过 | SKIPPED |
| RUNNING | 完成 | SUCCEEDED |
| RUNNING | 失败 | FAILED |

失败策略落点：Stage `FAILED` 后，由失败策略（ABORT/CONTINUE/RETRY）决定 Workflow 走向。

### 6.3 采集结果状态（CollectionStatus）

CollectionStatus 是 CollectionTask 的**执行结果**（终态语义），由 Task 终态 + 部分成功判定映射：

| Task 终态 | 数据情况 | CollectionStatus |
| --------- | -------- | ---------------- |
| SUCCEEDED | 完整 | SUCCEEDED |
| SUCCEEDED | 部分数据成功 | PARTIAL |
| FAILED | 失败 | FAILED |
| CANCELLED | 取消 | CANCELLED |
| TIMED_OUT | 超时 | TIMED_OUT |

约束：采集部分成功不得伪装为完全成功（`PARTIAL` ≠ `SUCCEEDED`）；`CollectionStatus`（执行结果）与 `DataQuality`（数据可信度）分离（见 DOC-03 §6.1）。

### 6.4 状态持久化

每次状态转换持久化状态变更记录（TaskRecord / Workflow 历史 / Commit 记录），记录触发事件、时间、配置快照版本与操作者；记录不可无审计覆盖。

## 7. 并发、取消、超时与背压

### 7.1 并发预算（初始建议，非容量承诺）

| 项目 | 建议并发 |
| ---- | -------- |
| 全局 Task | 8 |
| Workflow | 4 |
| Workflow 节点 | 3 |
| Collection | 3 |
| Metric | 2 |
| Rule | 2 |
| 通知 | 2 |
| 报告 | 1 |
| 单租户 Task | 3 |
| 单数据源采集 | 2 |

采用分层并发预算、有限队列、租户公平调度与背压；最终值以压测为准（DOC-01 TBD-002）。

### 7.2 协作式取消与超时

- 区分 `UNKNOWN / Timeout / Cancellation`。
- 协作式语义：不承诺强杀；执行体配合 `AbortSignal` 在检查点退出并释放资源。
- TAIL 等有限运行模式必须具备超时、取消、资源释放。
- 取消验收断言：取消请求发出后 5 秒内停止推进检查点并释放资源。

### 7.3 重试与退避

- Task Engine 决定是否重试，Resilience Manager 提供退避/熔断/隔离/限流策略（DOC-02 MOD-APP-020）。
- 重试只针对可重试失败（如瞬时外部依赖错误）；不可重试失败直接 FAILED。
- 重试次数与退避系数可配置，写入 TaskRecord/Attempt。

### 7.4 租户公平调度

- 单租户 Task 并发上限防止单租户饿死他人。
- 队列有界，超出背压（拒绝或延迟），不让长时间采集阻塞关键风险监控任务。
- 关键风险监控任务优先于报告和清理任务。

## 8. 幂等与崩溃恢复

### 8.1 任务幂等

- 幂等键 = 租户 + 数据源 + 表 + 主键 + 源版本（按固定顺序拼接后确定性 Hash）。
- 语义（对齐 DOC-01 §13.4）：同 Hash 返回原结果或引用；不同 Hash 拒绝冲突；处理中返回处理中引用；UNKNOWN 先协调不重复执行。
- 同一业务事实重复采集不重复形成交易统计（对齐 DOC-01 §4.1.7）。

### 8.2 Checkpoint 崩溃恢复

- 崩溃后从最近"已持久化且已推进 Checkpoint"的位置续跑，绝不越过 Checkpoint 重复并采。
- 依据已持久化的 Commit 状态（`PREPARED/DATA_PERSISTED/COMMITTED`）与 TaskRecord 判定续跑点。
- 恢复完成后才开放相关业务 Tool（生命周期要求，DOC-02 §8.2）。

## 9. 配置快照与热更新影响

- Task/Workflow 启动时固定配置快照；热更新原子切换新配置后，已启动 Task/Workflow 继续使用启动时快照。
- Checkpoint/Commit 历史事实不因配置热更新被覆盖（对齐 DOC-01 §14.4、§16.4）。

## 10. 与下游文档边界

| 本文档 | 下游承接 |
| ------ | -------- |
| 采集模式/Commit/Checkpoint 语义 | DOC-06（对象字段级 DTO）、DOC-07（Repository/采集 Port 契约） |
| 编排即可化对象（Task/Workflow/Scheduler） | DOC-06（DTO）、DOC-07（Ports） |
| 采集 → 标准化 → 指标 → 规则 → 风险 → 报告完整链路 | DOC-05（端到端数据流） |
| 错误分类/事务/幂等/恢复边界 | DOC-11 |
| 三类 Adapter 与 DSH 集成 | DOC-16 |

## 附录 A：版本与文档状态

| 版本 | 状态 | 说明 |
| ---- | ---- | ---- |
| V1.0-Baseline | Frozen | 冻结基线，开发启动依据 |

本文档已冻结，基线版本 `V1.0-Baseline`，作为开发启动依据。

**文档结束。**