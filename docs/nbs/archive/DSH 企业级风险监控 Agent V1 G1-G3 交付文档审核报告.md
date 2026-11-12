# DSH 企业级风险监控 Agent V1 G1-G3 交付文档审核报告

| 文档属性 | 内容 |
| --- | --- |
| 报告类型 | 设计文档审核分析报告 |
| 审核对象 | DOC-02 ~ DOC-14 及 ADR（G1/G2/G3 三阶段全部交付内容） |
| 审核依据 | 仅限《DSH 企业级风险监控 Agent V1 需求规格说明书》（DOC-01）与《DSH 企业级风险监控 Agent V1 工程设计基线》 |
| 审核维度 | 内容一致性、逻辑统一性、完整性校验 |
| 审核日期 | 2026-11-11 |
| 报告状态 | 正式 |

---

## 1. 整体审核结论

**审核结论：通过（可冻结）。第一轮 11 项 + 5 项待优化项、第二轮 15 项（N-01~N-15）均已逐项核实整改闭环且无回归（见 §6、§8）；第三轮从零逐行重审新发现的 10 项问题（T-01~T-10，§9）已全部整改并经逐项核实到位（§10），其中高风险 T-01（ProposalOperation 跨文档枚举值域冲突、SUPERSEDE 被误列为显式操作）已收敛为四值 `SUBMIT/WITHDRAW/APPROVE/REJECT`、删除 `SUPERSEDE` 显式操作并统一幂等语义。T-01~T-10 整改后经复核无回归，满足 DOC-01 §22 冻结条件。**

- **完整性（文件层面）**：通过。G1（DOC-02~05，4 份）、G2（DOC-06~10，5 份）、G3（DOC-11~14，4 份）共 13 份 P0 设计文档与 ADR（ADR-001~015）均已产出，交付物清单（DOC-01 §22）中 G1/G2/G3 各编号均有对应文件，无阶段交付项缺失。
- **内容一致性与逻辑统一性（内容层面）**：通过。发现 **内容偏差 3 项、逻辑冲突 4 项、内容缺失 4 项**，其中高风险问题 2 项（DOC-09 基线规格缺失、DOC-14 并发预算数值偏离需求基准）、中风险问题 6 项。**已整改 11 项：D-01（高风险·基线规格补全）、D-02（高风险·并发预算回源）、D-03（中风险·DOC-21 悬空引用）、L-01（中风险·风险六态）、L-02（中风险·错误分类权威）、L-03（中风险·覆盖率状态收敛）、L-04（低风险·并发预算溯源）、M-01（中风险·枚举回写）、M-02（中风险·ProposalType 定义）、M-03（低风险·ConfigSnapshotRef 定义）、M-04（低风险·运行态/Security 枚举收口）。**已核实整改到位**（D-02 残留已补齐：DOC-14 §5.2 校验子句已同步 §4.12 字段口径）。
- **结论定位**：文档骨架完整、模块/状态机/DTO/契约主线自洽；第一轮 11 项内容问题及 5 项待优化项（§6）、第二轮 15 项问题（§7，含 DOC-07 Event Repository、DOC-06 枚举收口、DTO 字段、PREPARED 术语、ProposalType 依据等）均已整改闭环并核实到位（§8）。
- **第三轮（从零逐行重审）**：前两轮 26 项整改经复核无回归；新发现 10 项问题（§9）。高风险 T-01 为 `ProposalOperation` 跨文档枚举值域冲突（DOC-06 四值 `SUBMIT/WITHDRAW/APPROVE/REJECT` vs DOC-08 五值 `SUBMIT_REVIEW/WITHDRAW/APPROVE/REJECT/SUPERSEDE`，且 `SUPERSEDE` 被 DOC-08 错列为显式操作），冻结前必须整改；T-02~T-05 中风险（ErrorKind 取值口径、StructuredErrorBase 悬空、Baseline 三态在 G1 缺失、BaselineStatistics 悬空）、T-06~T-10 低风险需一并处理。**T-01~T-10 已全部整改并经逐项核实（§10）。**

---

## 2. 已发现问题分类明细

风险等级定义：**高**＝影响基线冻结或可能导致实现歧义/运行时约束失真的问题；**中**＝跨文档取值/权威不一致，需修订澄清；**低**＝表述性或属待优化范畴。

### 2.1 内容偏差（偏离需求/工程基准）

#### D-01 【G2 · DOC-09】「指标与基线规格」缺失基线（Baseline）规格

- **具体位置**：DOC-09《指标 DSL 规格》全文（文档编号 DSH-RISK-MDSL-V1，边界声明 §1.2 无 Baseline 归属行）。
- **问题描述**：DOC-01 §22 将 DOC-09 命名为「指标与基线规格」，覆盖「指标 + 基线」两部分；《工程设计基线》§7.2 亦明确「Baseline Engine 独立于普通 Metric Engine」。但实际交付件仅覆盖 Metric DSL（语法/AST/聚合/窗口/数据质量/金额），**Baseline 的权威规格缺失**——基线候选/激活/冻结状态机、最小样本量判定、统计量算法（STDDEV / PERCENTILE / ZSCORE）的正式定义均无独立归属，仅在 DOC-06 §6.3（Baseline DTO：`BaselineState = Candidate/Active`）、DOC-10 §6（`BaselineMethod`）、DOC-14 §4.7（`baselines/*.yml` 装载）中被零散引用。DOC-10 §6 的动态阈值依赖基线统计量，却无基线规格承接其算法语义。
- **对应依据**：DOC-01 §22（交付物名称「指标与基线规格」）；《工程设计基线》§7.2；DOC-10 §6（`baseline`/`method`/`factor` 引用）。
- **风险等级**：高
- **整改状态**：已整改（2026-11-11）。方案 A：DOC-09 重构为「指标与基线规格」（编号 `DSH-RISK-METRIC-BASELINE-V1`），新增 §15 Baseline Spec（状态机 `Candidate/Active/Frozen`、`minSampleSize` 判定、STDDEV/PERCENTILE/ZSCORE 算法、滚动更新）；回写 DOC-06 §6.3/§9、DOC-10 §6、DOC-14 §4.7，并将文件重命名为「指标与基线规格」。

#### D-02 【G3 · DOC-14】并发预算数值与分层结构与需求基准 §14.5 不符

- **具体位置**：DOC-14 §4.12「并发预算（concurrencyBudget）」。
- **问题描述**：DOC-14 定义的 `concurrencyBudget` 为 6 分层 + 2 项（global=16 / collection=8 / metric=4 / rule=4 / notification=4 / report=2 / queueBacklog=1024 / tenantFairness=4），与 DOC-01 §14.5 的初始建议值（全局 Task=8 / Workflow=4 / Workflow 节点=3 / Collection=3 / Metric=2 / Rule=2 / Notification=2 / Report=1 / 单租户 Task=3 / 单数据源采集=2，共 10 项分层）相比：**数值成倍放大（global 16 vs 8、collection 8 vs 3、metric 4 vs 2 等）、分层结构不一致（缺失 Workflow/Workflow 节点/单数据源采集 三层，新增 queueBacklog/tenantFairness 两项）**。同时亦与 DOC-02 §8.3 / DOC-04 §7.1（沿用 DOC-01 的 8/4/3/3/2/2/2/1/3/2）产生跨文档冲突。由于 DOC-14 是配置 Schema 权威，其默认值即运行期资源约束来源，背离需求基准会直接造成容量参数失真。
- **对应依据**：DOC-01 §14.5（分层并发预算初始建议值）；DOC-02 §8.3；DOC-04 §7.1；DOC-14 §4.12。
- **风险等级**：高
- **整改状态**：已解决（2026-11-11；方案 A——DOC-14 §4.12 回源 DOC-01 §14.5，改为 10 项独立上限 8/4/3/3/2/2/2/1/3/2，删除 `tenantFairness`、`queueBacklog` 默认值改「待压测」、修正 §4.12 正文「≤ global」约束与溯源并加回源护栏；连带修复 DOC-13 §6.1 溯源。复核后补齐 §5.2 第 3 条残留，见 §6.2）。

#### D-03 【G2 · DOC-08】引用不存在的 DOC-21

- **具体位置**：DOC-08 §5「与下游文档边界与追踪」——「渲染契约（Host/Web）｜ DOC-21（客户端 UI）、MOD-APP-* 前端卡片」。
- **问题描述**：DOC-01 §22 交付物清单编号止于 DOC-19（DOC-18 为 RTM、DOC-19 为 TBD 登记表），全量不存在 DOC-20 / DOC-21。该引用为悬空/无效引用。
- **对应依据**：DOC-01 §22 交付物明细表（编号至 DOC-19）。
- **风险等级**：中
- **整改状态**：已整改（2026-11-11）。方案 A：DOC-08 §5 渲染契约行删除 DOC-21 悬空引用，改指 DOC-02 §3.3（渲染原则）+ 本文档 §2.5/§3.x（渲染契约规格）+ 前端实现（app 包）。

---

### 2.2 逻辑冲突（跨文档/跨模块自洽性）

#### L-01 【G1 · DOC-02】风险状态机「七态」vs「六态」冲突

- **具体位置**：DOC-02 §1.2 写作「状态机（风险**七态**、Proposal 七态等）」。
- **问题描述**：风险状态机权威定义为 DOC-03 §7.1 的六态（`Pending / Normal / Triggered / Ongoing / Recovered / Unknown`），DOC-01 §9.4 与 DOC-06 §9（`RiskCycleStatus`）均为六态。DOC-02 §1.2 的「风险七态」为错误表述。
- **对应依据**：DOC-02 §1.2；DOC-03 §7.1/§9；DOC-01 §9.4；DOC-06 §9。
- **风险等级**：中
- **整改状态**：已解决（2026-11-11；方案 B——删除 DOC-02 §1.2 冗余状态数，状态数量唯一权威收敛至 DOC-03 §7.1 六态）。

#### L-02 【G1 · DOC-02】错误分类权威指向分叉

- **具体位置**：DOC-02 §7.4（「错误分类见 DOC-01 §15；具体映射由 DOC-16 定义」）vs DOC-02 §4.5（MOD-SHR-003「结构化错误类型（对齐 DOC-11）」）、DOC-02 §10（「错误处理 → DOC-11」）。
- **问题描述**：下游文档统一以 DOC-11 §3 为错误分类与结构化错误类型的权威（DOC-07 §2.7、DOC-13 §3/§5.4、ADR-011），但 DOC-02 §7.4 却指向 DOC-01 §15 + DOC-16 映射。同一文档内部「错误分类权威归属」自相矛盾，易导致「以哪份为错误分类唯一权威」的歧义。
- **对应依据**：DOC-02 §7.4 vs §4.5/§10；DOC-11 §3；DOC-07 §2.7；ADR-011。
- **风险等级**：中
- **整改状态**：已解决（2026-11-11；将 DOC-02 §7.4「错误分类见 DOC-01 §15」更正为「错误分类见 DOC-11 §3」，DSH Response 映射仍归 DOC-16）。

#### L-03 【G3 · DOC-13】监控覆盖率状态取值三套并存

- **具体位置**：DOC-13 §6.2 覆盖率状态表（未配置/已配置/运行中/失败/失联，5 态）。
- **问题描述**：DOC-13 §6.2 声称「状态至少区分（**DOC-01 §5.6 继续沿用**）」，但实际列出的 5 态（未配置/已配置/运行中/失败/失联）与 DOC-01 §5.6 / DOC-03 §6 的六态（未配置/未启用/采集失败/数据过期/规则缺失/正常）不一致；同时 DOC-08 §3.9（TOOL-009 `coverage` 输出）又使用 `{configured, enabled, normal, degraded}` 四字段表示。覆盖率状态在前述三处存在三套取值，无法对齐。
- **对应依据**：DOC-13 §6.2；DOC-01 §5.6；DOC-03 §6；DOC-08 §3.9。
- **风险等级**：中（偏向「高」，因涉及健康汇总 TOOL-009 输出口径）
- **整改状态**：已解决（2026-11-11；DOC-13 §6.2 覆盖率状态由自创 5 态回源为 DOC-03 §6 `MonitoringCoverage` 六态；DOC-08 §3.9 补 `coverage` 四桶计数与六态的派生映射）。

#### L-04 【G2/G3 · DOC-13、DOC-14】并发预算错误引用 DOC-05 §7.1

- **具体位置**：DOC-13 §6.1（「抽象维度沿用 **DOC-05** 的分层并发预算」）；DOC-14 §4.12（「DOC-05 §7.1」）。
- **问题描述**：分层并发预算的实际载体是 DOC-02 §8.3 与 DOC-04 §7.1；DOC-05（端到端数据流设计）中并不存在并发预算章节。DOC-13、DOC-14 均错误引用 DOC-05 §7.1，造成溯源断裂。
- **对应依据**：DOC-13 §6.1；DOC-14 §4.12；DOC-02 §8.3；DOC-04 §7.1。
- **风险等级**：低
- **整改状态**：已解决（2026-11-11；DOC-13 §6.1、DOC-14 §4.12 并发预算溯源改指 DOC-02 §8.3 / DOC-04 §7.1）。

---

### 2.3 内容缺失（必填内容/权威定义遗漏）

#### M-01 【G1 · DOC-03】枚举权威表缺 TaskType / DeliveryStatus / NotificationKind

- **具体位置**：DOC-03 §6「枚举全集」（自称「本文档是枚举的权威定义处」）。
- **问题描述**：DOC-03 §6 缺失 `TaskType`（`COLLECT_BUSINESS_DATA / COLLECT_SYSTEM_METRICS / COLLECT_APPLICATION_LOGS`）、`DeliveryStatus`（`PENDING / SENT / FAILED / UNKNOWN`）、`NotificationKind`（`RISK_NOTIFICATION / MAINTENANCE`）三项；而 DOC-06 §9 末尾明确标注「TaskType/DeliveryStatus/NotificationKind 首次于本文档定值，**需回写 DOC-03 §6**」。该回写至今未完成，导致「枚举权威定义处」名实不符。
- **对应依据**：DOC-03 §6；DOC-06 §9（第 1301 行回写标注）。
- **风险等级**：中
- **整改状态**：已解决（2026-11-11；DOC-03 §6 补回 TaskType/DeliveryStatus/NotificationKind 三枚举，DOC-06 §9 尾注移除悬空「需回写」承诺）。

#### M-02 【G2 · DOC-06】ProposalType 引用但未定义取值

- **具体位置**：DOC-06 §6.7（`ActionProposal.type: ProposalType`）与 §9 枚举全集。
- **问题描述**：`ActionProposal` DTO 使用 `type: ProposalType`，但全文（含 §9 枚举全集）未给出 `ProposalType` 的取值定义。而 DOC-01 §10.3 中 SUPERSEDED 的判定依赖「同一 RiskEvent + **Proposal 类型** + 适用对象」，该类型缺失将导致该状态转换规则无法落地。
- **对应依据**：DOC-06 §6.7；DOC-01 §10.3（SUPERSEDED 判定依赖 Proposal 类型）。
- **风险等级**：中
- **整改状态**：已整改（2026-11-11）。方案 A：定义 `ProposalType = SUPPRESS / ESCALATE / NOTIFY`（3 值，依据 DOC-01 §5.7），回写 DOC-06 §6.7/§9、DOC-03 §6。

#### M-03 【G2 · DOC-06】ConfigSnapshotRef 被引用但未定义类型

- **具体位置**：DOC-06 §4.6（`TenantContext.configSnapshotRef?: ConfigSnapshotRef`）。
- **问题描述**：`ConfigSnapshotRef` 作为品牌化类型被引用（《工程设计基线》及 DOC-14 §6.1 均视其为「品牌化字符串」），但 DOC-06 全文未给出其 `interface`/类型别名，字段表中实际回落为 `string?`，与 §3 品牌化 ID 目录未收录该类型一致。
- **对应依据**：DOC-06 §4.6；DOC-14 §6.1。
- **风险等级**：低
- **整改状态**：已整改（2026-11-11）。方案 A：§3 品牌化 ID 目录收录 `ConfigSnapshotRef`（底层 string，指向 DOC-14 §6.1）；§4.6/§6.2 字段表类型由 `string`/`string?` 统一为 `ConfigSnapshotRef`（详见 §2.3 M-03）。

#### M-04 【G2 · DOC-06】枚举全集未收录 §7.3 运行态枚举

- **具体位置**：DOC-06 §9「枚举全集」vs §7.3。
- **问题描述**：DOC-06 §9 自述「枚举全集」，但 `TaskStatus`（`PENDING/QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED/TIMED_OUT`）、`WorkflowStatus`、Stage 状态（`PENDING/RUNNING/SUCCEEDED/FAILED/SKIPPED`）仅在 §7.3 定义、未收进 §9；`SensitiveCategory`（CREDENTIAL/KEY/PII）、`MaskingAction`（DELETE/HASH/MASK）被 §6.11 引用亦未收进 §9。全表名实不副。
- **对应依据**：DOC-06 §9 vs §7.3、§6.11。
- **风险等级**：低
- **整改状态**：已整改（2026-11-11）。方案 A：§9 补 5 收口行（`TaskStatus`/`WorkflowStatus`/`StageStatus`/`SensitiveCategory`/`MaskingAction`）；§7.3 Stage 补类型名 `StageStatus`（对齐 Task/Workflow 对称）；§9 尾注权威分层修正（运行态→DOC-04 §6.1/§6.2，Security→DOC-01 §10.2）（详见 §2.3 M-04）。

---

## 3. 待优化项说明

以下不属于必须阻断的缺陷，但建议在后续修订中一并处理，避免累积为一致性隐患：

1. **命名规则张力（DOC-03 §6）**：DOC-03 §6 声明「风险相关用 CamelCase，其余枚举用 UPPER_SNAKE」，但同为「风险评分等级」的 `Severity`（INFO/LOW/…）与 `ProposalStatus`（GENERATED/…）却采用 UPPER_SNAKE。建议显式说明 Severity/ProposalStatus 属「其余枚举」的例外，或调整措辞。（已处理，2026-11-11）
2. **「金额类」类型语义衔接**：DOC-06 以 `value 按 MetricType 区分金额类/Money` 表述，但 MetricType 六值无「金额」类型；DOC-09 已用独立 `valueEncoding = MONEY` 机制闭环。两处表述口径需统一，避免实现歧义。（已处理，2026-11-11：DOC-06 §6.3 改「按 valueEncoding 区分」，与 DOC-09 §4.4 正交模型对齐）
3. **并发预算 TBD 挂载不对称**：DOC-04 §7.1 标注「最终值以压测为准（DOC-01 TBD-002）」，DOC-02 §8.3 未挂 TBD-002 引用，建议对齐。（已处理，2026-11-11）
4. **Proposal EXPIRED 默认超时未配置化**：DOC-01 §10.3「默认 72 小时」属可配置超时阈值，DOC-14 未见对应配置项（如 `proposal.expiryTimeout`），建议在 DOC-14 §4 补入。**（已整改，2026-11-11：DOC-14 §4.1 补 `proposal.expiryTimeout` = `72h`，消费方为定时任务置 EXPIRED）**
5. **ADR 编号持续增长属正常**：《工程设计基线》§16 建议先建 ADR-001~010，实际 ADR 文档已推进至 ADR-015，符合「随决策贯穿全程追加」定位，非缺陷，仅提示基线文档与 ADR 文档的编号清单需在冻结时对齐同步。

---

## 4. 最终审核建议

1. **阻断性修订（冻结前必须完成）**：
   - **D-01（DOC-09 基线规格）**：补齐 Baseline Engine 规格（候选/激活/冻结状态机、最小样本量判定、STDDEV/PERCENTILE/ZSCORE 统计量算法、基线版本推进），并明确其与 Metric Engine、DOC-10 动态阈值的调用关系；或将 Baseline 规格从 DOC-09 中正式拆分为独立章节并保持交付物编号对应关系。（已整改，2026-11-11）
   - **D-02（DOC-14 并发预算）**：使 `concurrencyBudget` 的分层结构与数值回源对齐 DOC-01 §14.5（或经显式 ADR 记录变更依据后，在 DOC-01 与 DOC-02/DOC-04/DOC-14 四处统一取值），禁止多套参数并存。**（已完成）**
2. **一致性修订（冻结前完成）**：L-01（风险六态，已完成）、L-02（错误分类权威统一至 DOC-11 §3，已完成）、L-03（覆盖率状态统一取值并回写 TOOL-009 输出，已完成）、M-01（DOC-03 §6 回写三枚举，已完成）、D-03（修正 DOC-21 悬空引用，已完成）、M-02（定义 ProposalType，已完成）。
3. **低风险完善（可随主线一并处理）**：L-04（并发预算引用改指 DOC-02/DOC-04，已完成）、M-03（定义 ConfigSnapshotRef，已完成）、M-04（§9 收口运行态/Security 枚举，已完成）及所有「待优化项」。
4. **追踪闭环**：所有涉及枚举/状态/配置项取值的问题，建议登记入 DOC-19（TBD 总登记表）或通过 ADR 记录决策，确保「编号/取值唯一权威」可追溯。

修订完成后，本报告建议作为下一轮审核的输入，重点复核上述 11 项问题的整改情况，确认无误后方可进入 DOC-01 §22 所述的「开发启动前冻结」阶段。

---

## 5. 整改记录

| 编号 | 状态 | 整改日期 | 整改说明 |
| ---- | ---- | ---- | ---- |
| D-01 | 已整改 | 2026-11-11 | 方案 A：DOC-09 重构为「指标与基线规格」，新增 §15 Baseline Spec，回写 DOC-06/10/14（详见 §2.1 D-01） |
| D-02 | 已整改 | 2026-11-11 | 方案 A：DOC-14 §4.12 回源 DOC-01 §14.5（10 项独立上限），并补齐 §5.2 校验子句字段口径（详见 §2.1 D-02、§6.2） |
| D-03 | 已整改 | 2026-11-11 | 方案 A：DOC-08 §5 删除 DOC-21 悬空引用，改指 DOC-02 §3.3 + 本文档 §2.5/§3.x + 前端实现（详见 §2.1 D-03） |
| M-02 | 已整改 | 2026-11-11 | 方案 A：定义 ProposalType = SUPPRESS/ESCALATE/NOTIFY，回写 DOC-06 §6.7/§9、DOC-03 §6（详见 §2.3 M-02） |
| M-03 | 已整改 | 2026-11-11 | 方案 A：§3 收录 ConfigSnapshotRef，§4.6/§6.2 字段表统一为 ConfigSnapshotRef（详见 §2.3 M-03） |
| M-04 | 已整改 | 2026-11-11 | 方案 A：§9 补 TaskStatus/WorkflowStatus/StageStatus/SensitiveCategory/MaskingAction，Stage 补 StageStatus，尾注权威分层（详见 §2.3 M-04） |

> 新增整改 D-01、D-02、D-03、M-02、M-03、M-04。其余已标记「已完成」项见 §4（L-01、L-02、L-03、L-04、M-01）。第二轮复核结论见 §6：11 项内容问题已全部核实整改到位（D-02 的 §5.2 残留已补齐）。

---

## 6. 整改验证结果（第二轮复核）

本报告依据整改声明，对 §2 全部 11 项问题与 §3 全部 5 项待优化项逐项复核了实际交付文档，结论如下。

### 6.1 问题整改逐项验证

| 编号 | 验证结论 | 复核位置（证据） |
| ---- | ---- | ---- |
| D-01 | 已修复 | DOC-09 已重命名「指标与基线规格」（编号 DSH-RISK-METRIC-BASELINE-V1），新增 §15 Baseline Spec：状态机 Candidate/Active/Frozen（§15.2）、minSampleSize 判定（§15.3）、STDDEV/PERCENTILE/ZSCORE 算法（§15.4）、滚动更新（§15.5）、与 Metric Engine 调用关系（§15.6） |
| D-02 | 已修复 | DOC-14 §4.12 已改 10 项独立上限（globalTask=8/workflow=4/workflowNode=3/collection=3/metric=2/rule=2/notification=2/report=1/perTenantTask=3/perDataSourceCollection=2，queueBacklog=待压测），已删 `tenantFairness`；§5.2 第 3 条校验子句已同步为 `perTenantTask ≤ globalTask`、`perDataSourceCollection ≤ collection`、`backoffMaxMs ≥ backoffBaseMs` |
| D-03 | 已修复 | DOC-08 §5 渲染契约行已删除 DOC-21，改指 DOC-02 §3.3 + 本文档 §2.5/§3.x + 前端实现（497 行） |
| L-01 | 已修复 | DOC-02 §1.2 边界声明已删除「风险七态」，写作「风险状态机、Proposal 状态机」（29 行） |
| L-02 | 已修复 | DOC-02 §7.4 已改为「错误分类见 DOC-11 §3；具体映射由 DOC-16 定义」（300 行） |
| L-03 | 已修复 | DOC-13 §6.2 覆盖率状态已回源 DOC-03 §6 六态（未配置/未启用/采集失败/数据过期/规则缺失/正常，231-242 行）；DOC-08 §3.9 已补 coverage 四桶计数与六态派生映射（455-468 行） |
| L-04 | 已修复 | DOC-13 §6.1（212 行）与 DOC-14 §4.12（226 行）并发预算溯源均已改指 DOC-02 §8.3 / DOC-04 §7.1 |
| M-01 | 已修复 | DOC-03 §6 已补 TaskType（276 行）/DeliveryStatus（285 行）/NotificationKind（286 行）；DOC-06 §9「需回写 DOC-03」尾注已删除 |
| M-02 | 已修复 | DOC-06 定义 ProposalType=SUPPRESS/ESCALATE/NOTIFY（§6.7=1043 行、语义 1056 行、§9=1290 行）；DOC-03 §6 已收录（287 行） |
| M-03 | 已修复 | DOC-06 §3 品牌化 ID 目录收录 ConfigSnapshotRef（182 行），§4.6/§6.2 字段表类型统一为 ConfigSnapshotRef（241/490 行） |
| M-04 | 已修复 | DOC-06 §9 已补 TaskStatus/WorkflowStatus/StageStatus/SensitiveCategory/MaskingAction（1302-1306 行）；§7.3 Stage 补类型名 StageStatus（517/1213 行）；§9 尾注修正权威分层（1308 行） |

### 6.2 复核新发现问题（D-02 整改残留，已解决）

- **定位**：DOC-14 §5.2「业务校验与引用完整性」第 3 条一致性规则（289 行）。
- **问题**：该子句仍写作「并发预算分层之和 ≤ global；`tenantFairness` ≤ global；`backoffMaxMs ≥ backoffBaseMs`」，其中：① `tenantFairness` 已在 §4.12 删除（更名 `perTenantTask`）；② `global` 已更名 `globalTask`；③「分层之和 ≤ global」与 §4.12 正文「10 项均为不同维度的独立上限……不存在『各层之和 ≤ global』的约束」（228 行）直接自相矛盾。
- **定性**：D-02 整改未彻底——§4.12 正文已正确回源，但同一文档 §5.2 校验子句未同步，属逻辑冲突类残留。
- **风险等级**：低（配置校验子句失真，不影响 §4.12 Schema 默认值这一主约束，但会导致校验实现按错误规则执行）。
- **整改结果**：已按建议将 §5.2 第 3 条改写为「`perTenantTask ≤ globalTask`、`perDataSourceCollection ≤ collection`、`backoffMaxMs ≥ backoffBaseMs`」，删除「各层之和 ≤ global」与 `tenantFairness` 表述。D-02 残留清零。

### 6.3 待优化项验证

| 待优化项 | 验证结论 | 复核位置（证据） |
| ---- | ---- | ---- |
| ① 命名规则张力 | 已处理 | DOC-03 §6 已显式声明「仅 RiskCycleStatus 用 CamelCase，其余枚举（含 Severity、ProposalStatus）用 UPPER_SNAKE」（264 行） |
| ② 金额类类型口径 | 已处理 | DOC-06 已改「值由 valueEncoding 决定，与 MetricType 正交」（653/670/679 行） |
| ③ TBD-002 挂载对称 | 已处理 | DOC-02 §8.3 已补「最终值以压测为准（DOC-01 TBD-002）」（325 行） |
| ④ Proposal EXPIRED 超时配置化 | 已整改 | DOC-14 §4.1 已补 `proposal.expiryTimeout`=72h（129 行） |
| ⑤ ADR 编号对齐 | 符合 | ADR 文档已推进至 ADR-015，冻结时与《工程设计基线》§16 编号清单对齐即可 |

### 6.4 复查结论

11 项内容问题已全部核实整改到位（D-02 的 §4.12 主约束与 §5.2 校验子句均已回源一致）；5 项待优化项均已处理。**注**：本节为针对第一轮问题的定向复核；随后以同一基准开展的「从零逐行全量重审」另发现新问题，结论见 §7。

---

## 7. 第二轮全量逐行重审结果（从零复核）

本轮以 DOC-01（需求规格说明书）与《工程设计基线》为唯一基准，对 13 份交付文档与 ADR 做从零逐行重审（非针对第一轮 11 项的定向复核）。第一轮 11 项整改未发现回归；本轮**新发现以下问题**，编号以 N- 前缀区分。

### 7.1 中/中高风险问题（需整改）

#### N-01 【中高 · DOC-07】Event 域 Repository 悬空缺失

- **位置**：DOC-07 §2.6（L102）声明「幂等键命中查询 `findByIdempotencyKey` 见 §3（Event/Collection Repository）」。
- **问题**：DOC-07 §3 实际仅有 Task/Collection、Metric、Baseline、Rule、RiskEvent、AttackEvent、RiskEventHistory、Proposal 等 Repository，**无 Event 域 Repository**（`EventMetadata`/`TransactionEvent`/`LoginEvent`/`ApiAccessEvent` 均无持久化契约）。L102 为文内悬空引用，且事件持久化端口缺失。
- **依据**：DOC-01 §7.9（事件元数据）、§13.2（Repository 契约）；DOC-07 §2.6 vs §3。
- **建议**：补充 Event Repository 端口（含幂等键查询），或更正 L102 引用指向实际存在的契约。
- **整改状态**：已整改（2026-11-11）。方案 A：DOC-07 §3 新增 Event 域 EventRepository（save/findById/findByIdempotencyKey/list，append-only 事件入径），§2.8 补 EventIdempotencyOutcome/EventQuery；§2.6 L102 指向随之成立。

#### N-02 【中 · DOC-06】枚举全集未收口 ValueEncoding / HttpMethod / ApiCategory / BusinessResult / ProposalOperation

- **位置**：DOC-06 §9「枚举全集」（L1279-1306）。
- **问题**：§9 自称「枚举值全集落地」，但未收录已在正文使用的 `ValueEncoding`（MONEY/COUNT/RATIO/DECIMAL，§2.2/§6.3）、`HttpMethod`、`ApiCategory`（含 UNKNOWN_API）、`BusinessResult`（§5.4 L370-401）、`ProposalOperation`（§10.7）。与已修复的 M-04 同类、但属新发现遗漏。
- **依据**：DOC-06 §9 vs §2.2、§5.4、§6.3、§10.7。
- **建议**：补 5 行收口，并标注权威归属（ValueEncoding → DOC-09 §4.4；HttpMethod/ApiCategory/BusinessResult → DOC-01 §4.3）。
- **整改状态**：已整改（2026-11-11）。方案 A：§9 补 5 行并定义取值（ValueEncoding=MONEY/COUNT/RATIO/DECIMAL；HttpMethod=GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS（其余 UNKNOWN）；ApiCategory=数据源配置驱动+UNKNOWN_API 兜底；BusinessResult=SUCCESS/FAILED/TIMEOUT/UNKNOWN；ProposalOperation=SUBMIT/WITHDRAW/APPROVE/REJECT）；尾注权威分层补充 ValueEncoding→DOC-09 §4.4、API 事件域→DOC-01 §4.3、ProposalOperation→DOC-03 §7.2。

#### N-03 【中 · DOC-06 / DOC-08】工具 DTO 字段跨文档不一致

- **位置**：`QueryRisksResult`（DOC-06 §10.6 L1386 vs DOC-08 §3.6 L321-324）；`ErrorResult`（DOC-06 §10.10 L1447 vs DOC-08 §4 L483-487）。
- **问题**：DOC-08 的 `QueryRisksResult` 多 `nextCursor?: string`（keyset 续页游标），`ErrorResult` 多 `fieldErrors?: {field; message}[]`，但 DOC-06 同 DTO 无此字段。同一 DTO 两处定义不一致。
- **依据**：DOC-06 §10.6/§10.10 vs DOC-08 §3.6/§4。
- **建议**：以 DOC-08（契约权威）为准回写 DOC-06，或明确字段归属。
- **整改状态**：已整改（2026-11-11）。方案 A：以 DOC-08 为契约权威回写 DOC-06——§10.6 `QueryRisksResult` 补 `nextCursor?: string`；§10.10 `ErrorResult` 补 `fieldErrors?: { field: string; message: string }[]`。

#### N-04 【中 · DOC-11】「PREPARED」一词三义且含义相反

- **位置**：DOC-11 §4.1（L192 `TransactionState`）、§4.3（L229/239 `JournalState`）、§4.5（L292 `CollectionCommit 三态`）。
- **问题**：`PREPARED` 在 Journal 中「persist 成功后标记 PREPARED」=**已落盘**（L239）；在 CollectionCommit 三态中「PREPARED = intent/prepare，未落盘」（L292）=**未落盘**；在 TransactionState（`INTENDED/PREPARED/DATA_PERSISTED/COMMITTED/ABORTED`）中含义介于二者、无统一说明。同一术语语义相反，易致实现误读。
- **依据**：DOC-11 §4.1/§4.3/§4.5；DOC-01 §7.8（Commit 三态 `PREPARED/DATA_PERSISTED/COMMITTED`）。
- **建议**：Journal/Transaction/CollectionCommit 三套状态机术语去重，避免复用 `PREPARED` 表达相反语义（如 Journal 改用 `PERSISTED`）。
- **整改状态**：已整改（2026-11-11；JournalState `PREPARED`→`PERSISTED`，DOC-11 5 处 + ADR-012 1 处，并补三台状态机术语边界说明）。

#### N-05 【中 · DOC-06】ProposalType 依据错挂 §5.7 且取值系新增

- **位置**：DOC-06 §6.7（L1056）「`ProposalType` 取值：SUPPRESS/ESCALATE/NOTIFY，依据 DOC-01 §5.7」。
- **问题**：DOC-01 §5.7 为「维护窗口」（抑制判定/升级/通知），并非 Proposal 类型定义；§10.3 仅列「Proposal 类型」字段而无枚举全集。`SUPPRESS/ESCALATE/NOTIFY` 三值为本轮新增，缺少权威依据，且与 DOC-01 §4.2.9/§4.3.9 罗列的处置建议类型（预警/审核/锁号/封禁 IP/限流/调查等）分类体系不完全对应。
- **依据**：DOC-01 §5.7、§10.3、§4.2.9、§4.3.9；DOC-06 §6.7。
- **建议**：在 DOC-01 回填 ProposalType 枚举全集，或经 ADR 记录取值决策；并改正 L1056 依据引用（指向 §10.3 而非 §5.7）。
- **整改状态**：已整改（2026-11-11）。方案 A：DOC-01 §10.3 回填 `ProposalType` 三值权威定义及与 §4.2.9/§4.3.9 处置建议的映射；DOC-06 §6.7 依据引用由 §5.7 改为 §10.3。

### 7.2 低风险问题（可随主线一并处理）

| 编号 | 文档 | 问题 | 建议 |
| ---- | ---- | ---- | ---- |
| N-06 | DOC-14 §1.3（L39） | 「DOC-12（Secret/采样）」归因错误（采样属 DOC-13 §5.4），与文档头 L9「DOC-12（Secret/脱敏）」自相矛盾 | 更正归因为 DOC-13（已整改 2026-11-11） |
| N-07 | DOC-10 | 标题/文件名「规则 DSL 规格」与 DOC-01 §22「规则与风险评分规格」命名不一致 | 统一标题（已整改 2026-11-11：DOC-10 标题/文件名改为「规则与风险评分规格」，编号 RDSL 保留，DOC-09 下一环节引用同步） |
| N-08 | DOC-06 §3（L166） | `BaselineId` 注释仅「Candidate/Active」缺 Frozen，与 §6.3/§9 三态不一致 | 补 Frozen（已整改 2026-11-11） |
| N-09 | DOC-06 §6.1/§6.5 | `Tenant.configRef` 裸 `string?`、`RiskSuppression.suppressionId` 裸 `string`，未品牌化 | 统一为品牌化类型（已整改 2026-11-11：§6.1/§6.2 `configRef`→`ConfigSnapshotRef`；§3 新增 `SuppressionId`，§6.5 `suppressionId`→`SuppressionId`） |
| N-10 | DOC-06 §10.7 | `ProposalOperation` 未覆盖全量合法转换（缺 GENERATED→WITHDRAWN 等） | 补全操作枚举或注明 EXPIRED 自动触发（已整改 2026-11-11：§10.7 补 operationType→合法源态→目标态映射表，并注明 SUPERSEDED/EXPIRED 为自动触发，不经 operationType） |
| N-11 | DOC-03 §4.2 | 「Step/Stage」混用（其余文档统一 Stage） | 统一为 Stage（已处理，2026-11-11） |
| N-12 | DOC-02 §4.3 | `MOD-DOM-016 Event` 与《工程基线》§3 domain 目录（无 event/）不对齐，且 DOC-02 声称目录与基线 §3 对齐 | 对齐目录（已处理，2026-11-11：方案 A——基线 §3 补 event/） |
| N-13 | DOC-08 §3.9 | coverage 映射引用 DOC-03 §6，而 DOC-06 §7.4 引 DOC-03 §6.1——章节号不一致 | 统一章节号（已整改 2026-11-11：DOC-06 §7.4 拆分为值域→DOC-03 §6、区分→DOC-03 §6.1） |
| N-14 | DOC-07 | `BaselineRepository` 仅 `findActive`/`findByVersion`，缺查询 Candidate/Frozen 状态的方法 | 补充查询方法（已整改 2026-11-11：补 `listByStatus(tenant, metricId, state: BaselineState)` 覆盖 Candidate/Frozen 查询） |
| N-15 | ADR | ADR-001~015 超出《工程基线》§16（建议先建 001~010），需在基线或 ADR 标注 011~015 为 G3 追加 | 冻结时对齐编号清单 |

### 7.3 复查结论

第一轮 11 项内容问题与 5 项待优化项整改均已核实、无回归；本轮从零逐行重审新发现 5 项中/中高风险问题（N-01~N-05）与 10 项低风险问题（N-06~N-15）。整改验证结果见 §8：15 项已闭环（N-01~N-12、N-14 完全整改，N-13 收敛为低风险说明性残留，N-15 为冻结时同步项），满足 DOC-01 §22 冻结条件。

---

## 8. 第二轮整改验证结果

对 §7 全部 15 项（N-01~N-15）逐项复核了实际交付文档，结论如下。

### 8.1 中/中高风险项验证（N-01~N-05）

| 编号 | 验证结论 | 复核位置（证据） |
| ---- | ---- | ---- |
| N-01 | 已修复 | DOC-07 新增 `EventRepository`（L436-440）：`save`/`findById`/`list`（PageResult<EventMetadata>），§2.6 幂等键查询已落地 |
| N-02 | 已修复 | DOC-06 §9 已补收口：ValueEncoding（L1308）/HttpMethod（L1309）/ApiCategory（L1310）/BusinessResult（L1311）/ProposalOperation（L1312） |
| N-03 | 已修复 | DOC-06 回填字段：`QueryRisksResult.nextCursor?`（L1395）、`ErrorResult.fieldErrors?`（L1469），与 DOC-08 §3.6/§4 对齐 |
| N-04 | 已修复 | DOC-11 `JournalState` 改用 `PERSISTED`（L229/233），新增术语边界说明「`Journal.PERSISTED` 等价 `TransactionState.DATA_PERSISTED`，`PREPARED` 全库唯一表示 prepare 完成尚未落盘」（L242） |
| N-05 | 已修复 | DOC-06 L1057 依据更正为「DOC-01 §10.3（Proposal 类型权威定义）」 |

### 8.2 低风险项验证（N-06~N-15）

| 编号 | 验证结论 | 复核位置（证据） |
| ---- | ---- | ---- |
| N-06 | 已修复 | DOC-14 文档头 L9、§1.3 L32/L39 采样归因统一为 DOC-13，Secret/脱敏归 DOC-12 |
| N-07 | 已修复 | 文件已重命名为「规则与风险评分规格.md」，与 DOC-01 §22 一致 |
| N-08 | 已修复 | DOC-06 §3 L166 `BaselineId` 注释补为「Candidate/Active/Frozen」 |
| N-09 | 已修复 | DOC-06 §3 收录 `SuppressionId`（L183），§6.5 `suppressionId: SuppressionId`（L928/940）；`configRef` 统一 `ConfigSnapshotRef`（L432/440） |
| N-10 | 已修复 | DOC-06 §9 定义 `ProposalOperation = SUBMIT/WITHDRAW/APPROVE/REJECT`（L1312），§10.7 补状态机映射（L1412） |
| N-11 | 已修复 | DOC-03 §4.2 L122 统一为「由多 Stage 构成的工作流」，消除 Step 混用 |
| N-12 | 已修复 | 基线 §3 `src/domain/` 已补 `event/`；DOC-02 §4 L134 将「物理目录与 §3 对齐」改为「仅 Domain 层 MOD-DOM-* 与 src/domain/ 一一对应，其余层为逻辑分组」的分层精确表述 |
| N-13 | 已收敛 | DOC-06 L1227 统一「各枚举值域权威见 DOC-03 §6」，「§6.1」仅用于生命周期区分，与 DOC-08 §3.9（DOC-03 §6）口径一致 |
| N-14 | 已修复 | DOC-07 `BaselineRepository` 新增 `listByStatus(…, state: BaselineState)`（L264），可查询 Candidate/Frozen |
| N-15 | 已修复 | 《工程设计基线》§16 编号清单已补齐 ADR-011~015（L698-702），与 ADR 文档 ADR-001~015 对齐 |

### 8.3 验证结论

第二轮 15 项问题（N-01~N-15）已全部闭环：N-01~N-12、N-14 完全整改；N-13 已收敛（章节口径统一）；N-15 已修复（《工程设计基线》§16 与 ADR 编号清单对齐至 ADR-015）。综合 §6（第一轮复核）与本节：两轮共 26 项问题全部闭环。**注**：本节为第一、二轮定向复核结论；随后以同一基准开展的第三轮从零逐行重审另发现新问题（T-01~T-10），冻结结论以 §9 为准。

---

## 9. 第三轮全量逐行重审结果（从零复核）

本轮在前两轮 26 项（第一轮 D/L/M 共 11 项 + 第二轮 N-01~N-15 共 15 项）已全部整改闭环、无回归的前提下，仍以 DOC-01（需求规格说明书）与《工程设计基线》为唯一基准，对 13 份交付文档与 ADR 再次从零逐行重审。前两轮问题未发现回归；本轮**新发现 10 项问题**（1 项高风险、4 项中风险、5 项低风险），编号以 T- 前缀区分。

> 复核排除项：DOC-04/DOC-05 属性表「前置输入」较 DOC-01 §22（DOC-04、DOC-05 的「主要前置输入」均仅列 DOC-02）多列 DOC-03/DOC-04——经核对，§22 列为「主要前置输入」（紧邻上游），而交付文档列全文输入，属粒度差异，不构成实质偏差，不记入问题。

### 9.1 高风险问题（冻结前必须整改）

#### T-01 【高 · DOC-06 / DOC-08】ProposalOperation 枚举值域跨文档冲突，SUPERSEDE 被误列为显式操作

- **位置**：DOC-06 §9（L1312）、§10.7（L1404/L1412/L1421）；DOC-08 §3.7（L357-362、L379）。
- **原文**：DOC-06 定义 `ProposalOperation = SUBMIT / WITHDRAW / APPROVE / REJECT`（4 值，L1312），且 §10.7 明确「追加新版本 → SUPERSEDED 由自动触发，不经 operationType」（L1421）；DOC-08 §3.7 却定义 `ProposalOperation = SUBMIT_REVIEW / WITHDRAW / APPROVE / REJECT / SUPERSEDE`（5 值，L357-362），将 `SUBMIT` 改名 `SUBMIT_REVIEW`、并把 `SUPERSEDE` 列为显式 operationType。
- **问题**：① 同一枚举在两份文档中值域不一致（4 值 vs 5 值）；② `SUBMIT` vs `SUBMIT_REVIEW` 命名不一致；③ 按 DOC-06 §10.7 / DOC-01 §10.3 / DOC-03 §7.2，「追加新版本（SUPERSEDED）」应由「追加新版本」事务自动触发，DOC-08 却将其列为用户可显式提交的 operationType，与状态机权威定义冲突；④ 连带 TOOL-007 请求 Schema（L352-355）仅含 `proposalId + operationType`，无法承载 L379 幂等语义所要求的「`SUPERSEDE` 需携带新版本内容上下文」，字段存在缺口。
- **依据**：DOC-01 §10.3（状态转换表 L1199-1206：`SUPERSEDED` 由「追加新版本」触发）；DOC-03 §7.2（Proposal 七态转换）；DOC-06 §10.7（L1421「自动触发，不经 operationType」）。
- **建议**：DOC-08 §3.7 删除 `SUPERSEDE` 操作、将 `SUBMIT_REVIEW` 改回 `SUBMIT`，与 DOC-06 §9/§10.7 的四值及 DOC-03 §7.2 状态机对齐；若「追加新版本」确需工具承载内容，则补齐请求 Schema 的新版本内容字段，否则删除 L379 的「携带新版本内容」表述并明确该转换由事件版本追加入径触发。
- **整改状态**：已整改（2026-11-11）。方案 A：DOC-08 §3.7 `ProposalOperation` 收敛为四值 `SUBMIT/WITHDRAW/APPROVE/REJECT`（`SUBMIT_REVIEW`→`SUBMIT`、删除 `SUPERSEDE`、`WITHDRAW` 注释补 GENERATED 源态）；L379 幂等语义改为「`SUPERSEDED` 由追加新版本事件版本追加入径自动触发，不经 `operationType`」。

### 9.2 中风险问题（需修订澄清）

#### T-02 【中 · DOC-06 / DOC-08 / DOC-11】ErrorResult.kind 取值口径三处不一致（类名 vs 类别名）

- **位置**：DOC-06 §10.10（L1466）；DOC-08 §4（L484）；DOC-11 §3.3（L124-126、L148）。
- **原文**：DOC-11 定义 `ErrorCategory = …'Persistence'|'ExternalDependency'|'Internal'`（类别名，L126），并在 L148 声明 `ErrorResult.kind`「取值与 ErrorCategory 对齐」；DOC-08 L484 `kind: ErrorKind; // …Persistence/ExternalDependency/Internal`（类别名，一致）；DOC-06 L1466 却写作 `kind: ErrorKind; // …Persistence/ExternalDependencyError/InternalError`（带 `Error` 后缀的类型名）。
- **问题**：`ErrorResult.kind` 的值域在 DOC-06（类型名 `ExternalDependencyError/InternalError`）与 DOC-08/DOC-11（类别名 `ExternalDependency/Internal`）之间不一致；同时 `ErrorKind` 与 `ErrorCategory` 两个名称并存且未说明等价关系，易致实现误读。
- **依据**：DOC-11 §3.3（`kind` 对齐 `ErrorCategory`）；DOC-06 §10.10；DOC-08 §4。
- **建议**：统一 `ErrorResult.kind` 的类型为 `ErrorCategory`（或显式 `type ErrorKind = ErrorCategory`），值域统一为九个类别名；DOC-06 §10.10 注释由类型名改回类别名。
- **整改状态**：已整改（2026-11-11；DOC-06 §10.10、DOC-08 §4 改用 `ErrorCategory`，值域统一为九类别名并指认 DOC-11 §3.3；DOC-11 §3.3 L148 补强「`...Error` 类名不进入 `kind` 值域」）。

#### T-03 【中 · DOC-11】StructuredErrorBase 基类悬空未定义

- **位置**：DOC-11 §3.3（L128-145）。
- **原文**：`interface StructuredError { category; code; message; tenantId?; retryable; cause? }`（L128-135），但紧随其后的九个错误类均 `class …Error extends StructuredErrorBase {}`（L137-145）。
- **问题**：`StructuredErrorBase`（九个错误类的父类）在 DOC-11 及全部交付文档中均无定义声明，唯一相近声明是 `interface StructuredError`。基类悬空使「结构化错误类型」这一全仓契约不可落地（类应 `extends` 抽象基类而非 interface，且空 `{}` 需要基类承载 category/code/message/retryable/cause 字段）。
- **依据**：DOC-11 §3.3 自定为「所有层统一使用」的结构化错误权威定义。
- **建议**：补定义 `abstract class StructuredErrorBase`（承载 `StructuredError` 的字段），或更正九处 `extends StructuredErrorBase` 为与 `interface StructuredError` 一致的关系（如 `implements StructuredError` 并声明字段）。
- **整改状态**：已整改（2026-11-11；方案 A——DOC-11 §3.3 补定义 `abstract class StructuredErrorBase extends Error implements StructuredError`，承载五字段并保留 Error 原型链，9 处 `extends` 消歧，category 由具体类构造时固定传入）。

#### T-04 【中 · DOC-02 / DOC-03 / DOC-05】Baseline 状态仅 Candidate/Active 两态，遗漏 Frozen；DOC-03 §6 枚举全集未收录 BaselineState

- **位置**：DOC-03 §4.3（L141）；DOC-02 §4.3（L158）；DOC-05 §2（L47）、§3.4（L104）、§5.5（L229）。
- **原文**：DOC-03「状态候选（Candidate）/ 生效（Active）」；DOC-02「基線管理编排（Candidate/Active、版本、样本量门槛、冻结）」；DOC-05「Baseline（Candidate/Active）」（三处）。
- **问题**：Baseline 权威三态已由上一轮 D-01 整改确立为 `Candidate/Active/Frozen`（DOC-09 §15.2、DOC-06 §6.3/§9 均已回写三态），但 G1 三份文档仍只登记两态、遗漏 `Frozen`；且 DOC-03 §6（枚举权威定义处）至今未收录 `BaselineState` 条目，与其「枚举权威定义处」名实不符；DOC-03 §6 大小写规则（仅 RiskCycleStatus 用 CamelCase、其余 UPPER_SNAKE）与 `BaselineState`（CamelCase）亦冲突。
- **依据**：DOC-09 §15.2 / DOC-06 §6.3 / §9（三态权威）；DOC-03 §6。
- **整改结果**：已按建议完成（2026-11-11）：DOC-03 §6 补 `BaselineState = Candidate/Active/Frozen`；DOC-02 §4.3、DOC-03 §4.3、DOC-05 §2/§3.4/§5.5 状态清单均补 `Frozen`、对齐三态；DOC-03 §6 命名规则补 `BaselineState` 为 CamelCase 例外。

#### T-05 【中 · DOC-06 / DOC-09】BaselineStatistics 类型悬空未定义

- **位置**：DOC-06 §6.3（L712、L724）；DOC-09 §1.2（L29）、§15。
- **原文**：`statistics?: BaselineStatistics;`（字段表注明「历史统计/移动平均/分时段」）。
- **问题**：`BaselineStatistics` 类型在 DOC-06 全篇及 DOC-09 §15（基线统计量权威）中均未给出结构定义，属悬空类型引用；DOC-09 §15 仅定义 `BaselineMethod`（STDDEV/PERCENTILE/ZSCORE）与算法，未定义承载统计量结果的 `BaselineStatistics`，使 `Baseline` DTO 的该字段无法落地。
- **依据**：DOC-06 §1.1（全文为 DTO 字段级规格权威）；DOC-09 §15。
- **建议**：在 DOC-06 §6.3 或 DOC-09 §15 补 `BaselineStatistics` 结构（如 mean/stddev/percentile/zscore/移动平均/分时段摘要等），消除悬空引用。
- **整改状态**：已整改（2026-11-11）。方案 A：DOC-06 §6.3 补 `BaselineStatistics` 结构（method/sampleSize/mean/stddev/percentile，对齐 DOC-09 §15.4 三方法）；`Baseline` 字段表 `statistics` 描述收敛为「基线统计量结果（对齐 DOC-09 §15.4）」。

### 9.3 低风险问题（可随主线一并处理）

| 编号 | 文档 | 问题 | 建议 |
| ---- | ---- | ---- | ---- |
| T-06 | DOC-11 §1.4（L54）vs §5.3（L346） | `IdempotencyOutcome` 态数表述内部不一致：§1.4 写「四/五态」、§5.3 写「五态」且实际列出 5 值 | §1.4 更正为「五态」（已整改 2026-11-11） |
| T-07 | DOC-13 §6.2（L231）、DOC-08 §3.9（L468） | 覆盖率类型名 `MonitoringCoverage`（CamelCase）作为代码类型被引用，但 DOC-03 §6 仅以中文「覆盖率状态」命名、无该类型定义 | 已处理（2026-11-11）：DOC-03 §6/§6.1 枚举名统一为 `MonitoringCoverage` |
| T-08 | DOC-10 §11.3（L227） | 多窗口示例用相对时长 `"start":"-PT10M"`/`"end":"PT0S"`，而 `TimeWindow.start/end` 为 `Instant`（绝对时刻，DOC-06 §2.2.3），类型语义冲突且 §8 未说明支持相对时长 | 明确相对时长语义（已整改 2026-11-11：DOC-10 §4 补 `RelativeWindow` 类型、`windows` 改为 `RelativeWindow[]`，§8 增「评估时换算为绝对 TimeWindow」说明） |
| T-09 | DOC-09 §15.8（L421-429） | 基线定义示例字段 `window/rollup/method/factor` 未落入 DOC-06 §6.3 `Baseline` DTO（仅 baselineId/tenantId/metricId/state/statistics/version/minSampleSize），字段口径缺口 | 明确字段分工（已整改 2026-11-11：DOC-09 §15.8 标注示例为「基线定义（配置）」并列出定义参数归属；DOC-06 §6.3 标注 Baseline 为「结果对象」并交叉引用） |
| T-10 | DOC-03 §3（L65-66） | Collection 域同时将 `CollectionTask` 与 `Task` 并列标记为两枚聚合根（◆），与 DOC-02 §4.3（无 CollectionTask 模块）、DOC-04 §4.1（「CollectionTask 用 Task 状态机执行生命周期」）的继承/组合关系未界定 | 已处理（2026-11-11）：CollectionTask 为 Task 特化、非独立聚合根，Task 为唯一聚合根 |

### 9.4 第三轮复查结论

结合 §6（第一轮复核）与 §8（第二轮复核）：前两轮 26 项问题已全部闭环、无回归。第三轮从零逐行重审另新发现 **10 项问题（T-01~T-10）**：高风险 **T-01**（ProposalOperation 跨文档枚举值域冲突、SUPERSEDE 被误列为显式操作）**已整改**；中风险 T-02~T-05（ErrorKind 取值口径、StructuredErrorBase 悬空、Baseline 三态在 G1 缺失、BaselineStatistics 悬空）**均已整改**（T-02 ErrorKind→ErrorCategory、T-03 StructuredErrorBase 补定义、T-04 Baseline 三态回补、T-05 BaselineStatistics 补结构）；低风险 T-06~T-10（IdempotencyOutcome 态数、MonitoringCoverage 枚举名、相对时长窗口、基线字段分工、CollectionTask 聚合根）**均已整改**。**第三轮 T-01~T-10 全部整改完成，定向复核结果见 §10（已通过，可冻结）。**

---

## 10. 第三轮整改验证结果（T-01~T-10 复核）

针对第三轮新发现的 T-01~T-10，逐项核对源文档当前内容，结论如下：

| 编号 | 风险 | 结论 | 验证要点 |
| ---- | ---- | ---- | ---- |
| T-01 | 高 | 已整改 | DOC-08 §3.7 `ProposalOperation` 收敛为四值 `SUBMIT/WITHDRAW/APPROVE/REJECT`，删除 `SUPERSEDE` 显式操作与 `SUBMIT_REVIEW`；请求 Schema 保留 `proposalId/operationType`；幂等语义改为「`SUPERSEDED` 由『追加新版本』事件版本追加入径自动触发，不经 `operationType`」，与 DOC-06 §9/§10.7、DOC-03 §7.2 一致 |
| T-02 | 中 | 已整改 | DOC-06 §10.10、DOC-08 §4 的 `ErrorResult.kind` 统一为 `ErrorCategory`（九个类别名），并指向 DOC-11 §3.3，消除类名/类别名混用 |
| T-03 | 中 | 已整改 | DOC-11 §3.3 补 `abstract class StructuredErrorBase extends Error implements StructuredError`（承载 category/code/message/tenantId/retryable/cause），九个错误类均 `extends StructuredErrorBase` |
| T-04 | 中 | 已整改 | DOC-03 §6 收录 `BaselineState = Candidate/Active/Frozen` 并修正大小写规则；DOC-02 §4.3、DOC-03 §4.3、DOC-05 §2/§3.4/§5.5 均补 `Frozen`，对齐三态 |
| T-05 | 中 | 已整改 | DOC-06 §6.3 新增 `BaselineStatistics` 结构定义（method/sampleSize/mean/stddev/percentile） |
| T-06 | 低 | 已整改 | DOC-11 §1.4 更正为「五态」，与 §5.3 一致 |
| T-07 | 低 | 已整改 | DOC-03 §6 收录 `MonitoringCoverage`（六态），DOC-13 §6.2 引用不再悬空 |
| T-08 | 低 | 已整改 | DOC-10 §11.3 窗口类型改为 `RelativeWindow[]`（ISO-8601 duration），§8 说明换算为绝对 `TimeWindow` `[t0+start, t0+end)` |
| T-09 | 低 | 已整改 | DOC-09 §15.8 补「字段口径」说明，明确基线定义（配置）与 `Baseline` DTO（结果对象）字段分工 |
| T-10 | 低 | 已整改 | DOC-03 §3 明确 `Task` 为唯一聚合根、`CollectionTask` 为「Task 特化（非独立聚合根）」 |

**附带提示（已处理，2026-11-11）**：DOC-08 §2.4 概览表「类别」列原使用类名风格，已统一为 `ErrorCategory` 类别名（`Validation/Authorization/NotFound/Conflict/Timeout/Cancellation/Persistence/ExternalDependency/Internal`），与 §4 及 DOC-11 §3.3 口径一致。

**验证结论**：T-01~T-10 全部整改到位、无回归；附带提示的类名风格瑕疵已一并统一为 `ErrorCategory` 类别名，无遗留问题。结合 §6、§8、§9、§10，四类问题（第一轮 D/L/M、第二轮 N、第三轮 T）均已闭环，满足 DOC-01 §22「开发启动前冻结」条件。

---

## 11. 冻结执行记录（2026-11-11）

经第三轮 T-01~T-10 全部整改并验证通过（§10）后，已正式冻结全部设计文档：

- **DOC-01（需求规格说明书）**：`V1.3-Review` → `V1.3-Baseline`，状态「已冻结（Frozen）」。
- **DOC-02~DOC-14（13 份 G1/G2/G3 设计文档）**：`V1.0-Draft` → `V1.0-Baseline`，状态「已冻结（Frozen）」。
- **ADR（ADR-001~015）**：`V1.0-Draft` → `V1.0-Baseline`，状态「已冻结（Frozen）」。
- **《工程设计基线》**：`V1.0-Draft` → `V1.0-Baseline`，架构状态「已冻结」。

已满足 DOC-01 §22「开发启动前必须冻结 DOC-01~DOC-14 与 ADR」条件，可进入开发阶段。

---

**报告结束。**