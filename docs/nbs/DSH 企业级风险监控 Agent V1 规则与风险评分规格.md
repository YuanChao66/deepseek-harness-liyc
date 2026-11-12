# DSH 企业级风险监控 Agent V1 规则与风险评分规格

| 文档属性 | 内容 |
| -------------- | ------------------------------------------ |
| 文档编号 | DSH-RISK-RDSL-V1 |
| 文档名称 | DSH 企业级风险监控 Agent V1 规则与风险评分规格 |
| 版本 | V1.0-Baseline |
| 文档状态 | 已冻结（Frozen） |
| 前置输入 | DOC-01（DSH-RISK-SRS-V1 §8/§9）；DOC-02（总体架构与模块设计）；DOC-06（DTO 与数据模型规格 §6.4/§6.5）；DOC-09（指标 DSL 规格） |
| 下一环节 | DOC-14（配置文件规格）、DOC-15（测试） |
| 适用范围 | DSH 风险监控 Agent V1 插件工程 |
| 技术基线 | DeepSeek Harness 工作树 live 源码（以源码核验为准） |

## 1. 文档概述

### 1.1 编写目的

本文档定义规则 DSL（Rule DSL）的语法、表达式模型（AST）、条件与阈值语义、风险评分与严重度映射、多窗口语义、求值与校验规则，作为规则定义（RuleDefinition，DOC-06 §6.4）中 `expressionRef` 所指向规则表达式的可执行规格，以及风险评分（RiskScore/DOC-06 §6.5）的确定性依据。

### 1.2 边界声明

| 主题 | 归属 |
| ---- | ---- |
| RuleDefinition / EvaluationResult / RiskScore / Severity 字段级 DTO | DOC-06 |
| 指标 DSL 语法与求值（被规则引用的指标） | DOC-09 |
| 规则 DSL 语法、条件/阈值/评分/求值语义 | 本文档 |
| 风险事件与周期的状态机语义 | DOC-03 |
| 配置文件 Schema（如何承载规则） | DOC-14 |
| 规则编译/评估实现 | MOD-RULE-001（本文档只订规格） |

### 1.3 记法约定

- 同 DOC-09：声明式可序列化 JSON 为表面语法，TS `type`/`interface` 给出 AST。
- 规则条件引用指标（通过 metricId），不为指标重复定义聚合逻辑；指标计算统一走 DOC-09。

## 2. 设计原则

1. **声明式、确定性**：同一输入 + 同规则版本 → 同一评估结果；禁止依赖时钟/随机数/模型输出。
2. **可序列化、可溯源**：规则 DSL 全部可 JSON 序列化；判定结果经 `EvaluationResult` 持久化，含输入指标版本与数据质量。
3. **评分与等级分离**：`score` 与 `severity` 分离（DOC-06 §6.5），由明确映射规则转换。
4. **模型不得定生死**：LLM 不得直接决定最终分数/等级；规则命中为唯一事实来源。
5. **无任意代码执行**：仅白名单运算与阈值方法；禁止脚本注入。
6. **版本化 + 未命中为正常**：规则语义变化变更 `ruleVersion`；`matched=false` 属正常评估结果，非错误。

## 3. 语言结构（表面语法）

规则 DSL 顶层结构为 `RuleSpec`，承载于 `RuleDefinition.expressionRef` 指向的表达式。示例：

```json
{
  "when": { "all": [
    { "metric": "transaction_amount_5m", "op": "GT",
      "threshold": { "kind": "DYNAMIC", "baseline": "txn_amt_baseline", "method": "STDDEV", "factor": 3 } }
  ] },
  "severity": "HIGH",
  "scoring": { "base": 50, "factors": [ { "metric": "transaction_amount_5m", "weight": 10 } ] }
}
```

顶层字段：

| 字段 | 含义 | 必填 |
| ---- | ---- | ---- |
| when | 触发条件（§5） | Y |
| severity | 风险等级（Severity，DOC-06 §9） | Y（有评分时可缺省） |
| scoring | 评分规格（§7） | N |
| windows | 多窗口覆盖（§8） | N |
| suppressionScope | 抑制/例外范围（§8） | N |

## 4. 表达式模型（AST）

```ts
interface RuleSpec {
  when: ConditionExpr;
  severity?: Severity;               // INFO/LOW/MEDIUM/HIGH/CRITICAL
  scoring?: ScoringSpec;
  windows?: RelativeWindow[];        // 相对时长窗口（§8），评估时换算为绝对 TimeWindow
  suppressionScope?: string[];       // 抑制范围维度键
}

type RelativeWindow = {
  start: string;    // ISO-8601 duration，如 "-PT10M"；负值表示评估时点之前
  end: string;      // ISO-8601 duration，如 "PT0S"；相对评估时点偏移
};
```

`RuleDefinition.expressionRef` 为字符串，指向本 `RuleSpec` 的序列化/寻址（DOC-06 §6.4）；AST 与序列化双向无损映射。

## 5. 条件表达式（ConditionExpr）

```ts
type ConditionExpr =
  | { all: ConditionExpr[] }                     // AND
  | { any: ConditionExpr[] }                     // OR
  | { not: ConditionExpr }                       // NOT
  | MetricComparison;

type MetricComparison = {
  metric: string;                                // metricId 引用（DOC-09）
  op: 'GT' | 'GTE' | 'LT' | 'LTE' | 'EQ' | 'NEQ' | 'RANGE';
  threshold: ThresholdSpec;                      // §6
  range?: { min?: MetricValue; max?: MetricValue };   // 仅 RANGE
};

type MetricValue = number | Money;               // 按指标 valueEncoding
```

| 约束 | 说明 |
| ---- | ---- |
| metric 存在 | 被引用指标必须存在且为同租户、已启用 |
| 类型匹配 | `op`/`threshold` 数值类型与指标 valueEncoding 匹配（MONEY 走定点比较） |
| 优先级 | `not > all > any` |
| 逻辑无副作用 | 条件仅引用指标结果，不触发采集/计算 |

## 6. 阈值规格（ThresholdSpec）

```ts
type ThresholdSpec =
  | { kind: 'FIXED'; value: MetricValue }                       // 固定阈值
  | { kind: 'DYNAMIC'; baseline: string; method: BaselineMethod; factor: number };

type BaselineMethod = 'STDDEV' | 'PERCENTILE' | 'ZSCORE';       // 算法语义见 DOC-09 §15.4
```

| 阈值 | 语义 | 约束 |
| ---- | ---- | ---- |
| FIXED | 与常量比较 | value 类型与指标匹配（金额走定点） |
| DYNAMIC | 与基线统计量比较 | baseline 必须为 Active 基线；factor 为正；方法受白名单 |

阈值类型（固定/动态）可组合（同一 `MetricComparison` 多阈值需明确为 AND 关系并显式写出，避免隐式）。

约束：`DYNAMIC` 基线必须处于 `Active` 且样本量达标（DOC-06 §6.3 Baseline；状态机/算法权威见 DOC-09 §15）；未达标不得回退到 `FIXED` 静默（fail-closed）。

## 7. 风险评分与严重度映射

```ts
interface ScoringSpec {
  base: number;                                   // 基础分
  factors: ScoringFactor[];
  severity?: Severity;                            // 显式等级覆盖
}

interface ScoringFactor {
  metric: string;                                 // metricId 引用
  weight: number;                                 // 权重
}
```

严重度映射：

| 规则 | score 区间 | severity | 说明 |
| ---- | ---- | ---- | ---- |
| 显式 | — | 直接声明 | 规则显式指定等级优先 |
| 映射 | score ∈ [85,100] | CRITICAL | 明确映射表 |
| 映射 | score ∈ [70,85) | HIGH | — |
| 映射 | score ∈ [50,70) | MEDIUM | — |
| 映射 | score ∈ [25,50) | LOW | — |
| 映射 | score ∈ [0,25) | INFO | — |

约束：`score` 与 `severity` 分离，映射由明确规则定义；LLM 不得直接决定最终分数/等级（DOC-06 §6.5）。评分求和需确定性，禁止随机扰动。

## 8. 多窗口与抑制范围

- `windows` 显式声明规则覆盖的多个时间窗口；未声明时沿用被引用指标的窗口。
- `windows` 元素为相对时长窗口（`RelativeWindow`）：`start`/`end` 为 ISO-8601 duration（相对评估时点 t0），评估时换算为绝对 `TimeWindow`（`[t0 + start, t0 + end)`，左闭右开，DOC-06 §2.2.3）。
- 多窗口条件合并语义：默认 AND（全部窗口条件满足才命中）；需 OR 时用 `any` 显式表达。
- `suppressionScope` 是抑制/例外范围维度键（对齐 DOC-06 §6.5 `RiskSuppression`/`RiskImpactScope`）；命中抑制规则的评估不产生新风险事件。

## 9. 求值与校验规则

### 9.1 求值

- 同一指标结果集 + 同 `ruleVersion` → 同一 `EvaluationResult`（确定性）。
- 评估结果持久化 `ruleVersion`、`inputMetricVersions`、`dataQuality`（DOC-06 §6.4）；未命中（matched=false）同样持久化。
- 数据质量 gating：被引用指标 `dataQuality` 为 `ERROR/INVALID` 时不得判定命中；`STALE/PARTIAL` 时在结果中标记，不得当作正常 NORMAL。

### 9.2 校验

| 校验项 | 时机 | 失败动作 |
| ---- | ---- | ---- |
| 指标引用存在、同租户、已启用 | 加载/编译期 | fail-closed |
| op/threshold 与指标 valueEncoding 匹配 | 编译期 | 拒绝 |
| 动态基线 Active 且样本达标 | 编译期 | 拒绝 |
| severity/score 映射合法 | 编译期 | 拒绝 |
| 条件图无环、逻辑合法 | 编译期 | 拒绝 |

校验失败 loud-fail，不静默跳过（AGENTS「Misconfiguration fails loud」）。

## 10. 安全边界

1. 无任意代码执行：不支持自定义函数、动态求值、脚本注入。
2. 指标引用白名单：仅限同租户已登记、已启用指标；拒绝越界/跨租户引用。
3. 阈值方法白名单：STDDEV/PERCENTILE/ZSCORE 仅此三类。
4. 金额定点比较：MONEY 阈值与指标值走定点十进制比较，禁止浮点。
5. 评分/等级确定性：禁止随机/模型扰动；LLM 不决定生死。

## 11. 示例

### 11.1 单指标动态阈值触发

```json
{
  "when": { "all": [
    { "metric": "transaction_amount_5m", "op": "GT",
      "threshold": { "kind": "DYNAMIC", "baseline": "txn_amt_baseline", "method": "STDDEV", "factor": 3 } }
  ] },
  "severity": "HIGH"
}
```

### 11.2 多条件组合 + 评分

```json
{
  "when": { "all": [
    { "metric": "login_fail_rate_5m", "op": "GT", "threshold": { "kind": "FIXED", "value": 0.2 } },
    { "metric": "login_total_5m", "op": "GTE", "threshold": { "kind": "FIXED", "value": 50 } }
  ] },
  "scoring": { "base": 40, "factors": [
    { "metric": "login_fail_rate_5m", "weight": 25 },
    { "metric": "api_auth_fail_5m", "weight": 15 }
  ] }
}
```

### 11.3 RANGE + 多窗口

```json
{
  "when": { "metric": "api_latency_p99_5m", "op": "RANGE",
    "threshold": { "kind": "DYNAMIC", "baseline": "api_latency_baseline", "method": "PERCENTILE", "factor": 1 },
    "range": { "min": 500 } },
  "windows": [ { "start": "-PT10M", "end": "PT0S" }, { "start": "-PT5M", "end": "PT0S" } ],
  "severity": "MEDIUM"
}
```

## 12. 与下游文档边界与追踪

| 本文档输出 | 下游承接 |
| ---- | ---- |
| RuleSpec 语法与 AST | MOD-RULE-001 编译/评估实现 + DOC-15 测试 |
| 条件/阈值/评分语义 | DOC-04（采集编排）、DOC-11（幂等/恢复） |
| 风险评分/严重度确定性 | DOC-06（RiskScore/Severity）+ 实现 |
| RuleDefinition.expressionRef 承载 | DOC-14（配置文件 Schema） |

需求追踪：每个规则 DSL 能力映射回 BR-001～003 与 SYS-MON-001～008（完整追踪表见 DOC-18）。

## 附录 A：版本与文档状态

| 版本 | 状态 | 说明 |
| ---- | ---- | ---- |
| V1.0-Baseline | Frozen | 冻结基线，开发启动依据 |

本文档已冻结，基线版本 `V1.0-Baseline`，作为开发启动依据。

**文档结束。**