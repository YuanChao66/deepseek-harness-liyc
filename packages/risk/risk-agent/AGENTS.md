# AGENTS.md — DSH 企业级风险监控 Agent（risk-agent）

版本：V1.1 · 状态：生效中 · 上级规则以工作树 live 文件为准

本文件规定开发过程与工程约束。需求、契约、状态机与验收标准以 `docs/nbs/` 为准，本文件不复述，只提供索引（§7）。

## 1. 适用与优先级

- 适用子树：`packages/risk/risk-agent/`。
- 优先级：仓库根 [AGENTS.md](../../../AGENTS.md) > [packages/AGENTS.md](../../AGENTS.md) > 分组 README > 本文件 > 默认习惯。
- 上级规则优先；本文件只能加严，不得放宽上级规则。
- 与 `docs/nbs/` 冲突时以文档为准。
- 文档缺失、相互矛盾或无法满足契约时，必须停止并提问，禁止自行补全语义。

## 2. 红线

任何情况下不得违反；与其他条款冲突时以本节为准。

1. 依赖方向必须为 `plugin → application → domain`；`infrastructure` 实现 application 定义的 Ports。
2. `domain/` 禁止 import `@deepseek-ai/*`、`node:fs`、`node:child_process`、`node:net`。
3. 禁止 Tool Handler 访问 Repository；禁止 `application/` import 具体 adapter；禁止 infrastructure 反向依赖 Use Case；具体实现只在 `plugin/composition/` 装配。
4. `tenantId` 必须来自可信入口（DOC-12 §3.2），禁止取自工具入参；每个 Repository 调用必须显式带租户范围。
5. 禁止字符串拼接 SQL 与 Shell；MySQL 只用参数化查询与表字段 allowlist，SSH 只走命令模板 allowlist（DOC-12 §7）。
6. 凭据禁止写入 YAML、代码、日志、证据与报告，必须经 Secret Provider 获取。
7. 日志、证据、报告中的敏感字段必须经统一脱敏，禁止输出入参原文。
8. 金额必须用精确十进制表示（DOC-06 §2.2.1），禁止用 `number` 承载或比较。
9. 错误分类以 DOC-11 §3.2 为准，禁止自定义错误码；规则未命中、部分成功、UNKNOWN 必须作为正常结果返回，禁止包装成异常。
10. 未经批准禁止新增依赖、修改 `docs/nbs/`、commit、push。

## 3. 默认工作流

- 以下情形必须先给方案、待批准后再改代码：新增公共类型或 Port、跨层改动（import 关系跨越 §4 六层中的任意层边界，含 tools/ 对 application/ 调用签名的变更）、涉及持久化 schema、涉及安全边界、涉及 3 个以上文件。
- 实现顺序：契约（DTO / Port / Tool Schema）→ domain → application → infrastructure → tools → plugin 装配；契约文档（DOC-06 / DOC-07 / DOC-08）之间相互矛盾时适用 §1 停问，禁止自行取舍。
- 调用 DSH API 前必须读源码或 DOC-16；DOC-16 产出前以基线 §15 为准，禁止臆造接口与类型名。
- 一次变更只做单一目的、可独立回滚的事；改动行必须落在任务描述涉及的符号或文件内，超出即越界（含顺手修改相邻代码），先提问再动。
- 禁止顺手重构、禁止为假想需求预留结构、禁止提前建空目录。
- 临时脚本与验证产物放系统临时目录或仓库外，不进包目录。
- 交付前必须自检并报告实际结果：`pnpm run typecheck`、`pnpm run lint`、`pnpm exec vitest run packages/risk/risk-agent`（日常迭代；交付前另跑一次完整 `pnpm run test`）、`layering.spec.ts` 等架构测试（随 §6 测试命令一并执行）、`pnpm run build:check`（须在最新 `build:artifacts` 之后）、diff 是否越界、§7 索引是否需更新。

## 4. 工程约定

- `src/` 分六层：`plugin/`、`tools/`、`application/`、`domain/`、`infrastructure/`、`shared/`。
- `plugin/adapter/` 是唯一使用 `dsh-*` API 的位置；`plugin/composition/` 是唯一装配具体实现的位置。
- 目录按能力划分；能力的首个可运行用例或首个 Port 落地时才建目录及其 `index.ts`。基线 §3 目录树为目标态，仅在实际用例/Port 落地时创建对应节点。
- 模块之间只经各自 `index.ts` 通信，禁止深层引用内部文件。
- `src/types.ts` 只放类型，无运行时代码。
- 新增模块必须先在 DOC-02 找到归属；找不到先提问。
- `tsconfig.json` 继承 `tsconfig.base.json`，`rootDir: src`、`outDir: lib/types`，注册到聚合。
- 禁止建：包级 lint / test 配置、`scripts/`、`docs/`、`cordis.yml`、`client.ts`、`locale/`。
- 运行目录（`data/`、`state/`、`logs/`、`reports/`、`backups/`、`secrets/`、`tmp/`）不在包内，路径由部署配置给出；测试只用临时目录。
- 函数插件必须命名导出 `name` / `inject` / `Config` / `apply`，禁止 default export；`Config` 用 `@deepseek-ai/schemastery` 的 `Schema` 声明。
- 工具必须经 `ctx.tools.register(defineTool({...}), options?)` 注册并返回 disposer；注册与监听必须走 `ctx.effect()` / `ctx.on()`。
- 禁止另建 MCP Tool Server、禁止自行实现 Tool Registry（DOC-01 §3.3）；EventBus 只负责内部通知，不代替 Repository 作为事实源（基线 §5）。
- 本包只提供 `src/index.ts` + `package.json`；`cordis.yml` 属 bundle 包。
- 新建分组需单独报批：`packages/risk/README.md`（含中文）、[packages/README.md](../../README.md) 分组表、[product-package-policy.ts](../../../scripts/product-package-policy.ts) 登记（category `optional`）、模块图重新生成。

## 5. 代码约定

- 先落契约再写实现：DTO 依 DOC-06，Port 与 Repository 签名依 DOC-07，工具 Schema 依 DOC-08。
- Tool Schema、Application DTO、Domain Model 三者必须分离，禁止互相透传。
- 枚举与状态值必须单点定义（DOC-03 §6），禁止散落字符串字面量。
- 输入校验只放在边界：工具入参、配置、持久化数据、外部采集结果；同进程类型化接口禁止重复校验。
- 禁止硬编码阈值、开关与路径，必须进 `Config`（DOC-14）。
- 持久化必须遵守单写者、临时文件、原子替换；`schemaVersion` 变更必须与 DOC-11 对齐。
- `strict` 下禁止新增 `any` 与 `as unknown`。
- 注释与 JSDoc 用中文；导出必须有 JSDoc，函数含 `@param` / `@returns`。
- 文件以单个换行结尾。

## 6. 测试约定

- 默认零外部依赖：Fake Ports + TestClock + 临时目录；真实 MySQL / SSH / 日志源只出现在 `*.integration.spec.ts` 且默认跳过。
- 测试平铺 `tests/*.spec.ts`，类别写进文件名，禁止建子目录。
- 必须存在的文件：`layering.spec.ts`（§2 第 1～3 条）、`plugin.spec.ts`（加载、注册、发现、注销与资源释放、超时取消）、`tool-<name>.spec.ts`（入参校验、错误映射、渲染）、`<use-case>.spec.ts`（正常、边界、错误分类、幂等、租户隔离）。
- 覆盖率门槛按分层执行：仓库 CI `test:coverage` 的 per-file 100% 门禁适用于 `domain/`、`application/`、`rules/` 与状态机代码，必须满足；`infrastructure/`、`plugin/adapter/`、`plugin/composition/` 中必须依赖真实 MySQL/SSH/日志源或 DSH 启动才能覆盖的文件，逐项加入 `vitest.config.ts` 的 coverage exclude 并附 `TODO(risk)` 说明，作为窄例外，禁止整包排除 `src/**`。DOC-15 产出后以其校准。
- 红线强制机制：第 1～3 条由 `layering.spec.ts` 机械化校验；第 4、8、9 条由 `<use-case>.spec.ts` 的租户隔离、金额精度、错误分类用例覆盖；第 5～7 条由 TST-SEC 安全用例与评审兜底，无机械化门禁时必须在交付说明中逐项自查。
- 测试政策以 [docs/testing.md](../../../docs/testing.md) 为准；仓库暂无 `layering.spec.ts` 范本，首个按 §2 第 1～3 条设计并走 §3 报批。
- 测试编号沿用 DOC-01 §18.5 的 `TST-*` 前缀；未分配时用 `ID_PENDING`，禁止自造编号。

## 7. 设计文档索引

路径相对 `docs/nbs/`。

| 编号 | 文档 |
| --- | --- |
| DOC-01 | [需求规格说明书](<../../../docs/nbs/DSH 企业级风险监控 Agent V1 需求规格说明书.md>) |
| DOC-02 | [总体架构与模块设计](<../../../docs/nbs/DSH 企业级风险监控 Agent V1 总体架构与模块设计.md>) |
| DOC-03 | [领域模型与状态机设计](<../../../docs/nbs/DSH 企业级风险监控 Agent V1 领域模型与状态机设计.md>) |
| DOC-04 | [采集与编排设计](<../../../docs/nbs/DSH 企业级风险监控 Agent V1 采集与编排设计.md>) |
| DOC-05 | [端到端数据流设计](<../../../docs/nbs/DSH 企业级风险监控 Agent V1 端到端数据流设计.md>) |
| DOC-06 | [DTO 与数据模型规格](<../../../docs/nbs/DSH 企业级风险监控 Agent V1 DTO 与数据模型规格.md>) |
| DOC-07 | [Ports 与 Repository 契约](<../../../docs/nbs/DSH 企业级风险监控 Agent V1 Ports 与 Repository 契约.md>) |
| DOC-08 | [Tool 接口契约规格](<../../../docs/nbs/DSH 企业级风险监控 Agent V1 Tool 接口契约规格.md>) |
| DOC-09 | [指标与基线规格](<../../../docs/nbs/DSH 企业级风险监控 Agent V1 指标与基线规格.md>) |
| DOC-10 | [规则与风险评分规格](<../../../docs/nbs/DSH 企业级风险监控 Agent V1 规则与风险评分规格.md>) |
| DOC-11 | [错误、事务、幂等与恢复规格](<../../../docs/nbs/DSH 企业级风险监控 Agent V1 错误、事务、幂等与恢复规格.md>) |
| DOC-12 | [安全与多租户设计规格](<../../../docs/nbs/DSH 企业级风险监控 Agent V1 安全与多租户设计规格.md>) |
| DOC-13 | [可观测性设计规格](<../../../docs/nbs/DSH 企业级风险监控 Agent V1 可观测性设计规格.md>) |
| DOC-14 | [配置文件规格](<../../../docs/nbs/DSH 企业级风险监控 Agent V1 配置文件规格.md>) |
| — | [架构决策记录（ADR）](<../../../docs/nbs/DSH 企业级风险监控 Agent V1 架构决策记录（ADR）.md>) |
| — | [V1 工程设计基线](<../../../docs/nbs/DSH 企业级风险监控 Agent V1 工程设计基线.md>) |

DOC-15 测试与验收规格、DOC-16 DSH 适配设计规格、DOC-17 部署设计规格、DOC-18 RTM、DOC-19 TBD 总登记表尚未产出，期间以其在 DOC-01 的对应章节为准。

索引维护：文档新增、改号、改名时同一变更内更新本表；文档冲突以被引用文档为准，设计分歧走 ADR。