---
description: 企业级风险监控 Agent 插件骨架，暴露只读工具 get_monitor_health。
kind: package-reference
---

# @deepseek-ai/dsh-risk-agent

[English](README.md) | 中文

## Summary

@deepseek-ai/dsh-risk-agent 是企业级风险监控 Agent 插件：装载即注册只读、幂等的 `get_monitor_health` 工具，卸载即连同其注册一并注销。

## Table of Contents

- Use this package
- Understand the implementation
- Dev Note

## Use this package

在部署用 `cordis.yml` 中加入该插件：

```yaml
- name: '@deepseek-ai/dsh-risk-agent'
```

插件声明 `inject: ['tools']` 与空的 schemastery `Config`；当前不存在任何配置键。

## Understand the implementation

- `src/plugin/index.ts` 是唯一面向 Cordis 的装配点，也是唯一 import `@deepseek-ai/cordis` 的模块。
- `src/tools/get-monitor-health.ts` 持有工具定义、单点定义的 `MONITOR_HEALTH_VALUES` 枚举与零覆盖快照构造器。
- 未配置任何组件或数据源时，工具返回 `UNKNOWN`、覆盖计数全 0、`dataSources` 为空数组；未配置的部署永远不会被读作健康。
- `tests/layering.spec.ts` 机械化强制分层红线：依赖方向 `plugin → application → domain`、纯化的 `domain/`、Tool Handler 不触 Repository。

## Dev Note

未发布：尚不属于任何已发布配置。包级规则见 [AGENTS.md](AGENTS.md)。

## Model Experience

### get_monitor_health tool

#### What the model sees

只读工具 `get_monitor_health` 及可选过滤入参 `components`、`dataSources`、`tenantId`；结果携带 `health`、`plugin` 运行时长、`dataSources` 与四项 `coverage` 计数。

#### Token effect

固定的工具定义；每次调用仅追加一份紧凑的健康快照。

#### KV Cache effect

仅追加：工具定义跨轮次保持稳定，每次结果与普通工具结果一样追加。

## Known Limitations and Deferred Work

- 尚无采集器、Repository、阈值与租户能力；`tenantId` 是契约保留提示，当前被忽略。
- `Config` 是空 schema，待 DOC-14 的配置字段落地。
