# DSH 企业级风险监控 Agent V1 安全与多租户设计规格

| 文档属性 | 内容 |
| -------------- | ------------------------------------------ |
| 文档编号 | DSH-RISK-SECURITY-V1 |
| 文档名称 | DSH 企业级风险监控 Agent V1 安全与多租户设计规格 |
| 版本 | V1.0-Baseline |
| 文档状态 | 已冻结（Frozen） |
| 前置输入 | DOC-01（DSH-RISK-SRS-V1，V1.3-Review）；DOC-02（总体架构与模块设计）；DOC-06（DTO 与数据模型规格）；另对 DOC-07（Ports 与 Repository 契约，租户约束/Secret/Masking Port 签名）与 ADR-008（多租户和安全边界）保持一致性引用 |
| 下一环节 | DOC-13（可观测性：脱敏日志与审计分离）、DOC-14（配置）、DOC-15（测试与验收：Security Test）、DOC-16（DSH 适配：身份/租户映射）、DOC-17（部署：Secrets 目录与运行权限） |
| 适用范围 | DSH 风险监控 Agent V1 插件工程 |
| 技术基线 | DeepSeek Harness 工作树 live 源码（以源码核验为准） |
| 核验快照 | fcc0ad46（2026-11-04 核验时点，不构成基线锁定） |

## 1. 文档概述

### 1.1 编写目的

本文档定义 V1 风险监控 Agent 的横切安全与多租户规格：租户身份与信任边界、租户数据隔离、认证与授权分离、敏感字段分类与脱敏编排、Secret 管理、采集/配置/审计安全、运行时最小权限，以及威胁模型与安全边界。

本文档是 DOC-01 §10.2（敏感字段与脱敏）、§12（多租户与安全）、§17.2（安全性）、§19.3（运行权限）的落实，也是 DOC-02 §10「安全与脱敏」关注点与 ADR-008 的展开。字段级 DTO 由 DOC-06 定义，方法/Port 签名由 DOC-07 定义，本文档只定义其必须满足的安全行为与编排。

### 1.2 边界声明

| 主题 | 归属 |
| ---- | ---- |
| 租户模型、信任边界、数据隔离、跨租户访问/威胁关联授权 | 本文档 |
| 认证与授权分离、授权决策点、最小权限 | 本文档 |
| 敏感字段分类与脱敏编排、Secret 管理、采集/配置安全、审计范围与 fail-closed | 本文档 |
| 威胁模型与安全边界 | 本文档 |
| `TenantContext` / `AuditRecord` / `SecretReference` / `MaskingPolicy` 字段级定义 | DOC-06 §4.6/§6.10/§6.11 |
| Repository 租户约束与方法签名、Secret/Masking/采集 Port 签名 | DOC-07 §2.2/§3/§4 |
| 结构化错误类型（含 `AuthorizationError`） | DOC-11 §3 |
| 脱敏后的结构化日志与 Trace 归因落地 | DOC-13 |
| 配置 Schema 与热更新机制 | DOC-14 |
| DSH 身份到租户身份的映射细节 | DOC-16 |

### 1.3 前置输入与依据

DOC-01 §10.2、§12、§17.2、§19.3、§4.2.11；DOC-02 §4/§6/§10（MOD-APP-015/014、MOD-DOM-001/013/015、MOD-INF-006/008、Secret Provider Port、Masking Port）；DOC-06 §3/§4.6/§6.10/§6.11（TenantId、TenantContext、AuditRecord、SecretReference、MaskingPolicy）；DOC-07 §2.2/§4（租户约束、Secret/Masking/采集 Port）；ADR-008。

### 1.4 术语

复用 DOC-01 §1.3、DOC-11 §1.4 术语，新增：

| 术语 | 定义 |
| ---- | ---- |
| TenantContext | 由可信 Application/Security 边界建立的租户可信上下文（DOC-06 §4.6） |
| Trust Boundary | 可信与不可信代码/数据之间的边界；本文档中位于 Plugin Adapter 与 Application/Security 层之间 |
| Secret Provider | 统一解析敏感凭证引用的 Port（`SecretProviderPort`，DOC-07 §4.5） |
| Data Masking Service | 统一脱敏编排服务（`MaskingPort` 的封装，MOD-INF-006） |
| fail-closed | 安全相关操作失败时拒绝/失败而非降级放行 |
| Authorization Decision Point | 授权决策点，统一判定某操作是否被允许 |

## 2. 安全设计目标与原则

1. **默认拒绝（deny by default）**：未经显式授权即拒绝，包括跨租户访问与缺租户归属的写入。
2. **租户隔离内建而非追加**：租户约束贯穿 Repository、存储分区与内存边界（ADR-008）。
3. **认证与授权分离**：身份可信是前提，授权是独立决策；二者不混同。
4. **最小权限**：运行账号、采集账号、文件访问权限分别控制，仅授予完成任务所需权限。
5. **秘密不落盘、不落日志**：认证凭据与密钥在采集/持久化/日志/Evidence 中一律删除，不以 hash 或掩码保留（DOC-01 §10.2）。
6. **敏感字段全程脱敏**：采集白名单过滤 + 各输出环节统一脱敏。
7. **重要操作全程审计**：审计记录 append-only、fail-closed，与业务日志分离。
8. **确定性、可审计**：安全判定由确定逻辑完成，不依赖 LLM；所有安全决策可追溯。

## 3. 多租户架构

### 3.1 租户模型与身份

- 租户是业务数据与风险数据的基本隔离边界（DOC-01 §12.1）。
- `TenantId` 为品牌化字符串（`Branded<string, 'TenantId'>`，DOC-06 §3），全局唯一，仅由 Security 边界产生/校验，禁止作为外部任意输入直接采用。
- 每个数据对象（Event、Task、Risk、Proposal、Notification、Report、Audit 等）均携带 `tenantId` 归属（DOC-06 各 DTO）。

### 3.2 信任边界与 TenantContext 建立

信任边界位于 Plugin Adapter（不可信入口）与 Application/Security 层之间。`TenantContext` 建立流程：

```
DSH ToolRunContext（DSH Runtime 身份/agent）
        │
   Plugin Adapter（不可信边界入口）
        │  将 DSH 上下文适配为 ToolExecutionContext（DOC-06 §4.7）
        ▼
   Security 边界（可信）
        解析 tenant 身份 → 构建 TenantContext{tenantId, timezone, configSnapshotRef}
        │
        ▼
   Use Case → Repository（全程携带 TenantContext）
```

约束：

1. `TenantContext` 仅由可信 Application/Security 边界建立（DOC-06 §4.6、DOC-07 §2.2）。
2. Tool 参数中传入的 `tenantId` 仅作范围提示，**不得**作为授权依据；最终租户以 `TenantContext.tenantId` 为准（DOC-01 §12.2、DOC-02 §7.3）。
3. 调用主体 `agentRef` 按 §5 脱敏后进入上下文；不得泄露明文身份到下方输出（DOC-06 §4.7）。
4. 缺租户归属的写入一律拒绝（fail-closed，DOC-07 §2.2）。

### 3.3 租户数据隔离

| 维度 | 隔离机制 |
| ---- | -------- |
| 存储 | 数据目录按租户分区 `data/tenants/{tenantId}/...`（DOC-02 §9.2） |
| Repository | 所有方法携带租户约束，禁止 `findById(id)`/`findAll()` 无租户入口（DOC-07 §2.2） |
| 内存/进程 | 单实例单进程（ADR-006），跨租户数据结构不共享、不回填；预留多实例需跨进程租户隔离（DOC-01 §17.4） |
| 配置 | 租户配置/数据源/采集模板按租户作用域隔离（DOC-14） |

### 3.4 跨租户访问与威胁关联

1. **跨租户访问**必须显式授权并留审计（DOC-01 §12.1）。
2. **跨租户威胁关联**（如不同租户命中同一攻击主体）必须先显式授权、再脱敏、后审计（DOC-01 §4.2.11）。
3. 携带 `affectedTenants?: TenantId[]`（DOC-06）的对象，其跨租户范围仅在显式授权后生效，否则拒绝或降级为单租户范围。
4. 跨租户操作全程写入审计记录（§9），不静默合并租户数据。

## 4. 认证与授权

### 4.1 认证与授权分离

认证（身份来源可信）与授权（操作是否允许）分离（ADR-008）：

- **认证**：由 DSH Runtime 的 agent/调用主体身份经 Security 边界映射为租户身份；V1 不建设独立账号体系。
- **授权**：Authorization Decision Point 在 Application/Security 层，基于 `TenantContext` 与操作目标判定。
- 越权或跨租户未授权统一抛 `AuthorizationError`（DOC-11 §3.2）。

### 4.2 授权决策点与最小权限

1. 每个业务操作在执行前经授权决策点判定；默认拒绝，白名单放行。
2. 授权结果进入审计；授权失败不留部分副作用。
3. Token 分发、人工干预（DOC-01 §9.10）、跨租户关联等高风险操作要求额外授权门槛与审批记录。

### 4.3 Tool 参数边界

Tool 入参中的 `tenantId`/`target` 等仅作范围提示或校验输入；安全性不依赖入参。Authorization 不得读取未经验证的 Tool 参数即授予权限（DOC-02 §7.3）。

## 5. 敏感字段与脱敏

### 5.1 敏感字段分类

敏感字段三类（DOC-01 §10.2 权威定义，DOC-06 §6.11 `SensitiveCategory`）：

| 类别 | 值 | 典型字段 |
| ---- | ---- | ---- |
| 认证凭据 | `CREDENTIAL` | 密码、验证码、Token、Cookie、Authorization、会话凭证 |
| 密钥 | `KEY` | 私钥、SSH 私钥内容、数据库/服务密码、API Key、证书私钥 |
| 个人可识别信息 | `PII` | 身份证号、手机号、银行卡号、地址、邮箱、真实姓名 |

### 5.2 脱敏算法与落点

| 类别 | 动作（`MaskingAction`） | 说明 |
| ---- | ---- | ---- |
| `CREDENTIAL` | `DELETE` | 采集/持久化/日志/Evidence 一律删除，不以 hash 或掩码保留 |
| `KEY` | `DELETE` | 同上 |
| `PII` | `HASH`（关联）/ `MASK`（展示） | 加盐单向 hash 仅用于跨记录关联与审计，禁明文；展示掩码（如 `138****5678`）不可反向还原 |

落点矩阵：

| 环节 | 处理 |
| ---- | ---- |
| 采集 | 字段白名单过滤，未获准字段丢弃 |
| 日志 / Trace | 不输出明文敏感字段（DOC-13） |
| Evidence | 关键输入快照脱敏（`keyInputSnapshot`，DOC-06） |
| 报告 / 通知 | PII 以 mask 或 hash 出现，凭证/密钥不出现 |
| 审计 | actor/PII 脱敏，凭证不落 |

### 5.3 Data Masking Service 编排

统一脱敏编排由 Data Masking Service（MOD-INF-006，封装 `MaskingPort`，DOC-07 §4.6）完成：

1. 输入按 `MaskingPolicy{category, action, config}`（DOC-06 §6.11）判定。
2. `CREDENTIAL`/`KEY` → `DELETE`，返回空占位；`PII` → 按用途 `hashPii(value, salt)` 或 `mask(value)`。
3. 各输出环节（采集、日志、Evidence、报告、通知、审计）统一调用，禁止各模块自行实现脱敏逻辑，避免口径漂移。
4. 未知字段默认按最严策略处理（deny by default）：无法归类且可能敏感时删除，不默认放行。

## 6. Secret 管理

### 6.1 Secret Provider 契约

凭证解析统一走 `SecretProviderPort`（DOC-07 §4.5）：

```ts
interface SecretProviderPort {
  resolve(ref: SecretReference): Promise<SecretValue>;
}
```

约束：

1. 凭证不得明文写入 YAML，统一以 `SecretReference{secretRef, provider}` 引用（DOC-06 §6.11）。
2. 凭证不落任何持久化介质；仅在注入点的进程内存短暂存在。
3. 日志不得输出 secret 内容（DOC-13）。
4. 需要凭证的 Use Cases（采集、通知）通过 Secret Provider 解析，不自行读取明文。

### 6.2 凭证存放与引用

| 凭证 | 存放 | 引用 |
| ---- | ---- | ---- |
| MySQL 账号 | Secret 机制 | `SecretReference` |
| SSH 私钥/口令 | Secret 机制 | `SecretReference` |
| 通知渠道（Webhook/SMTP/IM） | Secret 机制 | `SecretReference`（`NotificationChannelConfig` 中） |
| 加盐（PII hash） | Secret 机制 | 仅关联/审计用 |

### 6.3 采集与通知凭证

- 采集数据源配置的账号/密钥以 `SecretReference` 表达，`DataSource` 配置不落明文（DOC-01 §12.3）。
- 通知渠道配置包含「凭证存放位置」字段（DOC-01 §11.1），凭证走 Secret；投递 Adapter（MOD-INF-008）在调用时解析。

## 7. 采集安全

采集安全约束由 DOC-07 Port 约束 + DOC-01 §12.4 固化，本节汇总安全要求：

| 采集类型 | 安全要求 | Port |
| ---- | ---- | ---- |
| MySQL | 只读授权账号；表/字段白名单校验；参数化查询；禁止任意 SQL；查询超时与结果上限 | `MySqlCollectorPort`（DOC-07 §4.1） |
| SSH | 受控账号；Host Key 校验；命令模板白名单 + 参数白名单；禁止外部输入直接拼接 Shell；连接/执行超时；输出长度/并发限制 | `SshCollectorPort`（DOC-07 §4.2） |
| 日志解析 | 敏感字段过滤；字段白名单；多行堆栈作为完整事件 | `LogCollectorPort`（DOC-07 §4.3） |

外部输入必须经过验证；Shell 命令禁止不安全拼接（DOC-01 §12.4）；命令执行留审计（DOC-07 §4.2）。

## 8. 配置安全

（配置 Schema 与热更新机制由 DOC-14 定义，本节只定安全要求）

1. 敏感配置（凭证、加盐密钥）安全保存，不落明文 YAML，走 Secret 机制（DOC-01 §12.3）。
2. 日志不得输出秘密内容。
3. 配置读取和修改应有审计（写入 §9 审计）。
4. 配置热更新必须校验权限与来源；越权修改拒绝并审计（DOC-01 §12.3）。

热更新读取 → 校验 → 不可变快照 → 原子切换 → 失败回退 Last Known Good 的流程不变（DOC-02 §7.5、DOC-14），安全要求叠加其上。

## 9. 审计

### 9.1 审计范围与事件

审计记录由 `AuditRecord`（DOC-06 §6.10）承载，经 `AuditRepository.append`（DOC-07 §3.10）写入，append-only、不提供删除/覆盖。

需审计的重要操作（至少覆盖）：

| 事件 | 记录内容 |
| ---- | ---- |
| 配置读写/热更新 | 操作者、对象、结果、来源 |
| 跨租户访问 / 威胁关联授权 | 授权决策、涉及租户、结果 |
| 采集账号/来源变更 | 变更前后（脱敏）、操作者 |
| 人工临时干预（重点关注/抑制/优先级） | 有效期、原因、操作者、审批（DOC-01 §9.10） |
| Secret 访问 | 引用标识（非明文）、调用方、时间 |
| 授权拒绝 | 拒绝原因、调用主体（脱敏）、目标 |
| Token 下发 / 失效 | 标识、租户、操作者 |

`AuditRecord` 必含：操作者/调用主体（脱敏）、租户、操作类型、操作对象、操作结果、来源信息、时间（DOC-01 §12.5、DOC-06 §6.10）。

### 9.2 fail-closed 语义

审计写入失败时，被审计的关键操作失败或拒绝继续，不得静默放行（fail-closed）；审计链断裂视为安全事件，记录到系统状态（DOC-07 §3.10、DOC-02 MOD-APP-014）。

### 9.3 Audit 与 App Log 分离

审计记录与业务应用日志分离存储、独立生命周期：

- 审计记录 append-only、不可删改，与业务事实同持久化域但独立分区。
- 业务应用日志不含明文敏感字段（凭证/密钥删除、PII 脱敏），审计记录中的 actor/PII 也脱敏。
- 二者职责分离，审计不以日志 grep 替代；日志的格式化/采集规则由 DOC-13 定义。

## 10. 运行权限与最小权限

1. 运行账号遵循最小权限原则（DOC-01 §19.3）。
2. SSH、MySQL、文件访问权限分别控制，互不混用。
3. 目录权限：Secrets 目录按最严权限（仅运行账号可读，`0600`）；数据目录按租户分区并限制写入口；日志/临时/备份目录分权限（DOC-02 §9.2）。
4. 采集账号只读；写权限不授予采集账号（DOC-07 §4.1）。
5. 权限提升或越界访问必须审计。

## 11. 威胁模型与安全边界

| 威胁 | 应对 |
| ---- | ---- |
| 模型注入伪造 `tenantId` 越租户 | `TenantContext` 由可信边界建立，Tool 入参不授权（§3.2） |
| Repository 无租户通用访问 | 禁止 `findById(id)`/`findAll()`，全方法带租户约束（DOC-07 §2.2） |
| 跨租户数据泄露 | 显式授权 + 脱敏 + 审计（§3.4） |
| 凭证明文落 YAML/日志 | Secret 机制 + DELETE 脱敏 + 日志过滤（§5/§6） |
| 命令/SQL 注入 | 参数化查询、命令模板白名单、禁止拼接（§7） |
| SSH 中间人 | Host Key 校验（§7） |
| 配置篡改 | 热更新权限校验 + 审计 + 失败回退（§8） |
| 审计缺失/篡改 | append-only、fail-closed、Audit 与 App Log 分离（§9） |
| 高权限运行账号 | 最小权限、SSH/MySQL/文件权限分离（§10） |

安全边界：

- **与 DSH 边界**：DSH Runtime 身份 → 应用租户身份映射（DOC-16 细化）；Plugin Adapter 为不可信入口。
- **与外部系统边界**：MySQL/SSH/通知渠道，凭证经 Secret 注入，命令/输入白名单。
- **与持久化边界**：缺租户归属写入拒绝，跨租户审计留痕。

## 12. 与下游文档边界

| 本文档输出 | 下游承接 |
| ---- | ---- |
| 脱敏后日志、审计/App Log 分离的日志格式化 | DOC-13（可观测性设计） |
| 秘密存放引用、加盐密钥、配置安全 | DOC-14（配置文件规格） |
| Security Test 用例（跨租户、注入、脱敏、Secret、审计） | DOC-15（测试与验收规格） |
| DSH 身份 → 租户身份映射、授权接入点 | DOC-16（DSH 适配设计规格） |
| Secrets 目录权限、运行账号最小权限、备份与恢复 | DOC-17（部署设计规格） |

需求追踪：本文档能力映射到 DOC-01 §10.2/§12/§17.2/§19.3、BR-001～003（跨租户威胁关联授权）、SYS-MON-001～008（采集安全）、TOOL-001～009（授权与审计）；模块映射至 MOD-APP-014/015、MOD-DOM-001/013/015、MOD-INF-006/008（完整追踪表见 DOC-18）。

## 附录 A：版本与文档状态

| 版本 | 状态 | 说明 |
| ---- | ---- | ---- |
| V1.0-Baseline | Frozen | 冻结基线，开发启动依据 |

本文档已冻结，基线版本 `V1.0-Baseline`，作为开发启动依据。

**文档结束。**