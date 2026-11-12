# 已安装 Agent Skills 中文说明与操作流程

| 文档属性 | 内容 |
| --- | --- |
| 文档名称 | 已安装 Agent Skills 中文说明与操作流程 |
| 版本 | V1.0 |
| 编写日期 | 2026-11-11 |
| 安装来源 | https://github.com/mattpocock/skills |
| 来源版本 | 1.3.2，main 分支 `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d`（2026-10-31），MIT |
| 安装位置 | `C:\Users\Liyc\.trae-cn\skills`（全局，跨项目生效） |
| 技能数量 | 27 个（engineering 20 + productivity 7） |
| 未安装内容 | `skills/in-progress/`（9 个实验性技能）、`skills/misc/`（4 个仓库专用技能） |

## 1. 安装概况

本次按仓库 `.claude-plugin/plugin.json` 的官方插件清单安装，即 engineering 与 productivity 两个目录下的全部技能，每个技能按完整目录复制（含 `SKILL.md`、`references/`、`scripts/`、`assets/` 等伴随文件），未做裁剪。

安装位置为全局目录，因此这 27 个技能对本机所有 Trae 项目可见，不只当前仓库。仓库自带的 `.agents/skills`（`dsh-*` 系列）未被修改。

## 2. 调用方式

技能有两种触发方式，取决于 `SKILL.md` 的 frontmatter 是否声明 `disable-model-invocation: true`。

| 方式 | 含义 | 说明 |
| --- | --- | --- |
| 自动触发 | 正常描述需求，agent 依据技能描述自行选用 | 例如说“这个 bug 查不出来”，`diagnosing-bugs` 会被选中 |
| 手动触发 | 必须输入 `/技能名` 才会加载 | 标了 `disable-model-invocation` 的技能不会自动出现在候选里 |

需要手动触发的 16 个：`ask-matt`、`grill-me`、`grill-with-docs`、`handoff`、`implement`、`implement-spec`、`improve-codebase-architecture`、`retro`、`setup-matt-pocock-skills`、`teach`、`to-questionnaire`、`to-spec`、`to-tickets`、`triage`、`wait-what`、`wayfinder`。

可自动触发的 11 个：`code-review`、`codebase-design`、`diagnosing-bugs`、`domain-modeling`、`grilling`、`pr`、`prototype`、`research`、`tdd`、`wizard`、`writing-for-agents`。

## 3. 工程类技能（20 个）

| 阶段 | 技能 | 作用 | 调用 |
| --- | --- | --- | --- |
| 初始化 | `setup-matt-pocock-skills` | 每个仓库执行一次：登记 issue tracker（GitHub / GitLab / 本地 `.scratch/`）、triage 标签词表、GLOSSARY 与 ADR 的位置，结果写入 `docs/agents/` | 手动 |
| 想清楚 | `grill-me` | 对计划或设计做无情追问，暴露未想清楚的部分 | 手动 |
| 想清楚 | `grill-with-docs` | 在追问的同时产出 ADR 与术语表 | 手动 |
| 想清楚 | `ask-matt` | 路由器：不确定用哪个技能时先问它 | 手动 |
| 拆活 | `to-spec` | 把当前对话直接整理成 spec 并发布到 tracker，不再做访谈 | 手动 |
| 拆活 | `to-tickets` | 把 spec 或计划拆成带阻塞关系的 tracer-bullet 工单 | 手动 |
| 拆活 | `wayfinder` | 单个会话装不下的大工程，做成决策工单地图，逐个解决 | 手动 |
| 拆活 | `triage` | issue 与外部 PR 的分诊状态机，产出 agent 可执行的简报 | 手动 |
| 实现 | `implement` | 按 spec 或工单实现代码 | 手动 |
| 实现 | `implement-spec` | 实现 `/to-spec` 与 `/to-tickets` 的产物 | 手动 |
| 实现 | `tdd` | 红-绿-重构循环，测试只写在公共 seam 上 | 自动 |
| 实现 | `prototype` | 一次性原型，用于回答状态模型或界面是否合理 | 自动 |
| 质量 | `code-review` | 从某个 commit、分支或 merge-base 起做双轴评审：仓库规范与 spec 符合度，两个子 agent 并行 | 自动 |
| 质量 | `pr` | 按仓库风格撰写 PR 描述 | 自动 |
| 质量 | `diagnosing-bugs` | 硬 bug 与性能回归的诊断循环：先构造能变红的反馈回路，再定位根因 | 自动 |
| 认知 | `domain-modeling` | 维护 `GLOSSARY.md` 与 ADR | 自动 |
| 认知 | `codebase-design` | 深模块设计词汇：接口、seam、可测试性、AI 可导航性 | 自动 |
| 认知 | `improve-codebase-architecture` | 扫描可加深的模块机会，产出 HTML 报告，再逐个追问 | 手动 |
| 收尾 | `retro` | 对一次编码会话做复盘 | 手动 |
| 收尾 | `research` | 对着高可信一手资料调研，产出 Markdown 报告 | 自动 |
| 收尾 | `wizard` | 生成交互式 bash 向导，带人完成只有人能做的步骤 | 自动 |

## 4. 效率类技能（7 个）

| 技能 | 作用 | 调用 |
| --- | --- | --- |
| `handoff` | 把当前会话压缩成交接文档，交给另一个 agent 接手 | 手动 |
| `wait-what` | “刚才那段没讲明白，重讲” | 手动 |
| `teach` | 在工作区内讲解一个新概念或新技能 | 手动 |
| `to-questionnaire` | 把无法独自决定的问题做成问卷，交给他人填写 | 手动 |
| `writing-for-agents` | 撰写给 agent 阅读的文档：skill、`AGENTS.md`、`CLAUDE.md` | 自动 |
| `grill-me` | 对计划或设计做无情追问 | 手动 |
| `grilling` | 追问的通用版本，可在讨论方案时自动触发 | 自动 |

## 5. 推荐操作流程

### 5.1 首次使用：每个仓库执行一次

第一步，执行 `/setup-matt-pocock-skills`。它会先探查仓库现状（`git remote`、`AGENTS.md`、`CLAUDE.md`、`GLOSSARY.md`、`docs/adr/`、`docs/agents/`、是否存在 monorepo 信号），再逐项询问。

第二步，回答三个问题：issue tracker 选 GitHub、GitLab 还是本地 markdown；是否沿用默认五个 triage 标签（`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`）；领域文档采用单上下文还是多上下文布局。

第三步，确认草稿后写入 `docs/agents/issue-tracker.md`、`docs/agents/domain.md`、`docs/agents/triage-labels.md`，并在 `CLAUDE.md`（若存在）或 `AGENTS.md` 中追加 `## Agent skills` 段落。

此后所有技能都读取这份配置，无需重复设置。

### 5.2 日常主线：从想法到合并

```text
想法
  → /grill-me 或 /grilling        把方案问穿
  → /to-spec                      沉淀为 spec 并发布到 tracker
  → /to-tickets                   拆成带依赖关系的工单
  → /implement 或 /implement-spec 落地实现（配合 tdd）
  → code-review                   双轴评审（自动触发）
  → pr                            生成 PR 描述（自动触发）
  → /retro                        复盘，结论喂给下一轮
```

### 5.3 旁路场景

| 场景 | 使用的技能 |
| --- | --- |
| 线上或本地出现难以复现的问题 | 直接描述现象，`diagnosing-bugs` 接管 |
| 一个会话做不完的大改造 | `/wayfinder` 先出决策地图，再逐个决策 |
| 接口越改越乱、模块边界模糊 | `/improve-codebase-architecture` 出报告，再用 `grill-with-docs` 敲定方案 |
| 需要外部资料或 API 事实 | 描述调研问题，`research` 产出 Markdown 报告 |
| 上下文即将耗尽，需要换会话 | `/handoff` 生成交接文档 |
| 不确定该用哪个技能 | `/ask-matt` |
| 想先验证设计是否可行 | 描述设计问题，`prototype` 产出一次性原型 |

## 6. 使用注意事项

全局生效：技能安装在本机用户目录，对所有 Trae 项目可见，且会与项目内 `.agents/skills`、`.trae/skills` 的技能共同出现在候选列表里。

会修改仓库文件：`setup-matt-pocock-skills` 写入 `docs/agents/*` 并改动 `AGENTS.md` 或 `CLAUDE.md`；`grill-with-docs` 产出 ADR；`research` 写入 Markdown 报告；`improve-codebase-architecture` 写入 HTML 报告。在本仓库执行时，这些改动都会成为 git 变更，执行前需确认是否纳入版本管理。

外部依赖：选择 GitHub tracker 需要 `gh` 已登录，选择 GitLab 需要 `glab` 已登录且当前目录能访问对应仓库；两者都不满足时使用本地 markdown 模式，工单落在 `.scratch/`。

强交互特性：`grill-me`、`grilling`、`to-spec`、`triage`、`setup-matt-pocock-skills` 都是多轮追问型技能，需要逐条回答，不会一次给出结果。

更新方式：本安装方式没有自动更新。升级时重新克隆仓库并覆盖这 27 个目录，或使用 `npx skills@latest update` 后重新执行 add。

技能识别：安装后需重载 IDE 会话，全局技能列表才会刷新；重载前已开启的会话可能仍只看到旧列表。

## 7. 常见组合速查

| 目标 | 组合 |
| --- | --- |
| 把模糊想法变成可执行工单 | `grill-me` → `to-spec` → `to-tickets` |
| 测试先行地实现一个功能 | `tdd` + `implement` |
| 接手别人未完成的改动 | `handoff` 生成交接 → `implement-spec` 继续 |
| 排查一个说不清的线上问题 | `diagnosing-bugs`（必要时配合 `research` 查外部资料） |
| 重构前统一术语与边界 | `domain-modeling` + `codebase-design` + `grill-with-docs` |
| 合并前的最后一道检查 | `code-review` → `pr` |