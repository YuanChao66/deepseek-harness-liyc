# DSH 企业级风险监控 Agent V1 指标与基线规格

| 文档属性 | 内容 |
| -------------- | ------------------------------------------ |
| 文档编号 | DSH-RISK-METRIC-BASELINE-V1 |
| 文档名称 | DSH 企业级风险监控 Agent V1 指标与基线规格 |
| 版本 | V1.0-Baseline |
| 文档状态 | 已冻结（Frozen） |
| 前置输入 | DOC-01（DSH-RISK-SRS-V1 §8）；DOC-02（总体架构与模块设计 §4）；DOC-04（采集与编排设计）；DOC-06（DTO 与数据模型规格 §6.3）；《工程设计基线》§7.2（Baseline Engine 独立） |
| 下一环节 | DOC-10（规则与风险评分规格）、DOC-14（配置文件规格）、DOC-15（测试） |
| 适用范围 | DSH 风险监控 Agent V1 插件工程 |
| 技术基线 | DeepSeek Harness 工作树 live 源码（以源码核验为准） |

## 1. 文档概述

### 1.1 编写目的

本文档定义两部分：

- **指标 DSL（Metric DSL，§2～§14）**：语法、表达式模型（AST）、聚合语义、窗口与维度、数据质量门槛、金额定点语义、求值与校验规则，作为指标定义（MetricDefinition，DOC-06 §6.3）中 `expression` 字段的可执行规格与 DOC-14 配置加载依据。
- **基线规格（Baseline Spec，§15）**：基线的生命周期状态机、最小样本量判定、统计量算法（STDDEV/PERCENTILE/ZSCORE）、滚动更新与求值校验，作为 DOC-06 §6.3 Baseline 与 DOC-10 §6 动态阈值的权威语义依据。Baseline Engine 独立于 Metric Engine（《工程设计基线》§7.2）。

### 1.2 边界声明

| 主题 | 归属 |
| ---- | ---- |
| MetricDefinition 字段级 DTO、MetricType 枚举、MetricResult | DOC-06 |
| 指标 DSL 语法、表达式模型、求值/校验规则 | 本文档（§2～§14） |
| Baseline DTO（BaselineState/BaselineStatistics） | DOC-06 §6.3 |
| 基线状态机/样本量/统计量算法（Baseline Spec） | 本文档（§15） |
| 基线方法引用与动态阈值 | DOC-10 §6 |
| 规则 DSL 语法 | DOC-10 |
| Repository/Port 契约 | DOC-07 |
| 配置文件 Schema（如何承载 DSL 与 baselines/*.yml） | DOC-14 |
| DSL 编译/求值实现 | MOD-METRIC-001（本文档只订规格） |

### 1.3 记法约定

- DSL 采用**声明式、可序列化 JSON 对象**作为表面语法；以 TS `type`/`interface` 给出表达式模型（AST）。
- 每个节点给出「语法 / 语义 / 约束」三要素；聚合函数与窗口以目录表列出。
- 示例用 JSON 对象展示。

## 2. 设计原则

1. **声明式、无副作用**：指标定义只描述「从哪些事件、按什么窗口与维度、计算什么」，不包含执行计划与副作用。
2. **确定性**：同一输入事件集 + 同一定义版本 + 同一计算版本 → 同一结果；禁止依赖时钟、随机数与外部上下文。
3. **可序列化**：DSL 全部可 JSON 序列化，落盘与模型可见内容一致（AGENTS「Model-visible ⟺ logged」）。
4. **无任意代码执行**：DSL 不支持用户自定义函数、动态求值或脚本注入；仅限白名单运算符与函数。
5. **字段级、可溯源**：每个指标必须能追溯到源事件字段与计算路径，结果通过 `lineage` 指向上游（DOC-06 §6.3）。
6. **金额定点**：金额类指标走 `Money`（定点字符串 + scale + 币种）；聚合不得引入二进制浮点。
7. **版本化**：`definitionVersion` 分离开；语义变化必须变更版本而非原地改写（DOC-01 §13.3）。

## 3. 语言结构（表面语法）

指标 DSL 的顶层结构为 `MetricSpec`，承载于 `MetricDefinition.expression` 字段（DOC-06 §6.3）。示例：

```json
{
  "type": "COUNTER",
  "agg": "SUM",
  "source": {
    "eventTypes": ["transaction"],
    "filter": { "status": { "in": ["SUCCESS", "FAILED"] } }
  },
  "field": "$amount",
  "window": { "kind": "FIXED", "size": 5, "unit": "MINUTE" },
  "dimensions": ["customerId"],
  "dataQuality": { "minimumSample": 1, "maxDataAge": { "value": 900, "unit": "SECOND" } },
  "valueEncoding": "MONEY"
}
```

顶层字段：

| 字段 | 含义 | 必填 |
| ---- | ---- | ---- |
| type | MetricType（§5）：COUNTER/GAUGE/RATE/RATIO/DISTRIBUTION/DERIVED | Y |
| agg | 聚合函数（§6）：COUNT/COUNT_DISTINCT/SUM/AVG/MIN/MAX/PERCENTILE | 视 type |
| source | 事件源与过滤（§4.2） | Y |
| field | 被聚合的字段引用 `$path` | 视 agg |
| window | 窗口规格（§8） | Y |
| dimensions | 维度分组键（§8） | N |
| dataQuality | 数据质量门槛（§10） | N（有默认） |
| valueEncoding | 值编码（MONEY/COUNT/RATIO/DECIMAL） | N（按 type 推导） |
| derivation | 派生组合（仅 RATE/RATIO/DERIVED） | 视 type |

## 4. 表达式模型（AST）

### 4.1 MetricSpec（判别联合）

```ts
type MetricSpec =
  | CounterSpec
  | GaugeSpec
  | RateSpec
  | RatioSpec
  | DistributionSpec
  | DerivedSpec;

interface MetricSpecBase {
  source: SourceSpec;
  window: WindowSpec;
  dimensions?: DimensionSpec;
  dataQuality?: DataQualityGate;
  valueEncoding?: ValueEncoding;
}
```

`type`（MetricType，DOC-06 §9）与控制流判别一致：`COUNTER/GAUGE/RATE/RATIO/DISTRIBUTION/DERIVED`。

### 4.2 SourceSpec（事件源）

```ts
interface SourceSpec {
  eventTypes: string[];          // 事件类型白名单，如 ['transaction','login','apiAccess']
  filter?: FilterExpr;           // 过滤表达式，见 §7
}
```

| 字段 | 必填 | 约束 |
| ---- | ---- | ---- |
| eventTypes | Y | 非空，仅允许登记的事件类型 |
| filter | N | 缺省=不过滤 |

### 4.3 FieldSpec（字段引用）

```ts
type FieldSpec = string;   // '$amount' | '$status' | '$latencyMs'，点路径 '$metadata.traceId'
```

- 字段引用以 `$` 开头，点号分隔路径；字段必须存在于对应事件 Schema（DOC-06 §5）。
- 禁止引用未登记字段，禁止越过事件边界访问租户无关数据。

### 4.4 ValueEncoding

```ts
type ValueEncoding = 'MONEY' | 'COUNT' | 'RATIO' | 'DECIMAL';
```

仅 `MONEY`（金额定点）、`COUNT`（整数）、`RATIO`（比率，声明精度）、`DECIMAL`（声明精度浮点）四种；禁止隐式混用。

## 5. MetricType 语义

| MetricType | 计算语义 | valueEncoding 默认 |
| ---- | ---- | ---- |
| COUNTER | 事件计数，或对字段求 COUNT/COUNT_DISTINCT | COUNT |
| GAUGE | 即时/快照值（MAX/MIN/AVG 等） | 按字段 |
| RATE | 单位时间变化率（分子/时间窗） | RATIO |
| RATIO | 两指标之比（分子/分母） | RATIO |
| DISTRIBUTION | 分位数/分布（PERCENTILE/直方） | DECIMAL |
| DERIVED | 由多个指标组合（算术/聚合） | 按表达式推导 |

约束：`type` 决定可用聚合函数子集；不匹配 → 校验失败（MOD-METRIC-001 编译期拒绝）。

## 6. 聚合函数目录

| 函数 | 适用 type | 语义 | 空集/无样本返回 |
| ---- | ---- | ---- | ---- |
| COUNT | COUNTER | 事件计数 | 0 |
| COUNT_DISTINCT | COUNTER | 去重计数（字段） | 0 |
| SUM | COUNTER/GAUGE | 求和 | null（表达为 0 或缺失，见 valueEncoding） |
| AVG | GAUGE | 均值 | null |
| MIN | GAUGE | 最小值 | null |
| MAX | GAUGE | 最大值 | null |
| PERCENTILE(p) | DISTRIBUTION | 第 p 分位 | null |

`RATE`、`RATIO`、`DERIVED` 不是原子聚合函数，而是通过 `derivation`（§9）组合多指标或比率表达式求得。

约束：`SUM` 对金额字段返回 `Money`（§11）；`AVG` 对金额返回带 `scale` 的定点平均值；除数必须约束不为 0。

## 7. 过滤表达式（FilterExpr）

过滤表达式是约束的白名单表达式语言，用于 `SourceSpec.filter`。

### 7.1 AST（规范形式）

```ts
type FilterExpr =
  | { and: FilterExpr[] }
  | { or: FilterExpr[] }
  | { not: FilterExpr }
  | { eq: { field: FieldSpec; value: Literal } }
  | { neq: { field: FieldSpec; value: Literal } }
  | { gt: { field: FieldSpec; value: Literal } }
  | { gte: { field: FieldSpec; value: Literal } }
  | { lt: { field: FieldSpec; value: Literal } }
  | { lte: { field: FieldSpec; value: Literal } }
  | { in: { field: FieldSpec; values: Literal[] } }
  | { exists: { field: FieldSpec } };

type Literal = string | number | boolean | null;
```

### 7.2 表面语法（紧凑形式）

`{ "<field>": <op> }` 为紧凑语法糖，反规范化到上述操作符节点：

```json
{ "status": { "in": ["SUCCESS", "FAILED"] }, "amount": { "gte": 1000 } }
```

- `eq` 可直接写字面量：`{ "type": "DEBIT" }`。
- `and` 由多字段对象隐含；`or`/`not` 需显式形如 `{ "or": [...] }` / `{ "not": {...} }`。

约束：优先级固定为 `not > and > or`；禁止定义函数、正则（除非单独白名单）、下标/索引、赋值。

## 8. 窗口与维度

### 8.1 WindowSpec

```ts
type TimeUnit = 'SECOND' | 'MINUTE' | 'HOUR' | 'DAY';

type WindowSpec =
  | { kind: 'FIXED'; size: number; unit: TimeUnit }
  | { kind: 'SLIDING'; size: number; slide: number; unit: TimeUnit }
  | { kind: 'SESSION'; gap: number; unit: TimeUnit };
```

| 约束 | 说明 |
| ---- | ---- |
| 左闭右开 | 窗口 `[start, end)`，与 DOC-06 §2.2.3 一致 |
| 时间对齐 | 固定窗口按纪元对齐后换算租户时区（UTC 存储） |
| 参数合法 | `size/slide/gap` 为正整数；SLIDING 要求 `slide ≤ size` |

### 8.2 DimensionSpec

```ts
type DimensionSpec = string[];   // 事件字段路径，如 ['customerId','accountId']
```

约束：维度键必须来自事件 Schema；维度基数上限由配置约束（防高基数爆炸）；金额/币种不并列维度（币种统一维度）。

## 9. 派生计算（Derivation）

`RATE`、`RATIO`、`DERIVED` 通过 `derivation` 组合原子指标或字面量：

```ts
type Derivation =
  | { kind: 'METRIC_REF'; metricId: string }                       // 复用已定义指标
  | { kind: 'ARITHMETIC'; op: 'ADD' | 'SUB' | 'MUL' | 'DIV'; lhs: DeriveExpr; rhs: DeriveExpr }
  | { kind: 'RATE'; numerator: DeriveExpr; denominator: DeriveExpr }
  | { kind: 'RATIO'; numerator: DeriveExpr; denominator: DeriveExpr };

type DeriveExpr = Derivation | { kind: 'LITERAL'; value: Literal };
```

| 约束 | 说明 |
| ---- | ---- |
| 无环 | `METRIC_REF` 引用图必须无环；循环引用校验失败 |
| 版本一致 | 被引用指标取其 `definitionVersion`，版本漂移必须显式 |
| 除数非零 | `DIV`/`RATE`/`RATIO` 分母约束不为 0 |
| 维度兼容 | 派生指标与被引用指标维度必须可对齐（同维度键或降维投影） |

`RATE`：分子变化量 / 窗口时间（单位时间变化率）；`RATIO`：两指标之比——两者均持久化为 `RATIO` 值编码，声明精度。

## 10. 数据质量门槛（DataQualityGate）

```ts
interface DataQualityGate {
  minimumSample?: number;                          // 最小样本量，未达→PARTIAL
  maxDataAge?: { value: number; unit: TimeUnit };  // 最大新鲜度，超期→STALE
  requiredDimensionKeys?: string[];                // 必填维度键，缺失→INVALID
}
```

门槛判定产出 `DataQuality`（DOC-06 §7.4）：

| 条件 | 产出 |
| ---- | ---- |
| 全部满足 | NORMAL |
| 超 `maxDataAge` | STALE |
| 样本未达 `minimumSample` | PARTIAL |
| 必填维度键缺失 / 字段校验失败 | INVALID |
| 采集/上游失败 | ERROR |

`DataQuality` 独立于 CollectionStatus、EventState；门槛缺省时不得静默升级为 NORMAL（显式默认值需声明）。

## 11. 金额定点语义

- 金额字段聚合（`SUM`/`AVG`）一律走 `Money`（定点字符串 + `scale` + `currency`，DOC-06 §2.2.1）。
- `SUM` 前先统一到声明 `scale`；对齐方式（舍入/截断）必须在定义中声明，禁止隐式舍入。
- 跨币种：必须先配置可靠汇率来源、有效时间、版本与换算精度；未配置禁止直接相加。
- 比较基于定点十进制整数比较，禁止 `parseFloat`。

## 12. 求值与校验规则

### 12.1 求值

- 同一事件集 + 同 `definitionVersion` + 同 `calculationVersion` → 同一结果（确定性）。
- 求值为窗口内聚合，结果携带 `calculationVersion`、`dataQuality`、`lineage`（DOC-06 §6.3）指向源事件与计算路径。
- 幂等：同窗口重复求值返回同一结果；不重复累计（对齐 DOC-05 事件处理）。

### 12.2 校验

| 校验项 | 时机 | 失败动作 |
| ---- | ---- | ---- |
| 字段存在性（`$path` 在事件 Schema 内） | 加载/编译期 | fail-closed，拒绝加载 |
| type/agg 匹配 | 编译期 | 拒绝 |
| 窗口/维度参数合法 | 编译期 | 拒绝 |
| 字段/事件类型白名单 | 编译期 | 拒绝 |
| 派生引用无环、版本一致、除数非零、维度对齐 | 编译期 | 拒绝 |
| 维度基数上限 | 求值期监控 | 降级/告警 |

校验失败 loud-fail（AGENTS「Misconfiguration fails loud」），不静默跳过。

## 13. 安全边界

1. 无任意代码执行：不支持自定义函数、动态求值、脚本注入。
2. 字段白名单：`$path` 仅限对应事件 Schema 已登记字段；拒绝越界访问。
3. 事件类型白名单：`SourceSpec.eventTypes` 仅限登记类型。
4. 维度基数上限：防高基数/内存爆炸。
5. 金额精度与币种：显式 `scale`/汇率，禁止隐式混用。
6. 无跨租户字段访问：指标定义描述的计算范围受租户边界约束。

## 14. 示例

### 14.1 交易金额求和（COUNTER + MONEY）

```json
{
  "type": "COUNTER", "agg": "SUM", "field": "$amount",
  "source": { "eventTypes": ["transaction"], "filter": { "type": "DEBIT" } },
  "window": { "kind": "FIXED", "size": 5, "unit": "MINUTE" },
  "dimensions": ["accountId"],
  "valueEncoding": "MONEY"
}
```

### 14.2 登录失败率（RATIO）

```json
{
  "type": "RATIO",
  "derivation": {
    "kind": "RATIO",
    "numerator": { "kind": "METRIC_REF", "metricId": "login_fail_count" },
    "denominator": { "kind": "METRIC_REF", "metricId": "login_total_count" }
  },
  "window": { "kind": "FIXED", "size": 5, "unit": "MINUTE" },
  "dimensions": ["accountId"],
  "valueEncoding": "RATIO"
}
```

### 14.3 组合派生（DERIVED）

```json
{
  "type": "DERIVED",
  "derivation": {
    "kind": "ARITHMETIC", "op": "SUB",
    "lhs": { "kind": "METRIC_REF", "metricId": "debit_sum" },
    "rhs": { "kind": "METRIC_REF", "metricId": "credit_sum" }
  },
  "window": { "kind": "FIXED", "size": 5, "unit": "MINUTE" },
  "dimensions": ["accountId"],
  "valueEncoding": "MONEY"
}
```

## 15. 基线规格（Baseline Spec）

> 本部分为基线（Baseline）的权威规格。Baseline Engine 独立于 Metric Engine（《工程设计基线》§7.2）：指标计算产出一系列历史 `MetricResult`，由 Baseline Engine 汇总为基线统计量，供 DOC-10 §6 动态阈值比较使用。字段级 DTO 见 DOC-06 §6.3，配置文件装载见 DOC-14 §4.7。

### 15.1 概述与作用域

- 基线是「基于历史 MetricResult 的统计基线」，不是普通指标；其计算引擎独立于 Metric Engine。
- 本文档是 Baseline 语义的单一权威（one home）；DOC-06 §6.3 只承接其 DTO，DOC-10 §6 只引用其统计量，DOC-14 §4.7 只规定配置文件装载。

### 15.2 基线生命周期状态机

状态集合：`Candidate / Active / Frozen`（CamelCase）。

| 当前态 | 事件/条件 | 目标态 |
| ------ | --------- | ------ |
| Candidate | 样本量 ≥ `minSampleSize` 且数据质量达标 | Active |
| Active | 滚动更新（新窗口纳入） | Active（原地滚动，version 不变） |
| Active | 定义变更 / 发布冻结 | Frozen |
| Frozen | 仅可读，不再滚动 | （终态） |

- 数据不足只停留在 `Candidate`，不进入异常态；`Unknown` 语义不适用于 Baseline。
- 状态持久化对齐 DOC-06 §6.3 `BaselineState`（三态）。

### 15.3 最小样本量判定（minSampleSize）

- `minSampleSize`：激活为 `Active` 的最小历史窗口样本数（对齐 DOC-06 §6.3）。
- 判定：历史 `MetricResult` 数量 ≥ `minSampleSize` 且 `dataQuality` 均为 NORMAL/PARTIAL 才可激活。
- 未达要求维持 `Candidate`；下游动态阈值不得静默回退为固定阈值（fail-closed，DOC-10 §6）。

### 15.4 统计量算法

| 方法 | 定义 | 参数 | 样本量要求 | 异常值处理 |
| ---- | ---- | ---- | ---- | ---- |
| STDDEV | 均值 ± `factor` × 标准差（σ） | factor>0 | ≥ minSampleSize | 超出 3σ 样本可按策略剔除 |
| PERCENTILE | 第 `factor` 分位 | factor∈(0,100) | ≥ minSampleSize | 插值分位，稳健 |
| ZSCORE | (x − μ) / σ，超 `factor` 判定异常 | factor>0 | ≥ minSampleSize | 同 STDDEV |

- `BaselineMethod`（STDDEV/PERCENTILE/ZSCORE）三值由 DOC-10 §6 引用；本文档为算法语义权威。
- 金额类基线统计量走定点运算（DOC-06 §2.2.1）。

### 15.5 基线窗口与滚动更新

- 基线基于滚动时间窗口（rolling window）维护；窗口大小/步长由定义声明。
- 滚动更新：新窗口 `MetricResult` 纳入后重算统计量，`version` 不变；历史窗口按策略淘汰。
- 版本推进：定义语义变化（窗口、算法、`minSampleSize`）变更 `version`，旧基线可 `Frozen` 保留追溯。

### 15.6 与 Metric Engine 调用关系

- Metric Engine 按本文档 §2～§14 计算并持久化 `MetricResult`（含 `windowStart/windowEnd/dataQuality`）。
- Baseline Engine 读取同指标历史 `MetricResult`（经 MetricResultRepository），按 §15.4 算法求基线统计量，产出并持久化 `Baseline`（DOC-06 §6.3）。
- 二者职责不重叠：Metric 算点值，Baseline 算历史分布。

### 15.7 求值与校验规则

- 确定性：同一历史样本 + 同 `version` → 同一基线统计量。
- 校验：`minSampleSize`/窗口/算法/`factor` 合法；样本 `dataQuality` 达标；金额 `scale` 一致。失败 fail-closed。

### 15.8 基线定义示例

```yaml
baselineId: txn_amt_baseline
metricId: transaction_amount_5m
window: { kind: FIXED, size: 5, unit: MINUTE }
rollup: { size: 30, unit: DAY }
minSampleSize: 30
method: STDDEV
factor: 3
```

> 字段口径：本节示例为**基线定义（配置）**（BaselineDefinition 的定义参数），非「Baseline 结果对象」。
> - 定义参数：`metricId`、`window`（复用 `WindowSpec`，§8.1）、`rollup`（回溯样本窗口：固定回溯 `size/unit`）、`method`（`BaselineMethod`）、`factor`、`minSampleSize`。
> - 计算结果对象：DOC-06 §6.3 `Baseline`（`baselineId/tenantId/state/statistics/version` 等），持久化基线状态与统计量。
> - 二者分离：定义变更（窗口/算法/`minSampleSize`）推进 `DefinitionVersion`；结果对象按 §15.2 状态机流转（Candidate/Active/Frozen）。

## 16. 与下游文档边界与追踪

| 本文档输出 | 下游承接 |
| ---- | ---- |
| MetricSpec 语法与 AST | MOD-METRIC-001 编译/求值实现 + DOC-15 测试 |
| filter/aggregation/derivation 语义 | DOC-04（采集编排）、DOC-11（幂等/恢复） |
| MetricDefinition.expression 承载 | DOC-14（配置文件 Schema） |
| 金额/时间序列化实现 | DOC-06（值类型）+ 实现 |
| Baseline 状态机/样本量/统计量算法（§15） | Baseline Engine 实现 + DOC-15 测试 |
| Baseline 统计量 → 动态阈值 | DOC-10 §6 |
| baselines/*.yml 装载 | DOC-14 §4.7 |

需求追踪：每个指标 DSL 与基线能力映射回 SYS-MON-001～008 与 BR-001～003（完整追踪表见 DOC-18）。

## 附录 A：版本与文档状态

| 版本 | 状态 | 说明 |
| ---- | ---- | ---- |
| V1.0-Baseline | Frozen | 冻结基线，开发启动依据 |

本文档已冻结，基线版本 `V1.0-Baseline`，作为开发启动依据。

**文档结束。**