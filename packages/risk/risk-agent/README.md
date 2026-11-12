---
description: Enterprise risk-monitoring agent plugin skeleton exposing the read-only get_monitor_health tool.
kind: package-reference
---

# @deepseek-ai/dsh-risk-agent

English | [中文](README.zh.md)

## Summary

@deepseek-ai/dsh-risk-agent is the enterprise risk-monitoring agent plugin: loading it registers the read-only, idempotent `get_monitor_health` tool, and unloading deregisters the tool with its registrations.

## Table of Contents

- Use this package
- Understand the implementation
- Dev Note

## Use this package

Add the plugin to a deployment `cordis.yml`:

```yaml
- name: '@deepseek-ai/dsh-risk-agent'
```

The plugin declares `inject: ['tools']` and an empty schemastery `Config`; no configuration keys exist yet.

## Understand the implementation

- `src/plugin/index.ts` is the only Cordis-facing assembly point and the only module importing `@deepseek-ai/cordis`.
- `src/tools/get-monitor-health.ts` owns the tool definition, the single-source `MONITOR_HEALTH_VALUES` enum, and the zero-coverage snapshot builder.
- With no components or data sources configured, the tool reports `UNKNOWN` with zero coverage counts and an empty `dataSources` list; an unconfigured deployment never reads as healthy.
- `tests/layering.spec.ts` mechanically enforces the layering red lines: dependency direction `plugin → application → domain`, a pure `domain/`, and tool handlers that never touch repositories.

## Dev Note

Unreleased: not yet part of any shipped profile. Package rules live in [AGENTS.md](AGENTS.md).

## Model Experience

### get_monitor_health tool

#### What the model sees

The read-only `get_monitor_health` tool with optional `components`, `dataSources`, and `tenantId` filters; results carry `health`, `plugin` uptime, `dataSources`, and four `coverage` counts.

#### Token effect

Fixed tool definition; each call appends one compact health snapshot.

#### KV Cache effect

Append-only: the tool definition is stable across turns and each result appends like any tool result.

## Known Limitations and Deferred Work

- No collectors, repositories, thresholds, or tenancy exist yet; `tenantId` is a reserved contract hint and is ignored.
- `Config` is an empty schema until the DOC-14 configuration fields land.
