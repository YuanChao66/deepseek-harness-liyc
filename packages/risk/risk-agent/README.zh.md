---
description: 企业级风险监控 Agent 插件骨架，暴露只读工具 get_monitor_health。
kind: package-reference
---

# @deepseek-ai/dsh-risk-agent

[English](README.md) | 中文

## 概述

@deepseek-ai/dsh-risk-agent 是企业级风险监控 Agent 插件：装载即注册只读、幂等的 `get_monitor_health` 工具，卸载即连同其注册一并注销。

## 目录

- 使用本包
- 理解实现
- 开发备注

## 使用本包

在部署用 `cordis.yml` 中加入该插件：

```yaml
- name: '@deepseek-ai/dsh-risk-agent'
  config:
    concurrencyBudget:
      queueBacklog: 100 # TBD-002: replace once the load-test baseline lands
```

插件声明 `inject: ['tools']`，并在注册任何内容前按 DOC-14 顶层 Schema 校验 `Config`；未知字段、越界值、引用缺失与配置审计被关闭都会以字段路径 fail-loud。`concurrencyBudget.queueBacklog` 无默认值（TBD-002），必须由部署方提供。

## 理解实现

- `src/plugin/index.ts` 是唯一面向 Cordis 的装配点，也是唯一 import `@deepseek-ai/cordis` 的模块。
- `src/application/config/` 负责 Schema 校验、跨字段不变量、不可变版本化快照、LKG 回退与配置审计。
- `src/application/security/` 只从可信身份建立租户上下文；声称的 `tenantId` 仅用于比对，绝不被信任。
- `src/domain/tenant/` 定义不可变的 `TenantContext`。
- `src/tools/get-monitor-health.ts` 持有工具定义、单点定义的 `MONITOR_HEALTH_VALUES` 枚举与零覆盖快照构造器。
- 未配置任何组件或数据源时，工具返回 `UNKNOWN`、覆盖计数全 0、`dataSources` 为空数组；未配置的部署永远不会被读作健康。
- `tests/layering.spec.ts` 机械化强制分层红线：依赖方向 `plugin → application → domain`、纯化的 `domain/`、Tool Handler 不触 Repository。

## 开发备注

未发布：尚不属于任何已发布配置。包级规则见 [AGENTS.md](AGENTS.md)。

## 模型体验

### get_monitor_health 工具

#### 模型看到什么

只读工具 `get_monitor_health` 及可选过滤入参 `components`、`dataSources`、`tenantId`；`tenantId` 与可信身份不一致时调用失败；结果携带 `health`、`plugin` 运行时长、`dataSources` 与四项 `coverage` 计数。

#### Token 影响

固定的工具定义；每次调用仅追加一份紧凑的健康快照。

#### KV Cache 影响

仅追加：工具定义跨轮次保持稳定，每次结果与普通工具结果一样追加。

## 已知限制与延期工作

- 采集器、Repository、阈值与指标尚未实现；`tenantId` 已与可信身份比对，不一致即返回 `AuthorizationError`。
- 指标、规则与通知渠道的跨文件引用校验延后到工单 06 与 07。
- `concurrencyBudget.queueBacklog`（TBD-002）与 `observability.metricReportTarget`（TBD-001）保留文档约定的待定默认值标记。
