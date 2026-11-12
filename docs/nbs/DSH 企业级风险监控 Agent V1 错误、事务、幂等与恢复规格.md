# DSH 企业级风险监控 Agent V1 错误、事务、幂等与恢复规格

| 文档属性 | 内容 |
| -------------- | ------------------------------------------ |
| 文档编号 | DSH-RISK-RELIABILITY-V1 |
| 文档名称 | DSH 企业级风险监控 Agent V1 错误、事务、幂等与恢复规格 |
| 版本 | V1.0-Baseline |
| 文档状态 | 已冻结（Frozen） |
| 前置输入 | DOC-01（DSH-RISK-SRS-V1，V1.3-Review）；DOC-02（总体架构与模块设计）；DOC-05（端到端数据流设计）；DOC-06（DTO 与数据模型规格）；另对 DOC-04（采集与编排，Checkpoint/Commit 恢复语义）、DOC-07（Ports 与 Repository 契约，错误类型名与幂等查询签名）保持一致性引用 |
| 下一环节 | DOC-13（可观测性设计）、DOC-15（测试与验收规格）、DOC-16（DSH 适配设计规格）、DOC-17（部署设计规格） |
| 适用范围 | DSH 风险监控 Agent V1 插件工程 |
| 技术基线 | DeepSeek Harness 工作树 live 源码（以源码核验为准） |
| 核验快照 | fcc0ad46（2026-11-04 核验时点，不构成基线锁定） |

## 1. 文档概述

### 1.1 编写目的

本文档定义 V1 风险监控 Agent 的横切可靠性规格：错误分层与分类、结构化错误类型与处理所有权、文件持久化事务（PersistenceTransactionCoordinator）与 Journal/Outbox/Inbox 记录格式、幂等键的确定性 Hash 与冲突语义、崩溃恢复算法，以及故障注入与恢复验证要求。

本文档是 DOC-01 §13.7「具体记录格式、提交顺序、恢复算法和故障注入要求由 DOC-11 定义」、§15（错误处理）与 §13.4（幂等）的落实，也是 DOC-07 §2.6/§2.7/§5 所引用错误类型、幂等语义与事务协调器的权威定义。

### 1.2 边界声明

| 主题 | 归属 |
| ---- | ---- |
| 错误分类、分层模型、结构化错误类型、错误处理所有权与保证 | 本文档 |
| 持久化事务协调器契约、Journal/Outbox/Inbox 记录格式、提交顺序、恢复算法 | 本文档 |
| 幂等键组成、确定性 Hash、冲突语义、幂等落点 | 本文档 |
| 故障注入与恢复验证要求 | 本文档 |
| Repository/Port 方法签名与查询语义 | DOC-07 |
| 状态机（风险/Proposal/Task/Workflow）转换规则 | DOC-03 / DOC-04 |
| 错误到 DSH Tool Response 的具体映射 | DOC-16 |
| 结构化日志、Trace/Correlation 归因、可观测落地 | DOC-13 |
| Secret / 脱敏 / 授权失败的安全落地 | DOC-12 |
| 取消/超时的 DSH 运行时行为与 5 秒断言验证 | DOC-04（Task Engine）+ DOC-16 |

本文档定义可靠性机制，不进入 Repository 方法签名（DOC-07）、状态机转换（DOC-03/04）与 DSH 适配映射（DOC-16）。

### 1.3 前置输入与依据

DOC-01 §13（存储与事务）、§14（运行时、生命周期与并发）、§15（错误处理与可观测）；DOC-02 §4.4/§10（Infrastructure 模块与横切关注点）、§12（错误/事务/幂等/恢复追踪）；DOC-04 §4.4/§8（Collection Commit 与 Checkpoint 恢复）；DOC-05 §7（数据流错误处理与恢复）；DOC-06 §2.2.5/§7.5/§10.10（幂等键、状态迁移、ErrorResult DTO）；DOC-07 §2.6/§2.7/§5（幂等查询签名、错误类型名、事务边界）。

### 1.4 术语

本文档复用 DOC-01 §1.3 术语表，新增下列可靠性术语：

| 术语 | 定义 |
| ---- | ---- |
| PersistenceTransactionCoordinator | 统一协调文件持久化操作的组件；非完整 ACID 事务 |
| Journal | 追加式（append-only）写前意图日志，记录持久化操作意图与状态，用于崩溃恢复判定 |
| Outbox | 记录「待投递内部通知/消息」的持久化队列，保证至少一次投递 |
| Inbox | 记录「已消费/已处理单元」的持久化去重守卫，防止重复处理 |
| IdempotencyOutcome | 幂等判定的五态结果（NEW / DUPLICATE / CONFLICT / IN_PROGRESS / UNKNOWN） |
| identityHash | 幂等复合键的确定性 Hash（即 DOC-06 的 `IdempotencyKey`） |
| contentHash | 幂等记录内对规范化载荷计算的内容指纹，用于检测「同键不同内容」冲突 |
| Fault Point | 故障注入的检查点位置 |
| Checkpoint | 采集/任务/流程的持久化进展点（复用 DOC-01 术语） |

## 2. 设计目标与原则

1. **显式错误、结构化失败**：错误分层明确，分类统一，携带可追溯的 code/类别/重试提示与脱敏后的上下位信息。
2. **业务结果与错误分离**：「规则未命中」「采集部分成功」「UNKNOWN」是业务结果或不确定态，不伪装成系统错误或成功。
3. **文件持久化不冒充 ACID**：单文件原子替换以内保证；跨文件、跨外部系统不承诺 ACID；不承诺 exactly-once。
4. **写前意图 + 幂等去重**：Journal 在数据落盘前记录意图；Inbox/幂等键防止崩溃后重复执行。
5. **检查点仅在数据持久化确认后推进**：Commit 三态 `PREPARED → DATA_PERSISTED → COMMITTED` 固定顺序，不可倒转。
6. **恢复完成后才开放业务 Tool**：恢复未完成不得对外暴露依赖持久化的业务工具。
7. **确定性优先**：幂等 Hash 与冲突语义、提交顺序、恢复算法均为确定性过程，不依赖 LLM。
8. **协议常量固定，运营参数走配置**：Hash 算法、幂等字段顺序、三态顺序等为固定协议常量；重试次数、退避、超时、保留周期、对账周期等为 `Config` 字段（DOC-14），本文档不硬编码具体数值。

## 3. 错误处理规格

### 3.1 错误分层模型

采用五段分层，逐层转换、层层可定位：

```
Infrastructure 原始异常
      │  Adapter 捕获并转换为结构化错误（对齐错误分类）
      ▼
Application Error（结构化、可分类、可重试判定）
      │  Use Case 捕获并按语义处理（补偿/回滚/抛向上）
      ▼
Use Case 处理结果（业务结果 | 结构化失败）
      │  Plugin Adapter 映射
      ▼
DSH Tool Response
```

约束：

1. Domain 不依赖 DSH 错误类型；Domain 抛出的是自身领域错误（复用下文结构化类型）。
2. Infrastructure Adapter 不吞业务错误；原始异常（如数据库连接失败、文件 IO 失败）在 Adapter 边界转换为 `PersistenceError` / `ExternalDependencyError` 等结构化失败，并保留可追溯的 cause 链（cause 仅进入日志，不进 DSH Response 与模型可见输出）。
3. Use Case 是错误遏制边界：决定补偿、回滚或向上抛出，不把未处理状态静默降级为成功。
4. Plugin Adapter 只做结构化失败到 DSH Tool Response 的映射（映射细节属 DOC-16）。

### 3.2 错误分类

统一九类，与 DOC-01 §15.2、DOC-07 §2.7 一致：

| 类别 | 结构化类型名（DOC-07） | 典型触发 |
| ---- | ----- | -------- |
| Validation | `ValidationError` | 入参非法、Schema 校验失败、字段越界 |
| Authorization | `AuthorizationError` | 越权、跨租户未授权、tenantId 伪造被拒 |
| Not Found | `NotFound` | 对象缺失、Checkpoint/提交记录缺失 |
| Conflict | `Conflict` | 幂等同键不同内容、版本冲突（expectedVersion 不匹配）、非法状态回退 |
| Timeout | `Timeout` | 采集/命令/投递超时、排队超时 |
| Cancellation | `Cancellation` | 协作式取消、TAIL 终止 |
| Persistence | `PersistenceError` | 文件 IO 失败、fsync 失败、原子替换失败、Journal/Inbox 损坏 |
| External Dependency | `ExternalDependencyError` | MySQL/SSH/日志源、通知渠道、Secret Provider 不可用 |
| Internal | `InternalError` | 未预期内部状态、不可分类的缺陷 |

约束：

1. 每类错误必须归属唯一类别；无法归属时归入 `InternalError`，不得编造新类别。
2. `Timeout` 与 `Cancellation` 必须与执行结果的 `UNKNOWN` 严格区分（见 §3.5、§8）。
3. 重试判定：仅 `ExternalDependencyError` 等瞬时、可重试的失败可标记为可重试；`Validation`、`Authorization`、`Conflict`、`NotFound` 默认为不可重试（重试会造成重复或错误的业务动作）。

### 3.3 结构化错误类型

位于 `src/shared/errors`（MOD-SHR-003），所有层统一使用：

```ts
type ErrorCategory =
  | 'Validation' | 'Authorization' | 'NotFound' | 'Conflict'
  | 'Timeout' | 'Cancellation' | 'Persistence' | 'ExternalDependency' | 'Internal';

interface StructuredError {
  category: ErrorCategory;
  code: string;              // 稳定、细粒度的机器可读错误码（跨版本稳定）
  message: string;           // 用户可读、本地化、不含敏感信息
  tenantId?: string;         // 脱敏后的租户标识（遵循 DOC-01 §10.2）
  retryable: boolean;        // 是否可安全重试（供 Task Engine 判定，DOC-04 §7.3）
  cause?: unknown;           // 底层原始异常链（仅进日志，不进 DSH Response）
}

abstract class StructuredErrorBase extends Error implements StructuredError {
  category: ErrorCategory;   // 由具体类构造时固定传入（如 ValidationError → 'Validation'）
  code: string;              // 稳定、细粒度的机器可读错误码
  message: string;           // 用户可读、本地化、不含敏感信息
  tenantId?: string;
  retryable: boolean;
  cause?: unknown;           // 仅进日志，不进 DSH Response

  protected constructor(
    category: ErrorCategory,
    code: string,
    message: string,
    opts?: { tenantId?: string; retryable?: boolean; cause?: unknown },
  ) {
    super(message);
    this.name = new.target.name;   // 保留原生错误名与堆栈
    this.category = category;
    this.code = code;
    this.retryable = opts?.retryable ?? false;
    this.tenantId = opts?.tenantId;
    this.cause = opts?.cause;
  }
}

// 具体错误类构造时以固定 category 调用 super（如 ValidationError 传 'Validation'），类别判别 = 类名 + category。
class ValidationError       extends StructuredErrorBase {}
class AuthorizationError    extends StructuredErrorBase {}
class NotFound              extends StructuredErrorBase {}
class Conflict              extends StructuredErrorBase {}
class Timeout               extends StructuredErrorBase {}
class Cancellation          extends StructuredErrorBase {}
class PersistenceError      extends StructuredErrorBase {}
class ExternalDependencyError extends StructuredErrorBase {}
class InternalError         extends StructuredErrorBase {}
```

`ErrorResult`（DOC-06 §10.10）是从 `StructuredError` 投影到模型可见输出的 DTO：`{ kind, message, code }`，其中 `kind` 类型即 `ErrorCategory`（九个类别名）；`...Error` 为具体错误类名，不进入 `kind` 值域；`cause` 绝不外泄。

### 3.4 错误处理所有权与保证

1. **所有权**：`Infrastructure 原始异常 → Adapter 转换 → Use Case 遏制 → Plugin Adapter 映射` 各段各司其职，不得越层吞并或混淆。
2. **遏制与停止**：依赖失败时，Use Case 须停止后续依赖该结果的工作（如采集失败不得推进 Checkpoint、规则失败不得产生 Evidence、通知失败不得回写风险事实）。
3. **空 catch 必声明**：任何空 `catch` 必须命名错误并以注释说明为何安全（满足 AGENTS.md「An empty catch names the error and why」的工程约定）；不静默吞异常。
4. **显式失败保证**：持久化失败不得报告提交成功；采集部分成功不得伪装完全成功；UNKNOWN 保持不确定态（对齐 DOC-01 §15.3）。
5. **可定位报告**：错误报告携带类别、稳定 code 与可追溯日志（Trace/Correlation/Task/Workflow ID），敏感信息脱敏后再记入（DOC-13）。

### 3.5 业务结果 / 数据质量 / 错误分离

| 概念 | 回答的问题 | 语义 |
| ---- | ---------- | ---- |
| 业务结果 | 操作是否达成业务目标 | 规则未命中 = 正常业务结果，非错误 |
| DataQuality | 已采集/已计算数据是否可信 | NORMAL/STALE/PARTIAL/ERROR/INVALID |
| Error | 系统是否发生故障 | 结构化失败，见 §3.2 |

三者不得相互替代（对齐 DOC-01 §15.3、DOC-03 §6.1）：规则未命中不抛异常；采集 `PARTIAL` 是业务结果不是 `SUCCEEDED`；数据质量 `INVALID` 是数据状态、不是系统错误。

## 4. 事务规格

### 4.1 PersistenceTransactionCoordinator

`PersistenceTransactionCoordinator`（MOD-INF-001 Persistence 内的组件，经 Port 暴露给 Application Use Case）统一协调单进程内的文件持久化写操作。契约如下：

```ts
interface PersistenceTransactionCoordinator {
  begin(scope: TransactionScope): Transaction;       // 建立局部事务上下文
}

interface TransactionScope {
  tenantId: TenantId;
  coordinator: string;          // 调用方（采集/风险/Proposal/通知…）
  idempotencyKey?: IdempotencyKey;
}

interface Transaction {
  id: string;                                        // 事务标识
  intent(operation: string, target: string, payload: unknown, opts?: IntentOptions): IntentHandle;
  prepare(): Promise<void>;                          // 预写待落盘数据（含 Journal 意图，fsync）
  persist(): Promise<void>;                          // 原子替换数据文件 → DATA_PERSISTED
  commit(): Promise<void>;                           // 标记 Journal APPLIED → COMMITTED
  rollback(): Promise<void>;                         // 标记 ABORTED，回收未提交写（不覆盖已成功数据）
  result(): TransactionState;                        // INTENDED/PREPARED/DATA_PERSISTED/COMMITTED/ABORTED
}
```

职责：

1. **顺序保证**：`intent → prepare → persist → commit` 固定顺序；`persist`（DATA_PERSISTED）之前不得推进 Checkpoint。
2. **写前意图**：`intent` 将 Journal 记录 `fsync` 落盘后再执行实际数据写（写前日志）。
3. **原子替换**：每个目标文件经「临时文件 + fsync + 原子 rename」替换（MOD-INF-001 实现，语义见 DOC-02 §10/ADR-006）。
4. **非 ACID**：协调器只提供单文件原子替换 + 有序 fsync + 可重放的 Intent 语义，不提供跨文件原子性（见 §4.2）。
5. **幂等重入**：`commit`/`rollback` 幂等；对已 `COMMITTED` 或 `ABORTED` 的事务重复调用是 no-op 并返回当前状态，不重复写数据。

### 4.2 事务边界与非 ACID 保证

V1 明确保证与不保证（对齐 DOC-01 §13.6、DOC-07 §5）：

| 保证 | 范围 |
| ---- | ---- |
| 承诺 | 单文件原子替换；Journal/Inbox/Outbox 顺序 `fsync`；幂等去重下的可重放提交；崩溃后可恢复到最后一致点 |
| 不承诺 | 跨文件 ACID；跨外部系统（MySQL 写、通知投递、SSH 命令）ACID；外部通知 exactly-once；无协调机制的自动重复执行 |

据此，任何跨越「多文件」或「文件 + 外部系统」的操作都必须显式声明其一致性级别与补偿路径（恢复算法见 §6），不得默认 ACID。

### 4.3 Journal

Journal 是追加式写前意图日志（每事务一份局部记录），用于崩溃后判定某步是否已落盘、是否需回放或丢弃。

记录格式（JSONL，追加写入，`fsync`）：

```ts
interface JournalRecord {
  journalSeq: number;            // 单文件内单调递增
  transactionId: string;         // 事务标识
  tenantId: TenantId;
  operation: string;             // 操作名（如 'collection.persist' / 'checkpoint.advance' / 'risk.transition'）
  target: string;                // 目标数据文件 / 实体定位
  payloadHash: string;           // 待写入载荷的内容 Hash（§5.2 同一算法）
  state: JournalState;           // INTENDED / PERSISTED / APPLIED / ABORTED
  createdAt: Instant;
}

type JournalState = 'INTENDED' | 'PERSISTED' | 'APPLIED' | 'ABORTED';
```

约束：

1. `payloadHash` 用于恢复时校验「Journal 意图与实际落盘数据是否一致」，避免半写/交错写被误判为已完成。
2. 写前语义：`intent` 产生 `INTENDED` 并 `fsync`；`persist` 成功后标记 `PERSISTED` 并 `fsync`；`commit` 后标记 `APPLIED` 并 `fsync`。
3. Journal 自身 append-only；不原地改写历史；清理遵循 Retention（DOC-02 MOD-APP-026）保留活跃事务，仅归档已 `APPLIED/ABORTED` 且超过保留期的记录。

术语边界：`Journal.PERSISTED` 等价于 `TransactionState.DATA_PERSISTED` 与 CollectionCommit 的「已落盘」时点；`PREPARED` 全库唯一表示「prepare 完成、尚未落盘」，不复用为已落盘语义。

### 4.4 Outbox 与 Inbox

Outbox 与 Inbox 是持久化协调的两类追加式记录，与 Journal 分离存储（各自 JSONL 分区，按租户隔离）。

**Outbox**（待投递内部通知，至少一次投递）：

```ts
interface OutboxRecord {
  outboxSeq: number;
  tenantId: TenantId;
  messageType: string;           // 如 'risk.triggered' / 'proposal.generated' / 'report.ready'
  payloadRef: string;            // 指向已持久化的实体引用（不重复存储实体全文）
  deliveryIds: DeliveryId[];     // 关联投递
  state: OutboxState;            // PENDING / SENDING / DELIVERED / UNKNOWN / FAILED
  attempts: number;
  nextAttemptAt?: Instant;       // 退避重试调度时间
  createdAt: Instant;
}

type OutboxState = 'PENDING' | 'SENDING' | 'DELIVERED' | 'UNKNOWN' | 'FAILED';
```

**Inbox**（已消费单元去重守卫，防重复处理）：

```ts
interface InboxRecord {
  inboxSeq: number;
  tenantId: TenantId;
  idempotencyKey: IdempotencyKey;
  eventId: EventId;              // 或处理单元标识
  state: InboxState;             // PROCESSING / PROCESSED / UNKNOWN
  processedAt?: Instant;
}

type InboxState = 'PROCESSING' | 'PROCESSED' | 'UNKNOWN';
```

约束：

1. Outbox 与投递（Delivery/Attempt）分离：Outbox 只记录「要投递」的意图，实际投递结果记录在 Attempt 中（DOC-06 §6.8）。
2. 至少一次投递：`FAILED/UNKNOWN` 的 Outbox 记录进入重试；`DELIVERED` 后由 idempotencyKey 或 message 级去重避免重复副作用。
3. Inbox 记录写入先于处理单元落地：处理前写入 `PROCESSING`，处理后置为 `PROCESSED`；崩溃遗留的 `PROCESSING → UNKNOWN` 进入协调（不盲目重新处理）。
4. Outbox/Inbox 不得作为业务事实源（事实源是 Repository，DOC-02 §5）。

### 4.5 Collection Commit 与事务的关系

采集提交的 `CollectionCommit` 三态（DOC-06 §6.2、DOC-04 §4.4）是 `PersistenceTransactionCoordinator` 在采集域的实例化：

| CollectionCommit 三态 | 协调器阶段 | 动作 |
| ---- | ---- | ---- |
| `PREPARED` | intent / prepare | 记录采集 Intent、准备数据，未落盘 |
| `DATA_PERSISTED` | persist | 数据已持久化，允许推进 Checkpoint |
| `COMMITTED` | commit | 完成提交，Journal 标记 APPLIED |

顺序固定 `PREPARED → DATA_PERSISTED → COMMITTED`，不得倒转；Checkpoint 推进只在 `DATA_PERSISTED` 之后（DOC-04 §4.4）。崩溃恢复依最后一次已持久化的 Commit 状态续跑（见 §6.5）。

### 4.6 提交顺序

所有带持久化副作用的操作遵循统一提交顺序（确定性）：

1. **intent**：Journal 追加 `INTENDED`（`fsync`）。
2. **prepare**：准备数据文件（临时文件写入 + `fsync`）。
3. **persist**：原子替换数据文件；Journal 置 `PERSISTED`（`fsync`）。（采集域即 `DATA_PERSISTED` 时点）
4. **checkpoint**（如适用）：数据持久化确认后，推进 Checkpoint（Checkpoint 落盘 + `fsync`）。
5. **commit**：Journal 置 `APPLIED`（`fsync`）；对外（EventBus/Outbox）发布通知意图。

回滚路径（任一步失败）：

- `persist` 前失败 → `rollback`，清临时文件，Journal 置 `ABORTED`，Checkpoint 不推进。
- `persist` 成功、`checkpoint`/`commit` 前失败 → 恢复时按「数据已持久化但未提交」处理（见 §6.3），不重复写入数据。

状态转换类写（如风险/Proposal 状态变化）同序：先 Journal，再落 `RiskEventHistory` + 新状态，后提交；历史记录 append-only、不可无审计覆盖（DOC-03 §7.4）。

## 5. 幂等规格

### 5.1 幂等键组成

幂等复合键的五元组（固定顺序，对齐 DOC-01 §4.1.7、DOC-06 §2.2.5）：

1. `tenantId`：租户标识。
2. `sourceId`：数据源标识（对齐 DOC-01 的「数据源」）。
3. `table`：来源表/实体（MySQL 表 / 日志源 / SSH 采集对象）。
4. `primaryKey`：源记录主键（主键或复合主键的规范化拼接）。
5. `sourceVersion`：源版本（updated_at 或数据源声明的版本戳）。

同一业务事实重复采集，五元组相同 → 必得相同 `IdempotencyKey`，不得重复形成统计（DOC-01 §4.1.7）。

### 5.2 确定性 Hash 与冲突指纹

**identityHash（即 `IdempotencyKey`，DOC-06 §2.2.5）**：

- 规范化序列化：对五元组按固定顺序，逐字段取 UTF-8 字节，并以「4 字节大端字节长度 + 字节」作长度前缀帧拼接（消除 `a|bc` 与 `ab|c` 的歧义）。
- 算法：SHA-256（Node.js `crypto.createHash('sha256')`），输出小写 hex（64 字符）。
- 该值是存储与传输用幂等键，确定性、抗碰撞。

**contentHash（冲突指纹，仅存于幂等记录，不外传）**：

- 对「幂等相关载荷」计算 SHA-256：即规范化事件中决定业务事实的字段投影（排除 `collectedAt/ingestedAt` 等易变时间戳，或采集/编排元数据），字段按 Schema 稳定序序列化。
- 用于在「同键」前提下检测内容是否变化（源内容变化但未提升 `sourceVersion` 时的源侧完整性问题）。

### 5.3 幂等语义引擎

幂等判定由幂等门（Idempotency Gate，Infrastructure 内，经 Repository 的 `findByIdempotencyKey` 暴露，签名见 DOC-07 §2.6/§3.2）执行。判定规则将 DOC-01 §13.4 落实为五态结果：

| 场景 | 判定条件 | `IdempotencyOutcome` | 事件/任务处理 |
| ---- | -------- | -------------------- | ------------- |
| 无历史 | identityHash 未命中 | `NEW` | 创建幂等记录（PROCESSING）并执行 |
| 同 Hash | 命中且 contentHash 相等 | `DUPLICATE` | 返回原结果或原结果引用（EventState=DUPLICATE），不重复执行 |
| 不同 Hash | 命中且 contentHash 不等 | `CONFLICT` | 拒绝，抛 `Conflict` / EventState=REJECTED |
| 处理中 | 命中且状态 PROCESSING | `IN_PROGRESS` | 返回处理中引用或明确状态，不重复执行 |
| 结果未知 | 命中且结果为 UNKNOWN | `UNKNOWN` | 先协调（EventState=QUARANTINED），不得直接重复执行 |

```ts
type IdempotencyOutcome =
  | { kind: 'NEW' }
  | { kind: 'DUPLICATE'; resultRef: string }
  | { kind: 'CONFLICT'; detail?: string }
  | { kind: 'IN_PROGRESS'; startedAt: Instant }
  | { kind: 'UNKNOWN' };
```

幂等记录（Infrastructure 持有，DOC-11 定义的存贮结构）：

```ts
interface IdempotencyRecord {
  idempotencyKey: IdempotencyKey;   // identityHash（hex）
  contentHash: string;              // 冲突指纹
  state: 'PROCESSING' | 'COMPLETED' | 'UNKNOWN';
  resultRef?: string;               // 原结果引用
  createdAt: Instant;
  completedAt?: Instant;
}
```

### 5.4 幂等适用范围与落点

| 落点 | 幂等对象 | 语义 |
| ---- | -------- | ---- |
| 事件标准化 | Event（五元组） | 重复采集合一，EventState DUPLICATE（DOC-05 §3.2） |
| 采集任务 | CollectionTask / Task | 重复触发返回原 taskId / 原结果（DOC-04 §8.1） |
| 检查点推进 | Checkpoint（数据源身份） | 同数据源 + 同游标不重复推进 |
| 通知投递 | Outbox + Delivery | 至少一次投递，重复投递由 idempotencyKey 去重 |
| 状态转换 | RiskEventHistory / Proposal 版本 | 同转换事件不重复落历史（append-only + 判定去重） |

跨落点统一使用 §5.2 的 Hash 与 §5.3 的判定语义；不得出现「事件层判幂等、任务层另起一套」的不一致行为。

## 6. 恢复规格

### 6.1 恢复总体流程

系统异常退出后，启动时按以下顺序恢复（确定性）：

```
加载配置（Last Known Good）
  → 恢复持久化状态：重放 Journal，对账数据文件与 Checkpoint
  → 恢复 Inbox（PROCESSING → UNKNOWN 协调）
  → 恢复 Outbox（PENDING/SENDING 重投）
  → 重建序号/游标：续跑 Task/Workflow 断点
  → 完成恢复（打开业务 Tool）
```

恢复期间不开放依赖持久化的业务 Tool；恢复完成后才开放（对齐 DOC-02 §8.2、DOC-04 §8.2）。

### 6.2 启动恢复顺序与 Tool 开放门禁

1. **配置就绪**：加载 Last Known Good 配置快照；配置无效保持旧配置（DOC-02 §7.5）。
2. **持久化恢复完成前**：九个业务 Tool 不注册/不开放（只读健康类 TOOL-009 仅报告恢复中状态）。
3. **恢复完成判据**：Journal 重放完成、数据文件与 Checkpoint 对账一致、Inbox/Outbox 恢复到可续状态。
4. **开放**：按依赖顺序注册 Tool；采集/查询/风险 Tool 恢复完成后才可调用。

### 6.3 Journal 重放

启动时扫描每个租户分区的 Journal，按 `journalSeq` 顺序重放：

| Journal 状态 | 数据落盘情况 | 动作 |
| ---- | ---- | ---- |
| `INTENDED`（未 persist） | 数据未落盘 | 丢弃/回滚（temp 残留清理），Checkpoint 不推进 |
| `PERSISTED`（persist 成功，未 commit） | 数据已落盘，payloadHash 可校验 | 视为可提交：校验 payloadHash 一致后视为 COMMITTED（幂等收尾）；不一致进入协调告警 |
| `APPLIED` | 已完成 | 跳过 |
| `ABORTED` | 已回滚 | 跳过（确认无残留 temp 与半写） |

规则：

1. Journal 与数据文件按 `payloadHash` 对账：不一致置为协调异常（`QUARANTINED` 类似语义），不得静默覆盖或丢弃。
2. 重放具有幂等性：重复重放同一记录不重复落数据（由幂等门 + payloadHash 保证）。
3. 对账发现缺失记录（如全量对账兜底物理删除）标记删除/缺失，不得静默忽略（DOC-01 §7.2）。

### 6.4 Outbox / Inbox 恢复

**Outbox 恢复**（至少一次投递）：

| 状态 | 动作 |
| ---- | ---- |
| `PENDING` | 继续调度投递 |
| `SENDING` | 视为未完成，进入重新投递（Attempt 追加，不重发成功态未知外） |
| `UNKNOWN` / `FAILED` | 进入协调/退避重试，达上限告警（不简单判成功/失败，DOC-01 §11.1） |
| `DELIVERED` | 跳过（由 idempotencyKey 或 message 去重防重复副作用） |

**Inbox 恢复**：

| 状态 | 动作 |
| ---- | ---- |
| `PROCESSING` | 置 `UNKNOWN`，进入协调：由幂等门判定是否已部分处理，不盲目重放 |
| `PROCESSED` | 跳过 |
| `UNKNOWN` | 协调（幂等判定后决定补做或丢弃） |

### 6.5 Checkpoint 恢复

- 崩溃后从「最近已持久化且已推进 Checkpoint」的位置续跑，绝不越过 Checkpoint 重复并采（DOC-04 §8.2）。
- 依据已持久化的 `CollectionCommit` 状态（`PREPARED/DATA_PERSISTED/COMMITTED`）与 TaskRecord 判定续跑点。
- `DATA_PERSISTED` 后、`COMMITTED` 前崩溃：依 Journal 视为已提交（§6.3），Checkpoint 可安全推进，不重复写数据。
- 检查点推进前必须确认对应数据已 `DATA_PERSISTED`（DOC-04 §4.5）。

### 6.6 恢复保证与边界

| 项 | 保证 |
| ---- | ---- |
| 不丢失已提交数据 | Journal + 幂等重放保证已 `COMMITTED` 数据在崩溃后可见 |
| 不重复执行 | Inbox + 幂等门保证同键不重复处理 |
| 不重复推进 Checkpoint | 同数据源 + 同游标去重（§5.4） |
| 不承诺 | 跨文件、跨外部系统崩溃点一致性；外部通知 exactly-once；无协调机制的自动重放 |

## 7. 故障注入要求

恢复机制必须通过故障注入验证（测试用例明细由 DOC-15 承接，本文档定注入点与预期行为）：

| 编号 | 注入点 | 注入故障 | 预期恢复行为 |
| ---- | ------ | -------- | ------------ |
| FI-001 | Journal append 后、数据落盘前 | 进程崩溃 | 回滚，数据不出现，Checkpoint 不推进 |
| FI-002 | 数据落盘（DATA_PERSISTED）后、Checkpoint 推进前 | 进程崩溃 | 视为可提交，payloadHash 一致则收尾 COMMITTED |
| FI-003 | 原子替换 rename 中途 | 进程崩溃 | 恢复后仅存完整旧/新文件之一（无半写），由 Journal 对账 |
| FI-004 | Journal fsync 失败 | 注入 IO 失败 | 抛 `PersistenceError`，数据不落盘 |
| FI-005 | Checkpoint 推进后、COMMITTED 标记前 | 进程崩溃 | Checkpoint 已持久化，续跑不重复并采 |
| FI-006 | Outbox 记录后、投递前 | 进程崩溃 | 恢复后 PENDING 继续投递 |
| FI-007 | 投递返回 UNKNOWN | 注入 UNKNOWN | 进入协调，不简单判成败 |
| FI-008 | Inbox PROCESSING 后、PROCESSED 前 | 进程崩溃 | 置 UNKNOWN，幂等门判定不盲目重放 |
| FI-009 | 幂等记录写入后、业务执行前 | 进程崩溃 | 恢复后由幂等门返回 IN_PROGRESS/协调，不重复执行 |
| FI-010 | 重复投递/重复采集 | 注入重复消息 | 幂等门返回 DUPLICATE，不重复形成统计 |
| FI-011 | 迟到/乱序数据 | 注入乱序记录 | 保留原始时间戳并标记偏差，按 §6 语义处理（DOC-01 §7.11） |

每个注入点须断言：数据一致性、不重复、不丢失、Checkpoint 不越界，且系统最终收敛到 §6 定义的一致状态。

## 8. 取消、超时与恢复的协同

1. **三态区分**：执行结果区分 `UNKNOWN` / `Timeout` / `Cancellation`（DOC-01 §14.3）；`Timeout`/`Cancellation` 是结构化错误，`UNKNOWN` 是不确定态，两者不得混同。
2. **协作式取消**：执行体配合 `AbortSignal` 在检查点退出并释放资源，不承诺强杀；取消请求发出后 5 秒内停止推进检查点并释放资源，超时未退出升级为异常/资源泄漏告警（DOC-02 §8.4、DOC-04 §7.2）。
3. **取消/超时与提交**：被取消/超时的执行体不得推进 Checkpoint，其 Journal 记录置 `ABORTED`；TAIL 等有限模式必须具备超时、取消与资源释放。
4. **恢复语义**：取消/超时遗留的进程内状态由 Journal（ABORTED）+ Inbox（UNKNOWN）在下次启动对齐，不产生半提交。

## 9. 并发与事务、幂等的交互

1. **单写者**：单实例单写者模型（ADR-006），文件写经 `PersistenceTransactionCoordinator` 串行有序；并发预算约束并发执行体数量（DOC-01 §14.5、DOC-04 §7.1），不改变提交顺序确定性。
2. **分层并发预算 + 有限队列 + 背压**：采集/指标/规则/通知/报告分层预算，避免高并发下 Journal/Outbox 写放大与争用。
3. **事务 + 幂等排他**：同一幂等键的并发请求由幂等门的 `IN_PROGRESS` 态串行化；同键并发不会产生两条重复业务事实。
4. **租户公平**：单租户并发上限防饿死；事务/幂等记录按租户分区，天然隔离（DOC-02 §10）。

## 10. 与下游文档边界

| 本文档输出 | 下游承接 |
| ---- | ---- |
| 九类错误 + 结构化错误类型 | DOC-07 实现、DOC-13（日志/归因）、DOC-16（DSH Response 映射） |
| Journal/Outbox/Inbox 记录格式与提交顺序 | MOD-INF-001 Persistence 实现、DOC-07（Repository 签名落地） |
| 幂等 Hash 与 IdempotencyOutcome | DOC-07 §2.6/§3.2、各 Use Case 实现 |
| 恢复算法与启动门禁 | DOC-04（Task/Workflow 续跑）、DOC-17（部署/备份恢复） |
| 故障注入要求 FI-001～011 | DOC-15（测试与验收规格） |
| 重试/超时/退避的配置项 | DOC-14（配置文件规格） |

需求追踪：本文档能力映射到 BR-001～003（幂等/数据质量/迟到重算）、SYS-MON-001～008（采集恢复）、TOOL-001～009（错误映射/健康状态）、§13/§14/§15 横向能力（完整追踪表见 DOC-18）。

## 附录 A：版本与文档状态

| 版本 | 状态 | 说明 |
| ---- | ---- | ---- |
| V1.0-Baseline | Frozen | 冻结基线，开发启动依据 |

本文档已冻结，基线版本 `V1.0-Baseline`，作为开发启动依据。

**文档结束。**